import { resolve, relative, basename, extname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
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
    if (!existsSync(overlayPath)) {
      return c.text('Overlay not built. Run: npm run build:overlay', 500);
    }
    const js = readFileSync(overlayPath, 'utf-8');
    return c.body(js, 200, { 'Content-Type': 'application/javascript' });
  });

  // File listing
  app.get('/', (c) => {
    const files = listMarkdownFiles(rootDir);
    return c.html(renderFileListHtml(files));
  });

  // Serve Markdown files as HTML
  app.get('/*', async (c) => {
    const urlPath = decodeURIComponent(c.req.path.slice(1)); // remove leading /
    if (!urlPath) {
      return c.redirect('/');
    }

    const filePath = resolveFilePath(rootDir, urlPath);
    if (!filePath) {
      return c.text('Not found', 404);
    }

    const source = readFileSync(filePath, 'utf-8');
    const html = await renderMarkdown(source);
    const relPath = relative(rootDir, filePath);
    const title = basename(filePath, extname(filePath));
    const files = listMarkdownFiles(rootDir);
    const page = wrapInHtml(html, title, relPath, files);
    return c.html(page);
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
    execFile('open', [`http://localhost:${opts.port}`]);
  }
}
