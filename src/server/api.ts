import { readFileSync, writeFileSync } from 'node:fs';
import type { Hono } from 'hono';
import { resolveFilePath, findInSource } from '../matcher/index.js';
import { ClaudeCodeAgent } from '../agent/claude.js';
import { validateFilePath } from '../security.js';

export function registerApiRoutes(app: Hono, rootDir: string): void {
  const agent = new ClaudeCodeAgent();

  app.post('/api/edit', async (c) => {
    let body: { filePath: string; selectedText: string; instruction: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const { filePath, selectedText, instruction } = body;

    if (!filePath || !selectedText || !instruction) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const resolved = resolveFilePath(rootDir, filePath);
    if (!resolved) {
      return c.json({ error: `File not found: ${filePath}` }, 404);
    }

    try {
      const match = findInSource(resolved, selectedText);
      if (!match) {
        return c.json({ error: 'ソース内にテキストが見つかりません。' }, 404);
      }

      const fullSource = readFileSync(resolved, 'utf-8');
      const modified = await agent.edit({
        fullSource,
        matchedSource: match.matchedSource,
        selectedText,
        startLine: match.startLine,
        endLine: match.endLine,
        instruction,
        fileKey: filePath,
      });

      return c.json({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        original: match.matchedSource,
        modified,
        startLine: match.startLine,
        endLine: match.endLine,
        filePath: match.filePath,
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
    let body: { filePath: string; startLine: number; endLine: number; modified: string };
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

      const modifiedLines = modified.split('\n');
      lines.splice(startLine - 1, endLine - startLine + 1, ...modifiedLines);
      writeFileSync(absPath, lines.join('\n'), 'utf-8');
      return c.json({ success: true });
    } catch (err) {
      console.error(`[redline-ai] /api/apply failed for ${filePath}:`, err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        500,
      );
    }
  });

  app.post('/api/reset-session', async (c) => {
    let body: { filePath: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    const absPath = validateFilePath(rootDir, body.filePath);
    if (!absPath) {
      return c.json({ error: 'Invalid file path' }, 403);
    }
    agent.resetSession(body.filePath);
    return c.json({ success: true });
  });
}
