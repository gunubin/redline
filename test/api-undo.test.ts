import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerApiRoutes } from '../src/server/api.js';
import { _resetStore } from '../src/agent/history.js';

const TEST_DIR = join(import.meta.dirname ?? '.', '__api_undo_test__');
const TEST_FILE = 'test.md';

function makeApp(): Hono {
  const app = new Hono();
  registerApiRoutes(app, TEST_DIR);
  return app;
}

function req(app: Hono, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init);
}

describe('/api/undo & /api/redo', () => {
  let app: Hono;

  beforeEach(() => {
    _resetStore();
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, TEST_FILE), 'line1\nline2\nline3\n', 'utf-8');
    app = makeApp();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('apply → undo → ファイル復元', async () => {
    // Apply: replace line2 with MODIFIED
    const applyRes = await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'MODIFIED',
    });
    assert.equal(applyRes.status, 200);

    const afterApply = readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8');
    assert.equal(afterApply, 'line1\nMODIFIED\nline3\n');

    // Undo
    const undoRes = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    assert.equal(undoRes.status, 200);

    const afterUndo = readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8');
    assert.equal(afterUndo, 'line1\nline2\nline3\n');
  });

  it('undo → redo → 再適用', async () => {
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'MODIFIED',
    });

    await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });

    // Redo
    const redoRes = await req(app, 'POST', '/api/redo', { filePath: TEST_FILE });
    assert.equal(redoRes.status, 200);

    const afterRedo = readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8');
    assert.equal(afterRedo, 'line1\nMODIFIED\nline3\n');
  });

  it('空ログで undo → 400', async () => {
    const res = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'Nothing to undo');
  });

  it('外部変更検出 → 409', async () => {
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'MODIFIED',
    });

    // Simulate external edit
    writeFileSync(join(TEST_DIR, TEST_FILE), 'externally\nchanged\n', 'utf-8');

    const res = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    assert.equal(res.status, 409);
  });

  it('apply → undo → apply → redo 不可（ハッシュ不一致）', async () => {
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'FIRST',
    });

    await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });

    // New apply
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 1,
      endLine: 1,
      modified: 'NEWLINE1',
    });

    // Redo should fail with 409
    const redoRes = await req(app, 'POST', '/api/redo', { filePath: TEST_FILE });
    assert.equal(redoRes.status, 409);
  });

  it('history-state が正しい状態を返す', async () => {
    // Initially: canUndo=false, canRedo=false
    const res1 = await app.request(`/api/history-state?filePath=${TEST_FILE}`);
    const data1 = await res1.json();
    assert.equal(data1.canUndo, false);
    assert.equal(data1.canRedo, false);

    // After apply: canUndo=true
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 1,
      endLine: 1,
      modified: 'X',
    });
    const res2 = await app.request(`/api/history-state?filePath=${TEST_FILE}`);
    const data2 = await res2.json();
    assert.equal(data2.canUndo, true);
    assert.equal(data2.canRedo, false);

    // After undo: canRedo=true
    await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    const res3 = await app.request(`/api/history-state?filePath=${TEST_FILE}`);
    const data3 = await res3.json();
    assert.equal(data3.canUndo, false);
    assert.equal(data3.canRedo, true);
  });

  it('multiline apply → undo で行数が復元される', async () => {
    // Replace line2 with 3 lines
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'new2a\nnew2b\nnew2c',
    });

    const afterApply = readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8');
    assert.equal(afterApply, 'line1\nnew2a\nnew2b\nnew2c\nline3\n');

    await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });

    const afterUndo = readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8');
    assert.equal(afterUndo, 'line1\nline2\nline3\n');
  });

  it('複数回の連続 undo（apply A → apply B → undo B → undo A）', async () => {
    // Apply A: replace line1
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 1,
      endLine: 1,
      modified: 'ALPHA',
    });
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'ALPHA\nline2\nline3\n');

    // Apply B: replace line3
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 3,
      endLine: 3,
      modified: 'BETA',
    });
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'ALPHA\nline2\nBETA\n');

    // Undo B
    const undo1 = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    assert.equal(undo1.status, 200);
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'ALPHA\nline2\nline3\n');

    // Undo A
    const undo2 = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    assert.equal(undo2.status, 200);
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'line1\nline2\nline3\n');
  });

  it('逆方向の行数変化（3行→1行に変更後の undo で3行復元）', async () => {
    // Write a 5-line file
    writeFileSync(join(TEST_DIR, TEST_FILE), 'a\nb\nc\nd\ne\n', 'utf-8');

    // Replace lines 2-4 (3 lines) with single line
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 4,
      modified: 'SINGLE',
    });
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'a\nSINGLE\ne\n');

    // Undo should restore 3 lines
    const undoRes = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    assert.equal(undoRes.status, 200);
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'a\nb\nc\nd\ne\n');

    // Redo should collapse back to single line
    const redoRes = await req(app, 'POST', '/api/redo', { filePath: TEST_FILE });
    assert.equal(redoRes.status, 200);
    assert.equal(readFileSync(join(TEST_DIR, TEST_FILE), 'utf-8'), 'a\nSINGLE\ne\n');
  });

  it('空ログで redo → 400', async () => {
    const res = await req(app, 'POST', '/api/redo', { filePath: TEST_FILE });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'Nothing to redo');
  });

  it('redo 前の外部変更検出 → 409', async () => {
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'MODIFIED',
    });
    await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });

    // Simulate external edit after undo
    writeFileSync(join(TEST_DIR, TEST_FILE), 'externally\nchanged\n', 'utf-8');

    const res = await req(app, 'POST', '/api/redo', { filePath: TEST_FILE });
    assert.equal(res.status, 409);
  });

  it('undo レスポンスに scrollHint が含まれる', async () => {
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'MODIFIED',
    });

    const undoRes = await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });
    const undoData = await undoRes.json();
    assert.equal(undoData.success, true);
    assert.ok(typeof undoData.scrollHint === 'string');
    assert.ok(undoData.scrollHint.includes('line2'));
  });

  it('redo レスポンスに scrollHint が含まれる', async () => {
    await req(app, 'POST', '/api/apply', {
      filePath: TEST_FILE,
      startLine: 2,
      endLine: 2,
      modified: 'MODIFIED',
    });
    await req(app, 'POST', '/api/undo', { filePath: TEST_FILE });

    const redoRes = await req(app, 'POST', '/api/redo', { filePath: TEST_FILE });
    const redoData = await redoRes.json();
    assert.equal(redoData.success, true);
    assert.ok(typeof redoData.scrollHint === 'string');
    assert.ok(redoData.scrollHint.includes('MODIFIED'));
  });

  it('filePath 未指定で undo → 400', async () => {
    const res = await req(app, 'POST', '/api/undo', {});
    assert.equal(res.status, 400);
  });

  it('filePath 未指定で redo → 400', async () => {
    const res = await req(app, 'POST', '/api/redo', {});
    assert.equal(res.status, 400);
  });
});
