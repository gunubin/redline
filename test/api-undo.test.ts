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
});
