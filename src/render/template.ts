interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  files: { name: string; path: string }[];
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map(), files: [] };

  for (const filePath of files.sort()) {
    const parts = filePath.split('/');
    const fileName = parts.pop()!;
    let current = root;

    for (const part of parts) {
      if (!current.children.has(part)) {
        const childPath = current.path ? `${current.path}/${part}` : part;
        current.children.set(part, { name: part, path: childPath, children: new Map(), files: [] });
      }
      current = current.children.get(part)!;
    }

    current.files.push({ name: fileName, path: filePath });
  }

  return root;
}

function renderTree(node: TreeNode, currentPath: string, depth: number = 0): string {
  const lines: string[] = [];

  const sortedDirs = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of sortedDirs) {
    const pad = depth * 0.75;
    const isAncestor = currentPath.startsWith(dir.path + '/') || currentPath === dir.path;
    const collapsedClass = isAncestor ? '' : 'collapsed';
    lines.push(`<div style="padding-left:${pad}rem" class="${collapsedClass}">
  <button onclick="this.parentElement.classList.toggle('collapsed')" class="flex items-center gap-1.5 py-2 text-ctp-subtext1 hover:text-ctp-text w-full text-left text-sm">
    <svg class="w-3.5 h-3.5 text-ctp-overlay0 transition-transform arrow-icon shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    <svg class="w-4 h-4 text-ctp-yellow/70 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
    <span class="truncate">${escapeHtml(dir.name)}</span>
    <span class="text-ctp-surface2 ml-auto shrink-0">${countFiles(dir)}</span>
  </button>
  <div class="folder-contents">${renderTree(dir, currentPath, depth + 1)}</div>
</div>`);
  }

  for (const file of sortedFiles) {
    const pad = depth * 0.75;
    const displayName = file.name.replace(/\.(md|mdx)$/, '');
    const isActive = file.path === currentPath;
    const activeClass = isActive ? 'bg-ctp-mauve/15 text-ctp-lavender' : 'text-ctp-subtext0 hover:text-ctp-lavender hover:bg-ctp-surface0/50';
    lines.push(`<div style="padding-left:${pad}rem">
  <a href="/${escapeHtml(file.path)}" class="flex items-center gap-1.5 py-2 text-sm rounded px-1 pl-4 truncate ${activeClass}">
    <svg class="w-4 h-4 text-ctp-surface2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
    <span class="truncate">${escapeHtml(displayName)}</span>
  </a>
</div>`);
  }

  return lines.join('\n');
}

function countFiles(node: TreeNode): number {
  let count = node.files.length;
  for (const child of node.children.values()) {
    count += countFiles(child);
  }
  return count;
}

function renderSidebar(files: string[], currentPath: string): string {
  const tree = buildTree(files);
  const treeHtml = renderTree(tree, currentPath);

  return `<aside id="sidebar" class="fixed inset-y-0 left-0 w-64 bg-ctp-mantle border-r border-ctp-surface0 flex flex-col z-40 transform transition-transform duration-200 lg:translate-x-0 -translate-x-full">
  <div class="flex items-center justify-between px-3 py-2 border-b border-ctp-surface0">
    <a href="/" class="text-ctp-mauve font-bold text-sm tracking-wide">redline-ai</a>
    <button id="sidebar-close" class="lg:hidden text-ctp-overlay0 hover:text-ctp-subtext1 p-1">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="flex-1 overflow-y-auto py-2 px-1 select-none sidebar-scroll">
${treeHtml}
  </div>
  <div class="px-3 py-2 border-t border-ctp-surface0 text-xs text-ctp-surface2">${files.length} files</div>
</aside>`;
}

const tailwindConfig = `<script>
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
  </script>`;

export function wrapInHtml(content: string, title: string, filePath: string, files: string[]): string {
  const escapedFilePath = escapeHtml(filePath);
  const escapedTitle = escapeHtml(title);
  const sidebar = renderSidebar(files, filePath);
  const wrappedContent = content
    .replace(/<table/g, '<div class="table-scroll"><table')
    .replace(/<\/table>/g, '</table></div>');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle} - redline-ai</title>
  <script src="https://cdn.tailwindcss.com"></script>
  ${tailwindConfig}
  <style>
    .collapsed .folder-contents { display: none; }
    .collapsed .arrow-icon { transform: rotate(-90deg); }
    .sidebar-scroll::-webkit-scrollbar { width: 4px; }
    .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
    .sidebar-scroll::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }
    .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #585b70; }
    #article-body { line-height: 1.8; }
    #article-body h1 { font-size: 2em; font-weight: 700; margin: 1.5em 0 0.5em; border-bottom: 1px solid #45475a; padding-bottom: 0.3em; }
    #article-body h2 { font-size: 1.5em; font-weight: 700; margin: 1.3em 0 0.4em; border-bottom: 1px solid #45475a; padding-bottom: 0.2em; }
    #article-body h3 { font-size: 1.25em; font-weight: 600; margin: 1.2em 0 0.3em; }
    #article-body h4 { font-size: 1.1em; font-weight: 600; margin: 1em 0 0.3em; }
    #article-body h5, #article-body h6 { font-size: 1em; font-weight: 600; margin: 1em 0 0.3em; }
    #article-body p { margin: 0.8em 0; }
    #article-body ul, #article-body ol { margin: 0.8em 0; padding-left: 2em; }
    #article-body li { margin: 0.3em 0; }
    #article-body blockquote { border-left: 4px solid #cba6f7; padding-left: 1em; margin: 1em 0; color: #a6adc8; }
    #article-body code:not(pre code) { background: #313244; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
    #article-body pre { margin: 1em 0; border-radius: 8px; overflow-x: auto; }
    #article-body pre code { background: none; padding: 0; }
    #article-body a { color: #89b4fa; text-decoration: underline; }
    #article-body a:hover { color: #b4befe; }
    .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 1em 0; }
    .table-scroll table { margin: 0; }
    #article-body table { border-collapse: collapse; width: 100%; }
    #article-body th, #article-body td { border: 1px solid #45475a; padding: 0.5em 1em; text-align: left; white-space: nowrap; }
    #article-body th { background: #313244; font-weight: 600; }
    #article-body img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
    #article-body hr { border: none; border-top: 1px solid #45475a; margin: 2em 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .animate-spin { animation: spin 1s linear infinite; }
    #sidebar-backdrop { display: none; }
    #sidebar-backdrop.active { display: block; }
  </style>
</head>
<body class="bg-ctp-base text-ctp-text min-h-screen">
  ${sidebar}
  <div id="sidebar-backdrop" class="fixed inset-0 bg-ctp-crust/50 z-30 lg:hidden" onclick="closeSidebar()"></div>

  <div class="lg:ml-64">
    <nav class="sticky top-0 z-20 bg-ctp-base/80 backdrop-blur border-b border-ctp-surface0 px-4 py-2 flex items-center gap-3">
      <button id="sidebar-open" class="lg:hidden text-ctp-subtext0 hover:text-ctp-text p-1">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <span class="text-ctp-overlay0 text-xs truncate">${escapedFilePath}</span>
    </nav>
    <main class="max-w-3xl mx-auto px-6 py-8">
      <div id="article-body">
${wrappedContent}
      </div>
    </main>
  </div>

  <script>
    window.__REDLINE_CONFIG = {
      apiBase: "",
      filePath: ${JSON.stringify(filePath)},
      articleSelector: "#article-body"
    };
  </script>
  <script src="/__redline/overlay.js"></script>
  <script>
    // Sidebar toggle
    function openSidebar() {
      document.getElementById('sidebar').classList.add('translate-x-0');
      document.getElementById('sidebar').classList.remove('-translate-x-full');
      document.getElementById('sidebar-backdrop').classList.add('active');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('translate-x-0');
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-backdrop').classList.remove('active');
    }
    document.getElementById('sidebar-open').addEventListener('click', openSidebar);
    document.getElementById('sidebar-close').addEventListener('click', closeSidebar);

    // HMR client
    (function() {
      let ws;
      function connect() {
        ws = new WebSocket("ws://" + location.host + "/__redline/hmr");
        ws.onmessage = function(e) {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "reload") {
              if (window.__REDLINE_SHOULD_RELOAD && !window.__REDLINE_SHOULD_RELOAD()) return;
              location.reload();
            }
          } catch (err) {
            console.error('[redline-ai] HMR message error:', err);
          }
        };
        ws.onclose = function() {
          setTimeout(connect, 1000);
        };
      }
      connect();
    })();
  </script>
</body>
</html>`;
}

export function renderFileListHtml(files: string[]): string {
  const sidebar = renderSidebar(files, '');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>redline-ai</title>
  <script src="https://cdn.tailwindcss.com"></script>
  ${tailwindConfig}
  <style>
    .collapsed .folder-contents { display: none; }
    .collapsed .arrow-icon { transform: rotate(-90deg); }
    .sidebar-scroll::-webkit-scrollbar { width: 4px; }
    .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
    .sidebar-scroll::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }
    #sidebar-backdrop { display: none; }
    #sidebar-backdrop.active { display: block; }
  </style>
</head>
<body class="bg-ctp-base text-ctp-text min-h-screen">
  ${sidebar}
  <div id="sidebar-backdrop" class="fixed inset-0 bg-ctp-crust/50 z-30 lg:hidden" onclick="closeSidebar()"></div>

  <div class="lg:ml-64">
    <nav class="sticky top-0 z-20 bg-ctp-base/80 backdrop-blur border-b border-ctp-surface0 px-4 py-2 flex items-center gap-3">
      <button id="sidebar-open" class="lg:hidden text-ctp-subtext0 hover:text-ctp-text p-1">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <span class="text-ctp-overlay0 text-xs">Select a file from the sidebar</span>
    </nav>
    <main class="flex items-center justify-center min-h-[80vh]">
      <div class="text-center">
        <div class="text-6xl mb-4 text-ctp-mauve/30">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <p class="text-ctp-overlay0 text-sm">Select a file to preview</p>
        <p class="text-ctp-surface2 text-xs mt-1">${files.length} Markdown files</p>
      </div>
    </main>
  </div>

  <script>
    function openSidebar() {
      document.getElementById('sidebar').classList.add('translate-x-0');
      document.getElementById('sidebar').classList.remove('-translate-x-full');
      document.getElementById('sidebar-backdrop').classList.add('active');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('translate-x-0');
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-backdrop').classList.remove('active');
    }
    document.getElementById('sidebar-open').addEventListener('click', openSidebar);
    document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
