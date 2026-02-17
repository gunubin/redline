import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import httpProxy from 'http-proxy';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadConfig } from '../config.js';
import { RouteMap } from '../route-map.js';
import { registerApiRoutes } from './api.js';
import { setupHMR } from './hmr.js';

export interface ProxyOptions {
  target?: string;
  root?: string;
  configPath: string;
  port: number;
  host: string;
}

export async function startProxyMode(opts: ProxyOptions): Promise<void> {
  // Load config
  const config = loadConfig(opts.configPath);

  const target = opts.target ?? config?.proxy.target;
  const root = opts.root ?? config?.proxy.root;

  if (!target) {
    console.error('Error: --target is required (or set in redline.toml [proxy] target)');
    process.exit(1);
  }

  if (!root) {
    console.error('Error: --root is required (or set in redline.toml [proxy] root)');
    process.exit(1);
  }

  const rootDir = resolve(root);  // config already resolves relative to config file
  const routes = config?.proxy.routes ?? [];
  const routeMap = new RouteMap(routes);

  // Create Hono app for API routes
  const app = new Hono();
  app.use('*', cors({
    origin: (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null,
  }));
  registerApiRoutes(app, rootDir, config?.agent);

  // Serve overlay JS via Hono
  app.get('/__redline/overlay.js', (c) => {
    const overlayPath = resolve(import.meta.dirname, '../../overlay/dist/overlay.js');
    try {
      const js = readFileSync(overlayPath, 'utf-8');
      return c.body(js, 200, { 'Content-Type': 'application/javascript' });
    } catch {
      return c.text('Overlay not built. Run: npm run build:overlay', 500);
    }
  });

  // Create http-proxy (selfHandleResponse so we can inject into HTML)
  const proxy = httpProxy.createProxyServer({ target, changeOrigin: true, selfHandleResponse: true });

  // Create raw HTTP server for proxy mode
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    // Route redline-specific paths to Hono
    if (url.startsWith('/__redline/') || url.startsWith('/api/')) {
      const honoReq = new Request(`http://localhost${url}`, {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
        body: ['GET', 'HEAD'].includes(req.method ?? 'GET')
          ? undefined
          : (req as unknown as ReadableStream),
        // @ts-expect-error -- Node fetch supports duplex
        duplex: 'half',
      });

      Promise.resolve(app.fetch(honoReq)).then(async (honoRes: Response) => {
        res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()));
        const body = await honoRes.arrayBuffer();
        res.end(Buffer.from(body));
      }).catch((err) => {
        console.error('[redline-ai] Internal Hono handler error:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal error');
        }
      });
      return;
    }

    // Proxy all other requests to target
    proxy.web(req, res, {}, (err) => {
      console.error(`[proxy] Error: ${err.message}`);
      res.writeHead(502);
      res.end('Bad Gateway');
    });
  });

  // Inject overlay into HTML responses from proxy
  proxy.on('proxyRes', (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] ?? '';
    const isHtml = contentType.includes('text/html');

    if (!isHtml) {
      // Pass through non-HTML responses
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }

    // Buffer HTML response to inject overlay
    const chunks: Buffer[] = [];
    proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
    proxyRes.on('end', () => {
      let html = Buffer.concat(chunks).toString('utf-8');

      // Resolve filePath from URL
      const urlPath = req.url ?? '/';
      const filePath = routeMap.resolve(urlPath) ?? '';

      // Inject config + Tailwind CDN + theme + overlay before </body>
      const injection = `
<script>
window.__REDLINE_CONFIG = {
  apiBase: "",
  filePath: ${JSON.stringify(filePath)},
  articleSelector: "body"
};
</script>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ctp: {
          base: '#1e1e2e',
          mantle: '#181825',
          crust: '#11111b',
          surface0: '#313244',
          surface1: '#45475a',
          surface2: '#585b70',
          overlay0: '#6c7086',
          overlay1: '#7f849c',
          subtext0: '#a6adc8',
          subtext1: '#bac2de',
          text: '#cdd6f4',
          mauve: '#cba6f7',
          lavender: '#b4befe',
          blue: '#89b4fa',
          sapphire: '#74c7ec',
          green: '#a6e3a1',
          yellow: '#f9e2af',
          peach: '#fab387',
          red: '#f38ba8',
          pink: '#f5c2e7',
        }
      }
    }
  }
}
</script>
<script src="/__redline/overlay.js"></script>`;

      html = html.replace('</body>', `${injection}\n</body>`);

      // Recalculate content-length
      const headers = { ...proxyRes.headers };
      delete headers['content-length'];
      delete headers['content-encoding']; // Remove compression since we modified content

      res.writeHead(proxyRes.statusCode ?? 200, headers);
      res.end(html);
    });
  });

  // Handle WebSocket upgrade for HMR
  setupHMR(server, rootDir);

  // Also proxy WebSocket upgrades that aren't HMR
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/__redline/hmr') {
      proxy.ws(req, socket, head);
    }
  });

  server.listen(opts.port, opts.host, () => {
    const displayHost = opts.host === '0.0.0.0' ? 'localhost' : opts.host;
    console.log(`[redline-ai] Proxy mode`);
    console.log(`[redline-ai] Target: ${target}`);
    console.log(`[redline-ai] Root: ${rootDir}`);
    console.log(`[redline-ai] http://${displayHost}:${opts.port}`);
  });
}
