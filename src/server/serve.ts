import { resolve, relative, basename, extname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import { listMarkdownFiles, resolveFilePath } from '../matcher/index.js';
import { renderMarkdown } from '../render/index.js';
import { wrapInHtml, renderFileListHtml } from '../render/template.js';
import { setupHMR } from './hmr.js';

export async function startServeMode(
  dir: string,
  opts: { port: number; open?: boolean },
): Promise<void> {
  const rootDir = resolve(dir);

  if (!existsSync(rootDir)) {
    console.error(`Error: Directory not found: ${rootDir}`);
    process.exit(1);
  }

  const app = createApp(rootDir);

  // Serve overlay JS
  app.get('/__redline/overlay.js', (c) => {
    const overlayPath = resolve(import.meta.dirname, '../../overlay/dist/overlay.js');
    try {
      const js = readFileSync(overlayPath, 'utf-8');
      return c.body(js, 200, { 'Content-Type': 'application/javascript' });
    } catch {
      return c.text('Overlay not built. Run: npm run build:overlay', 500);
    }
  });

  // File listing
  app.get('/', (c) => {
    const files = listMarkdownFiles(rootDir);
    return c.html(renderFileListHtml(files));
  });

  // Serve Markdown files as HTML
  app.get('/*', async (c) => {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(c.req.path.slice(1));
    } catch {
      return c.text('Invalid URL encoding', 400);
    }
    if (!urlPath) {
      return c.redirect('/');
    }

    const filePath = resolveFilePath(rootDir, urlPath);
    if (!filePath) {
      return c.text('Not found', 404);
    }

    try {
      const source = readFileSync(filePath, 'utf-8');
      const html = await renderMarkdown(source);
      const relPath = relative(rootDir, filePath);
      const title = basename(filePath, extname(filePath));
      const files = listMarkdownFiles(rootDir);
      const page = wrapInHtml(html, title, relPath, files);
      return c.html(page);
    } catch (err) {
      console.error(`[redline-ai] Failed to render ${filePath}:`, err);
      return c.text('Failed to render file', 500);
    }
  });

  const server = serve({
    fetch: app.fetch,
    port: opts.port,
    hostname: '127.0.0.1',
  }, (info) => {
    console.log(`[redline-ai] Serving ${rootDir}`);
    console.log(`[redline-ai] http://localhost:${info.port}`);
  });

  setupHMR(server as import('node:http').Server, rootDir);

  if (opts.open) {
    const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
    execFile(cmd, [`http://localhost:${opts.port}`], (err) => {
      if (err) {
        console.warn('[redline-ai] Could not open browser:', err.message);
      }
    });
  }
}
