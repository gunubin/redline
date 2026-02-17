import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendEvent,
  getEvents,
  buildIneffectiveSeqs,
  findLastEffective,
  findLastUndone,
  canUndo,
  canRedo,
  hashContent,
  _resetStore,
} from '../src/agent/history.js';

const FILE = '/tmp/test-file.md';

describe('history', () => {
  beforeEach(() => {
    _resetStore();
  });

  describe('appendEvent + getEvents', () => {
    it('ラウンドトリップ', () => {
      const ev = appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 3,
        original: 'aaa\nbbb\nccc',
        modified: 'xxx\nyyy',
        originalLineCount: 3,
        modifiedLineCount: 2,
        hashBefore: 'h0',
        hashAfter: 'h1',
      });

      assert.equal(ev.seq, 1);
      assert.ok(ev.timestamp > 0);

      const events = getEvents(FILE);
      assert.equal(events.length, 1);
      assert.deepEqual(events[0], ev);
    });

    it('seq は自動インクリメント', () => {
      appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 1,
        original: 'a',
        modified: 'b',
        originalLineCount: 1,
        modifiedLineCount: 1,
        hashBefore: 'h0',
        hashAfter: 'h1',
      });
      const ev2 = appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 1,
        original: 'b',
        modified: 'c',
        originalLineCount: 1,
        modifiedLineCount: 1,
        hashBefore: 'h1',
        hashAfter: 'h2',
      });
      assert.equal(ev2.seq, 2);
    });
  });

  describe('buildIneffectiveSeqs', () => {
    it('undo で target が無効化される', () => {
      const events = [
        makeEvent(1),
        makeEvent(2, { _undo: true, _undoTarget: 1 }),
      ];
      const ineffective = buildIneffectiveSeqs(events);
      assert.ok(ineffective.has(1));
      assert.ok(!ineffective.has(2));
    });

    it('redo で undo が無効化される', () => {
      const events = [
        makeEvent(1),
        makeEvent(2, { _undo: true, _undoTarget: 1 }),
        makeEvent(3, { _redo: true, _redoTarget: 2 }),
      ];
      const ineffective = buildIneffectiveSeqs(events);
      assert.ok(ineffective.has(1)); // targeted by undo
      assert.ok(ineffective.has(2)); // targeted by redo
      assert.ok(!ineffective.has(3));
    });
  });

  describe('findLastEffective', () => {
    it('無効化イベントをスキップ', () => {
      const events = [
        makeEvent(1),
        makeEvent(2),
        makeEvent(3, { _undo: true, _undoTarget: 2 }),
      ];
      const ineffective = buildIneffectiveSeqs(events);
      const target = findLastEffective(events, ineffective);
      assert.equal(target?.seq, 1);
    });

    it('redo イベントも候補になる', () => {
      const events = [
        makeEvent(1),
        makeEvent(2, { _undo: true, _undoTarget: 1 }),
        makeEvent(3, { _redo: true, _redoTarget: 2 }),
      ];
      const ineffective = buildIneffectiveSeqs(events);
      const target = findLastEffective(events, ineffective);
      assert.equal(target?.seq, 3);
    });
  });

  describe('findLastUndone', () => {
    it('redo 済み undo をスキップ', () => {
      const events = [
        makeEvent(1),
        makeEvent(2, { _undo: true, _undoTarget: 1 }),
        makeEvent(3, { _redo: true, _redoTarget: 2 }),
      ];
      const ineffective = buildIneffectiveSeqs(events);
      const undone = findLastUndone(events, ineffective);
      assert.equal(undone, undefined);
    });

    it('有効な undo を返す', () => {
      const events = [
        makeEvent(1),
        makeEvent(2),
        makeEvent(3, { _undo: true, _undoTarget: 2 }),
      ];
      const ineffective = buildIneffectiveSeqs(events);
      const undone = findLastUndone(events, ineffective);
      assert.equal(undone?.seq, 3);
    });
  });

  describe('canUndo / canRedo', () => {
    it('apply 後は canUndo=true, canRedo=false', () => {
      appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 1,
        original: 'a',
        modified: 'b',
        originalLineCount: 1,
        modifiedLineCount: 1,
        hashBefore: 'h0',
        hashAfter: 'h1',
      });
      assert.equal(canUndo(FILE), true);
      assert.equal(canRedo(FILE), false);
    });

    it('undo 後は canUndo=false, canRedo=true', () => {
      appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 1,
        original: 'a',
        modified: 'b',
        originalLineCount: 1,
        modifiedLineCount: 1,
        hashBefore: 'h0',
        hashAfter: 'h1',
      });
      appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 1,
        original: 'b',
        modified: 'a',
        originalLineCount: 1,
        modifiedLineCount: 1,
        hashBefore: 'h1',
        hashAfter: 'h0',
        meta: { _undo: true, _undoTarget: 1 },
      });
      assert.equal(canUndo(FILE), false);
      assert.equal(canRedo(FILE), true);
    });
  });

  describe('複数ファイル', () => {
    it('独立して動作する', () => {
      const file2 = '/tmp/test-file2.md';
      appendEvent(FILE, {
        filePath: FILE,
        startLine: 1,
        endLine: 1,
        original: 'a',
        modified: 'b',
        originalLineCount: 1,
        modifiedLineCount: 1,
        hashBefore: 'h0',
        hashAfter: 'h1',
      });
      assert.equal(canUndo(FILE), true);
      assert.equal(canUndo(file2), false);
      assert.equal(getEvents(file2).length, 0);
    });
  });

  describe('hashContent', () => {
    it('SHA-256 ハッシュを返す', () => {
      const hash = hashContent('hello');
      assert.equal(hash.length, 64);
      assert.equal(hash, hashContent('hello'));
      assert.notEqual(hash, hashContent('world'));
    });
  });
});

// --- Helper ---
function makeEvent(seq: number, meta?: Record<string, unknown>) {
  return {
    seq,
    filePath: FILE,
    startLine: 1,
    endLine: 1,
    original: 'a',
    modified: 'b',
    originalLineCount: 1,
    modifiedLineCount: 1,
    hashBefore: 'h0',
    hashAfter: 'h1',
    timestamp: Date.now(),
    meta,
  } as any;
}
