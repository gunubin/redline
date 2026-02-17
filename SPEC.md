# redline-ai — Inline AI Editing for Local Files

## Why

ドキュメントの修正は「読みながら直したい」。しかし現状のワークフローは:

```
エディタでMarkdown編集 → プレビューで確認 → エディタに戻って修正 → 繰り返し
```

読者視点のレンダリング結果を見ながら、その場でAIに修正指示を出したい。

## What

ローカルファイルをブラウザでプレビューし、テキストを選択してAI agentにインライン編集を指示するCLIツール。

```
$ redline-ai serve ./docs
→ http://localhost:4321 でMarkdownをHTMLプレビュー
→ テキスト選択 → "AI Edit" ボタン → 指示入力 → diff表示 → Apply/Reject
```

## ターゲット

- Markdown/MDXドキュメントを書く個人開発者
- Obsidian vault、技術ブログ、README、社内ドキュメント等
- フレームワーク非依存（Astro/Next.js等に依存しない）

## アーキテクチャ

### 全体構成

```
ブラウザ（プレビュー + 編集UI）
  ↕ HTTP API
ローカルサーバー（ファイル配信 + 編集API）
  ↕ CLI spawn
AI Agent（Claude Code / 将来: Cursor, Codex等）
  ↕ ファイル書き換え
ローカルファイルシステム
```

### コンポーネント

1. **ローカルサーバー** — Markdownをレンダリングして配信 + 編集API
2. **ブラウザオーバーレイ** — テキスト選択、指示入力、diff表示、Apply/Reject
3. **テキストマッチャー** — ブラウザの選択テキストをソースファイルの行番号にマッピング
4. **AI Agent連携** — 選択箇所と指示をagentに渡し、修正結果を受け取る

### Agent連携の抽象化

```
trait Agent:
  fn edit(context, target, instruction) -> Result<String>

実装:
  - ClaudeCodeAgent — claude --print でCLI呼び出し
  - 将来: CursorAgent, CodexAgent 等
```

## フロー詳細

### 1. サーバー起動

```
$ redline-ai serve ./docs --port 4321
```

- 指定ディレクトリのMarkdown/MDXファイルを検出
- HTMLにレンダリングして配信
- ファイル監視（HMR）でソース変更時に自動リロード
- 編集UIのJSを注入

### 2. テキスト選択 → AI Edit

ブラウザ上で:

1. 記事本文のテキストを選択（5文字以上）
2. "AI Edit" フローティングボタンが出現
3. クリックするとインラインエディタが展開
4. 編集指示を入力（例: 「もっと簡潔に」「英語に翻訳して」）
5. 送信

### 3. テキストマッチング

ブラウザで選択されたプレーンテキストを、ソースファイルの対応行にマッピング:

1. Markdownの装飾を除去してプレーンテキスト化
2. ブラウザ選択テキストとの正規化比較（空白正規化）
3. マッチした行範囲（startLine, endLine）を特定
4. 対応するソースのMarkdown原文を抽出

### 4. AI Agent呼び出し

```
POST /api/edit
{
  "filePath": "docs/guide.md",
  "selectedText": "選択されたテキスト",
  "instruction": "もっと簡潔に"
}
```

サーバー側:
1. テキストマッチャーで行範囲を特定
2. 初回呼び出し時: ファイル全体をコンテキストとしてagentに渡す
3. 2回目以降: セッションを再利用（同一ファイル内の文脈を維持）
4. agentが修正後のテキストを返す

レスポンス:
```json
{
  "id": "unique-id",
  "original": "元のMarkdownテキスト",
  "modified": "修正後のMarkdownテキスト",
  "startLine": 42,
  "endLine": 45,
  "filePath": "docs/guide.md"
}
```

### 5. Diff表示 → Apply/Reject

ブラウザ上で:
1. original vs modified の行レベルdiffを表示（削除=赤、追加=緑）
2. Apply → サーバーにPOSTしてソースファイルを書き換え → HMRでリロード
3. Reject → diffを閉じて元に戻る

```
POST /api/apply
{
  "filePath": "docs/guide.md",
  "startLine": 42,
  "endLine": 45,
  "modified": "修正後のテキスト"
}
```

### 6. セッション管理

- ファイルごとにagentセッションを維持
- 同一ファイル内の複数編集で文脈が引き継がれる
- `POST /api/reset-session` でセッションリセット

## ブラウザUI仕様

### フローティングボタン

- テキスト選択時に選択範囲の直下に表示
- "AI Edit" ラベル
- 選択解除で自動消滅（200msディレイ）

### インラインエディタ

- 選択箇所のハイライト（紫系）
- テキストエリア（編集指示入力）
- 送信 / Cancel ボタン

### Diff表示

- ヘッダー: 行番号範囲（L42-45）
- 削除行: 赤背景 + 取り消し線
- 追加行: 緑背景
- Apply / Reject ボタン
- Apply後: 成功メッセージ → 2秒後に消滅 → HMRリロード

### スタイリング

- Tailwind CSSクラスで定義
- ダークテーマ基調（gray-800/900系）
- アクセントカラー: violet-500

## dev:editからの改善点

### 1. フレームワーク非依存

dev:editはAstroインテグレーションとして実装されている。redline-aiは独立したCLIツールとして、任意のMarkdownディレクトリで動作する。

### 2. ビルトインMarkdownレンダリング

Astroのdevサーバーに依存せず、redline-ai自身がMarkdownをHTMLにレンダリングする。GFM、シンタックスハイライト、画像表示をサポート。

### 3. ファイルパス解決の汎用化

dev:editは `src/content/blog/{slug}.mdx` 固定。redline-aiは任意のディレクトリ構造に対応。

```
redline-ai serve ./docs          # docs/ 以下の全.md/.mdx
redline-ai serve ./              # カレントディレクトリ
redline-ai serve ~/notes         # Obsidian vault
```

### 4. Agent抽象化

dev:editはClaude Code固定。redline-aiはagent連携をtraitで抽象化し、将来的に複数agentに対応可能。

### 5. ファイル一覧 / ナビゲーション

サイドバーまたはトップページにファイル一覧を表示。ディレクトリ構造を反映。

### 6. セキュリティ

- ファイル書き換え対象を指定ディレクトリ配下に制限（パストラバーサル防止）
- localhost限定（デフォルト）

## 技術スタック

- Rust（サーバー + CLI）
- axum（HTTPサーバー）
- pulldown-cmark（Markdownレンダリング）
- syntect（シンタックスハイライト）
- notify（ファイル監視 / HMR）
- TypeScript（ブラウザオーバーレイJS、ビルド時にバンドル）

## CLIコマンド

```
redline-ai serve <dir>            # プレビューサーバー起動
  --port <port>                # ポート番号（デフォルト: 4321）
  --agent <agent>              # 使用するagent（デフォルト: claude-code）
  --open                       # ブラウザを自動で開く
```

## 将来の拡張

- 複数ファイルにまたがる編集指示
- 編集履歴のundo/redo
- コメントモード（編集せず、フィードバックだけ残す）
- チーム共有（LAN内で複数人がアクセスして赤入れ）
