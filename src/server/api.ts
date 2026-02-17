import { readFileSync, writeFileSync } from 'node:fs';
import type { Hono } from 'hono';
import { resolveFilePath, findInSource, findSection } from '../matcher/index.js';
import { ClaudeCodeAgent } from '../agent/claude.js';
import { validateFilePath } from '../security.js';
import type { AgentConfig } from '../config.js';
import {
  appendEvent,
  getEvents,
  buildIneffectiveSeqs,
  findLastEffective,
  findLastUndone,
  canUndo,
  canRedo,
  hashContent,
} from '../agent/history.js';

export function registerApiRoutes(app: Hono, rootDir: string, agentConfig?: AgentConfig): void {
  const agent = new ClaudeCodeAgent(agentConfig);

  app.post('/api/edit', async (c) => {
    let body: {
      filePath: string;
      selectedText?: string;
      instruction: string;
      mode?: 'selection' | 'file' | 'section';
      sectionHeading?: string;
      sectionLevel?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const { filePath, instruction, mode = 'selection' } = body;

    if (!filePath || !instruction) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    if (mode === 'selection' && !body.selectedText) {
      return c.json({ error: 'Missing selectedText for selection mode' }, 400);
    }

    if (mode === 'section' && (!body.sectionHeading || !body.sectionLevel)) {
      return c.json({ error: 'Missing sectionHeading/sectionLevel for section mode' }, 400);
    }

    const resolved = resolveFilePath(rootDir, filePath);
    if (!resolved) {
      return c.json({ error: `File not found: ${filePath}` }, 404);
    }

    try {
      const fullSource = readFileSync(resolved, 'utf-8');
      const lines = fullSource.split('\n');
      let matchedSource: string;
      let selectedText: string;
      let startLine: number;
      let endLine: number;

      if (mode === 'file') {
        matchedSource = fullSource;
        selectedText = fullSource;
        startLine = 1;
        endLine = lines.length;
      } else if (mode === 'section') {
        const sectionMatch = findSection(resolved, body.sectionHeading!, body.sectionLevel!);
        if (!sectionMatch) {
          return c.json({ error: 'セクションが見つかりません。' }, 404);
        }
        matchedSource = sectionMatch.matchedSource;
        selectedText = sectionMatch.matchedSource;
        startLine = sectionMatch.startLine;
        endLine = sectionMatch.endLine;
      } else {
        const match = findInSource(resolved, body.selectedText!);
        if (!match) {
          return c.json({ error: 'ソース内にテキストが見つかりません。' }, 404);
        }
        matchedSource = match.matchedSource;
        selectedText = body.selectedText!;
        startLine = match.startLine;
        endLine = match.endLine;
      }

      const modified = await agent.edit({
        fullSource,
        matchedSource,
        selectedText,
        startLine,
        endLine,
        instruction,
        fileKey: filePath,
      });

      return c.json({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        original: matchedSource,
        modified,
        startLine,
        endLine,
        filePath: resolved,
        mode,
      });
    } catch (err) {
      console.error(`[redline-ai] /api/edit failed for ${filePath}:`, err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        500,
      );
    }
  });

  app.post('/api/apply', async (c) => {
    let body: {
      filePath: string;
      startLine: number;
      endLine: number;
      modified: string;
      instruction?: string;
      mode?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const { filePath, startLine, endLine, modified } = body;

    if (!filePath || typeof startLine !== 'number' || typeof endLine !== 'number' || typeof modified !== 'string') {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const absPath = validateFilePath(rootDir, filePath);
    if (!absPath) {
      return c.json({ error: 'Invalid file path' }, 403);
    }

    try {
      const source = readFileSync(absPath, 'utf-8');
      const lines = source.split('\n');

      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) ||
          startLine < 1 || endLine < startLine || startLine > lines.length) {
        return c.json({
          error: `Invalid line range: L${startLine}-${endLine} (file has ${lines.length} lines)`,
        }, 400);
      }

      const hashBefore = hashContent(source);
      const original = lines.slice(startLine - 1, endLine).join('\n');
      const originalLineCount = endLine - startLine + 1;
      const modifiedLines = modified.split('\n');

      lines.splice(startLine - 1, originalLineCount, ...modifiedLines);
      const newSource = lines.join('\n');
      writeFileSync(absPath, newSource, 'utf-8');

      appendEvent(absPath, {
        filePath: absPath,
        startLine,
        endLine,
        original,
        modified,
        originalLineCount,
        modifiedLineCount: modifiedLines.length,
        hashBefore,
        hashAfter: hashContent(newSource),
        meta: { instruction: body.instruction, mode: body.mode },
      });

      return c.json({ success: true });
    } catch (err) {
      console.error(`[redline-ai] /api/apply failed for ${filePath}:`, err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        500,
      );
    }
  });

  app.post('/api/undo', async (c) => {
    let body: { filePath: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }

    if (!body.filePath || typeof body.filePath !== 'string') {
      return c.json({ error: 'Missing filePath in request body' }, 400);
    }

    const absPath = validateFilePath(rootDir, body.filePath);
    if (!absPath) {
      return c.json({ error: 'Invalid file path' }, 403);
    }

    try {
      const events = getEvents(absPath);
      const ineffective = buildIneffectiveSeqs(events);
      const target = findLastEffective(events, ineffective);
      if (!target) {
        return c.json({ error: 'Nothing to undo' }, 400);
      }

      const source = readFileSync(absPath, 'utf-8');
      const currentHash = hashContent(source);
      if (currentHash !== target.hashAfter) {
        return c.json({ error: 'File has been modified externally' }, 409);
      }

      const lines = source.split('\n');
      const originalLines = target.original.split('\n');
      lines.splice(target.startLine - 1, target.modifiedLineCount, ...originalLines);
      const newSource = lines.join('\n');
      writeFileSync(absPath, newSource, 'utf-8');

      appendEvent(absPath, {
        filePath: absPath,
        startLine: target.startLine,
        endLine: target.startLine + target.originalLineCount - 1,
        original: target.modified,
        modified: target.original,
        originalLineCount: target.modifiedLineCount,
        modifiedLineCount: target.originalLineCount,
        hashBefore: currentHash,
        hashAfter: hashContent(newSource),
        meta: { _undo: true, _undoTarget: target.seq },
      });

      const scrollHint = target.original.slice(0, 120).trim();
      return c.json({ success: true, message: 'Undo successful', scrollHint });
    } catch (err) {
      console.error(`[redline-ai] /api/undo failed for ${body.filePath}:`, err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        500,
      );
    }
  });

  app.post('/api/redo', async (c) => {
    let body: { filePath: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }

    if (!body.filePath || typeof body.filePath !== 'string') {
      return c.json({ error: 'Missing filePath in request body' }, 400);
    }

    const absPath = validateFilePath(rootDir, body.filePath);
    if (!absPath) {
      return c.json({ error: 'Invalid file path' }, 403);
    }

    try {
      const events = getEvents(absPath);
      const ineffective = buildIneffectiveSeqs(events);
      const undoEvent = findLastUndone(events, ineffective);
      if (!undoEvent) {
        return c.json({ error: 'Nothing to redo' }, 400);
      }

      if (!undoEvent.meta?._undoTarget) {
        return c.json({ error: 'Corrupted undo event: missing target reference' }, 500);
      }

      const originalEvent = events.find((e) => e.seq === undoEvent.meta!._undoTarget);
      if (!originalEvent) {
        return c.json({ error: 'Original event not found' }, 400);
      }

      const source = readFileSync(absPath, 'utf-8');
      const currentHash = hashContent(source);
      if (currentHash !== originalEvent.hashBefore) {
        return c.json({ error: 'File has been modified externally' }, 409);
      }

      const lines = source.split('\n');
      const modifiedLines = originalEvent.modified.split('\n');
      lines.splice(
        originalEvent.startLine - 1,
        originalEvent.originalLineCount,
        ...modifiedLines,
      );
      const newSource = lines.join('\n');
      writeFileSync(absPath, newSource, 'utf-8');

      appendEvent(absPath, {
        filePath: absPath,
        startLine: originalEvent.startLine,
        endLine: originalEvent.startLine + originalEvent.modifiedLineCount - 1,
        original: originalEvent.original,
        modified: originalEvent.modified,
        originalLineCount: originalEvent.originalLineCount,
        modifiedLineCount: originalEvent.modifiedLineCount,
        hashBefore: currentHash,
        hashAfter: hashContent(newSource),
        meta: { _redo: true, _redoTarget: undoEvent.seq },
      });

      const scrollHint = originalEvent.modified.slice(0, 120).trim();
      return c.json({ success: true, message: 'Redo successful', scrollHint });
    } catch (err) {
      console.error(`[redline-ai] /api/redo failed for ${body.filePath}:`, err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        500,
      );
    }
  });

  app.get('/api/history-state', async (c) => {
    const filePathParam = c.req.query('filePath');
    if (!filePathParam) {
      return c.json({ error: 'Missing filePath query parameter' }, 400);
    }

    const absPath = validateFilePath(rootDir, filePathParam);
    if (!absPath) {
      return c.json({ error: 'Invalid file path' }, 403);
    }

    return c.json({
      canUndo: canUndo(absPath),
      canRedo: canRedo(absPath),
    });
  });

  app.post('/api/reset-session', async (c) => {
    let body: { filePath: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    if (!body.filePath || typeof body.filePath !== 'string') {
      return c.json({ error: 'Missing filePath in request body' }, 400);
    }
    const absPath = validateFilePath(rootDir, body.filePath);
    if (!absPath) {
      return c.json({ error: 'Invalid file path' }, 403);
    }
    agent.resetSession(body.filePath);
    return c.json({ success: true });
  });
}
