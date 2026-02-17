# redline-ai

Edit your docs while reading them.

## The Problem

Fixing a document always means switching between two modes: reading and editing. You read the rendered output, spot something wrong, switch to your editor, find the line, fix it, switch back to the preview, and repeat. The context switch is small but constant, and it adds up.

## What redline-ai Does

redline-ai lets you preview local Markdown files in the browser and edit them right there. Select any text, tell the AI what to change, review the diff, and apply it. The source file is updated on disk. No copy-pasting, no switching windows.

```
$ npx redline-ai serve ./docs
```

Open `http://localhost:4321`, and you're reading your docs with editing powers.

## How It Works

1. **Select** any text in the rendered preview
2. **Click** the "AI Edit" button that appears
3. **Describe** what you want changed (e.g. "make this more concise", "translate to English")
4. **Review** the diff showing exactly what will change
5. **Apply** or **Reject**

The source Markdown file is rewritten on disk. The preview refreshes automatically.

## Who It's For

- Writers editing blog posts, READMEs, or documentation
- Anyone with an Obsidian vault, Hugo site, or plain Markdown folder
- Developers who want to proofread rendered output, not raw markup

## Two Modes

### Standalone (`serve`)

redline-ai renders your Markdown files itself. Point it at any directory.

```
$ npx redline-ai serve ./docs
$ npx redline-ai serve ~/obsidian-vault
$ npx redline-ai serve .
```

### Proxy (`proxy`)

Already running a dev server (Astro, Next.js, etc.)? redline-ai sits in front of it, injecting the editing overlay into your existing site.

```
$ npx redline-ai proxy --target http://localhost:3000 --root ./src/content --config redline.toml
```

Configure URL-to-file mapping in `redline.toml`:

```toml
[proxy]
target = "http://localhost:3000"
root = "./src/content"

[[proxy.routes]]
pattern = "/blog/:slug"
file = "blog/:slug.mdx"

[[proxy.routes]]
pattern = "/docs/:path*"
file = ":path.md"
```

## Features

- **Live preview** with syntax-highlighted code blocks
- **AI-powered inline editing** via Claude Code
- **Diff review** before any change hits disk
- **Session memory** -- the AI remembers earlier edits in the same file
- **Hot reload** -- file changes refresh the browser automatically
- **Multiple edits** -- open several edit panels at once without losing any
- **Framework-agnostic** -- works with any Markdown directory or existing dev server

## Requirements

- Node.js 22+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

> **Note:** redline-ai currently uses Claude Code as the AI backend. Other AI agent CLIs are not supported yet.

## Install

```
npm install -g redline-ai
```

Or run directly:

```
npx redline-ai serve ./docs
```

## CLI

```
redline-ai serve <dir>           # Preview and edit Markdown files
  --port <port>                  # Port number (default: 4321)
  --open                         # Open browser automatically

redline-ai proxy                 # Proxy an existing dev server
  --target <url>                 # Target server URL
  --root <dir>                   # Source file directory
  --config <path>                # Config file (default: redline.toml)
  --port <port>                  # Port number (default: 4321)
```

## License

MIT
