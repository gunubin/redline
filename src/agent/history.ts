import { createHash } from 'node:crypto';

// --- Types ---

export interface EditMeta {
  _undo?: boolean;
  _undoTarget?: number;
  _redo?: boolean;
  _redoTarget?: number;
  instruction?: string;
  mode?: string;
}

export interface EditEvent {
  seq: number;
  filePath: string;
  startLine: number;
  endLine: number;
  original: string;
  modified: string;
  originalLineCount: number;
  modifiedLineCount: number;
  hashBefore: string;
  hashAfter: string;
  timestamp: number;
  meta?: EditMeta;
}

// --- In-memory store keyed by absolute file path ---

const store = new Map<string, EditEvent[]>();
let globalSeq = 0;

export function appendEvent(
  filePath: string,
  event: Omit<EditEvent, 'seq' | 'timestamp'>,
): EditEvent {
  const full: EditEvent = {
    ...event,
    seq: ++globalSeq,
    timestamp: Date.now(),
  };
  const events = store.get(filePath) ?? [];
  events.push(full);
  store.set(filePath, events);
  return full;
}

export function getEvents(filePath: string): EditEvent[] {
  return store.get(filePath) ?? [];
}

// --- Ineffective seq computation (perch pattern) ---

export function buildIneffectiveSeqs(events: EditEvent[]): Set<number> {
  const ineffective = new Set<number>();
  for (const e of events) {
    if (e.meta?._undo && e.meta._undoTarget != null) {
      ineffective.add(e.meta._undoTarget);
    }
    if (e.meta?._redo && e.meta._redoTarget != null) {
      ineffective.add(e.meta._redoTarget);
    }
  }
  return ineffective;
}

export function findLastEffective(
  events: EditEvent[],
  ineffective: Set<number>,
): EditEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (!ineffective.has(e.seq) && !e.meta?._undo) {
      return e;
    }
  }
  return undefined;
}

export function findLastUndone(
  events: EditEvent[],
  ineffective: Set<number>,
): EditEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (!ineffective.has(e.seq) && e.meta?._undo) {
      return e;
    }
  }
  return undefined;
}

export function canUndo(filePath: string): boolean {
  const events = getEvents(filePath);
  const ineffective = buildIneffectiveSeqs(events);
  return findLastEffective(events, ineffective) !== undefined;
}

export function canRedo(filePath: string): boolean {
  const events = getEvents(filePath);
  const ineffective = buildIneffectiveSeqs(events);
  return findLastUndone(events, ineffective) !== undefined;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// --- Testing helper ---

export function _resetStore(): void {
  store.clear();
  globalSeq = 0;
}
