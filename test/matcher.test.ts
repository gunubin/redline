import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findInSource, findSection, resolveFilePath } from '../src/matcher/index.js';

const TEST_DIR = join(tmpdir(), 'redline-test-matcher');
const TEST_FILE = join(TEST_DIR, 'test.mdx');

function createTestFile(content: string, name = 'test.mdx') {
  const filePath = join(TEST_DIR, name);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

before(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

after(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// =====================================================
// resolveFilePath
// =====================================================
describe('resolveFilePath', () => {
  it('MDXファイルを見つける', () => {
    createTestFile('---\ntitle: test\n---\nhello');
    const result = resolveFilePath(TEST_DIR, 'test.mdx');
    assert.ok(result);
    assert.ok(result.endsWith('.mdx'));
  });

  it('拡張子なしでMDXファイルを見つける', () => {
    createTestFile('---\ntitle: test\n---\nhello');
    const result = resolveFilePath(TEST_DIR, 'test');
    assert.ok(result);
    assert.ok(result.endsWith('.mdx'));
  });

  it('存在しないファイルはnullを返す', () => {
    const result = resolveFilePath(TEST_DIR, '__nonexistent-file-xyz__');
    assert.equal(result, null);
  });

  it('パストラバーサルを拒否する', () => {
    const result = resolveFilePath(TEST_DIR, '../../etc/passwd');
    assert.equal(result, null);
  });
});

// =====================================================
// findInSource - 基本マッチング
// =====================================================
describe('findInSource - 基本マッチング', () => {
  it('単一行のプレーンテキストをマッチする', () => {
    const file = createTestFile(`---
title: test
---

これはテスト記事です。

別の段落です。
`);
    const result = findInSource(file, 'これはテスト記事です。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.equal(result.endLine, 5);
    assert.ok(result.matchedSource.includes('これはテスト記事です。'));
  });

  it('複数行にまたがるテキストをマッチする', () => {
    const file = createTestFile(`---
title: test
---

最初の段落です。

次の段落が続きます。
`);
    const result = findInSource(file, '最初の段落です。 次の段落が続きます。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.equal(result.endLine, 7);
  });

  it('テキストの部分一致をマッチする', () => {
    const file = createTestFile(`---
title: test
---

これは長い文章です。途中の部分だけを選択するテストケースです。
`);
    const result = findInSource(file, '途中の部分だけを選択する');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.equal(result.endLine, 5);
  });

  it('存在しないテキストはnullを返す', () => {
    const file = createTestFile(`---
title: test
---

テスト記事です。
`);
    const result = findInSource(file, 'このテキストは存在しない');
    assert.equal(result, null);
  });

  it('空文字列はnullを返す', () => {
    const file = createTestFile(`---
title: test
---

テスト記事です。
`);
    const result = findInSource(file, '');
    assert.equal(result, null);
  });

  it('空白のみはnullを返す', () => {
    const file = createTestFile(`---
title: test
---

テスト記事です。
`);
    const result = findInSource(file, '   \n  ');
    assert.equal(result, null);
  });
});

// =====================================================
// findInSource - Markdown構文のストリップ
// =====================================================
describe('findInSource - Markdown構文のストリップ', () => {
  it('見出し(##)を除去してマッチする', () => {
    const file = createTestFile(`---
title: test
---

## セクションタイトル

本文です。
`);
    const result = findInSource(file, 'セクションタイトル');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.ok(result.matchedSource.includes('## セクションタイトル'));
  });

  it('太字(**bold**)を除去してマッチする', () => {
    const file = createTestFile(`---
title: test
---

これは**太文字**のテストです。
`);
    const result = findInSource(file, 'これは太文字のテストです。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.ok(result.matchedSource.includes('**太文字**'));
  });

  it('斜体(*italic*)を除去してマッチする', () => {
    const file = createTestFile(`---
title: test
---

これは*イタリック*のテストです。
`);
    const result = findInSource(file, 'これはイタリックのテストです。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
  });

  it('インラインコード(`code`)を除去してマッチする', () => {
    const file = createTestFile(`---
title: test
---

\`console.log\`を使ってデバッグします。
`);
    const result = findInSource(file, 'console.logを使ってデバッグします。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
  });

  it('リンク[text](url)のテキスト部分だけでマッチする', () => {
    const file = createTestFile(`---
title: test
---

詳細は[公式ドキュメント](https://example.com)を参照してください。
`);
    const result = findInSource(file, '詳細は公式ドキュメントを参照してください。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
  });

  it('HTMLタグを除去してマッチする', () => {
    const file = createTestFile(`---
title: test
---

<div>コンテンツ内容</div>です。
`);
    const result = findInSource(file, 'コンテンツ内容です。');
    assert.ok(result);
  });

  it('複数のMarkdown構文が混在してもマッチする', () => {
    const file = createTestFile(`---
title: test
---

## **重要な**[リンク](https://example.com)と\`コード\`の組み合わせ
`);
    const result = findInSource(file, '重要なリンクとコードの組み合わせ');
    assert.ok(result);
    assert.equal(result.startLine, 5);
  });
});

// =====================================================
// findInSource - frontmatter & import スキップ
// =====================================================
describe('findInSource - frontmatter & import スキップ', () => {
  it('frontmatter内のテキストはマッチしない', () => {
    const file = createTestFile(`---
title: ユニークなタイトル
description: ユニークな説明
---

本文です。
`);
    const result = findInSource(file, 'ユニークなタイトル');
    assert.equal(result, null);
  });

  it('import文のテキストはマッチしない', () => {
    const file = createTestFile(`---
title: test
---

import AuthorAside from '../../components/AuthorAside.astro';

本文です。
`);
    const result = findInSource(file, 'AuthorAside from');
    assert.equal(result, null);
  });

  it('import文の後の本文はマッチする', () => {
    const file = createTestFile(`---
title: test
---

import Component from './Component.astro';
import Another from './Another.astro';

ここが本文の開始です。
`);
    const result = findInSource(file, 'ここが本文の開始です。');
    assert.ok(result);
    assert.equal(result.startLine, 8);
  });
});

// =====================================================
// findInSource - ホワイトスペースの正規化
// =====================================================
describe('findInSource - ホワイトスペースの正規化', () => {
  it('余分なスペースを正規化してマッチする', () => {
    const file = createTestFile(`---
title: test
---

テスト   記事   です。
`);
    const result = findInSource(file, 'テスト 記事 です。');
    assert.ok(result);
  });

  it('改行を含むブラウザ選択テキストでもマッチする', () => {
    const file = createTestFile(`---
title: test
---

1行目のテキスト。

2行目のテキスト。
`);
    const result = findInSource(file, '1行目のテキスト。\n\n2行目のテキスト。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.equal(result.endLine, 7);
  });
});

// =====================================================
// findInSource - 行番号の正確性
// =====================================================
describe('findInSource - 行番号の正確性', () => {
  it('frontmatter後の最初の行は正しい行番号を返す', () => {
    const file = createTestFile(`---
title: test
pubDate: 2026-01-01
category: dev
---

最初の段落。
`);
    const result = findInSource(file, '最初の段落。');
    assert.ok(result);
    assert.equal(result.startLine, 7);
    assert.equal(result.endLine, 7);
  });

  it('import文の後の本文行番号が正確', () => {
    const file = createTestFile(`---
title: test
---

import A from './A.astro';
import B from './B.astro';

本文はここからです。

2段落目です。
`);
    const result = findInSource(file, '本文はここからです。');
    assert.ok(result);
    assert.equal(result.startLine, 8);
    assert.equal(result.endLine, 8);
  });

  it('空行を挟んだ複数段落の範囲が正確', () => {
    const file = createTestFile(`---
title: test
---

段落A。

段落B。

段落C。
`);
    const result = findInSource(file, '段落A。 段落B。 段落C。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.equal(result.endLine, 9);
  });

  it('matchedSourceに元のMarkdown構文が保持される', () => {
    const file = createTestFile(`---
title: test
---

## 見出し

**太字テキスト**と[リンク](https://example.com)を含む行。
`);
    const result = findInSource(file, '太字テキストとリンクを含む行。');
    assert.ok(result);
    assert.ok(result.matchedSource.includes('**太字テキスト**'));
    assert.ok(result.matchedSource.includes('[リンク](https://example.com)'));
  });
});

// =====================================================
// findInSource - JSXコンポーネント
// =====================================================
describe('findInSource - JSXコンポーネント', () => {
  it('自己終了タグの後の本文にマッチする', () => {
    const file = createTestFile(`---
title: test
---

import InternalLink from './InternalLink.astro';

<InternalLink slug="some-post" />

この段落はリンクの後です。
`);
    const result = findInSource(file, 'この段落はリンクの後です。');
    assert.ok(result);
    assert.equal(result.startLine, 9);
  });

  it('コンポーネント属性値にはマッチしない（HTMLタグとして除去される）', () => {
    const file = createTestFile(`---
title: test
---

import Comp from './Comp.astro';

<Comp title="マッチすべきでない" />

本文です。
`);
    const result = findInSource(file, 'マッチすべきでない');
    assert.equal(result, null);
  });
});

// =====================================================
// findInSource - テーブル
// =====================================================
describe('findInSource - テーブル', () => {
  it('テーブルセルのテキストにマッチする', () => {
    const file = createTestFile(`---
title: test
---

| 操作 | ショートカット |
|------|--------------|
| 新規ウィンドウ | Cmd+T |
| ウィンドウ閉じる | Cmd+W |
`);
    const result = findInSource(file, '新規ウィンドウ');
    assert.ok(result);
    assert.ok(result.startLine >= 7);
  });
});

// =====================================================
// findInSource - リストアイテム
// =====================================================
describe('findInSource - リストアイテム', () => {
  it('リストアイテムのテキストにマッチする', () => {
    const file = createTestFile(`---
title: test
---

便利な機能:

- 自動補完が速い
- エラー表示が分かりやすい
- 拡張性が高い
`);
    const result = findInSource(file, 'エラー表示が分かりやすい');
    assert.ok(result);
    assert.equal(result.startLine, 8);
  });
});

// =====================================================
// findInSource - 実際の記事パターン
// =====================================================
describe('findInSource - 実際の記事パターン', () => {
  it('実際のブログ記事構造でマッチする', () => {
    const file = createTestFile(`---
title: Claude Code中心の開発環境を半年かけて育てた全記録
description: 開発環境の全容。
pubDate: 2026-02-15
category: dev-tools
tags: [Claude Code, Ghostty]
draft: false
---

import AuthorAside from '../../components/AuthorAside.astro';
import InternalLink from '../../components/InternalLink.astro';

Claude Codeを半年使い続けた結果、気づいたらターミナルの設定が全部Claude中心になっていました。Ghosttyのショートカット、tmuxのウィンドウ名、fishのラッパー関数。どれもClaude Codeありきの設定です。

## Ghostty: Claude Codeの操縦席

<InternalLink slug="ghostty-terminal-setup-mac-2026" />

Ghosttyを選んだ理由はシンプルで、速くて、tmuxとの相性がいいからです。

### ショートカットでtmuxを直接操作

Ghosttyのkeybindでキーシーケンスをtmuxのprefixキー（\`Ctrl+s\`）経由で送信しています。

| 操作 | ショートカット |
|------|--------------|
| 新規ウィンドウ | \`Cmd+T\` |
`);

    const result1 = findInSource(file, 'Claude Codeを半年使い続けた結果、気づいたらターミナルの設定が全部Claude中心になっていました。');
    assert.ok(result1, '最初の段落がマッチしない');
    assert.equal(result1.startLine, 13);

    const result2 = findInSource(file, 'Ghostty: Claude Codeの操縦席');
    assert.ok(result2, '見出しがマッチしない');
    assert.equal(result2.startLine, 15);
    assert.ok(result2.matchedSource.includes('## Ghostty'));

    const result3 = findInSource(file, 'Ghosttyのkeybindでキーシーケンスをtmuxのprefixキー（Ctrl+s）経由で送信しています。');
    assert.ok(result3, 'インラインコード含みのテキストがマッチしない');
    assert.ok(result3.matchedSource.includes('`Ctrl+s`'));

    const result4 = findInSource(file, 'Ghosttyを選んだ理由はシンプルで、速くて、tmuxとの相性がいいからです。 ショートカットでtmuxを直接操作');
    assert.ok(result4, '段落をまたぐ選択がマッチしない');
    assert.equal(result4.startLine, 19);
    assert.equal(result4.endLine, 21);
  });

  it('frontmatter内のtitleはマッチしない', () => {
    const file = createTestFile(`---
title: Claude Code中心の開発環境を半年かけて育てた全記録
---

import A from './A.astro';

本文です。
`);
    const result = findInSource(file, 'Claude Code中心の開発環境を半年かけて育てた全記録');
    assert.equal(result, null);
  });
});

// =====================================================
// findInSource - エッジケース
// =====================================================
describe('findInSource - エッジケース', () => {
  it('ファイル末尾のテキストにマッチする', () => {
    const file = createTestFile(`---
title: test
---

最初の段落。

最後の段落。`); // 末尾改行なし
    const result = findInSource(file, '最後の段落。');
    assert.ok(result);
    assert.equal(result.startLine, 7);
  });

  it('frontmatterのみのファイルはnullを返す', () => {
    const file = createTestFile(`---
title: test
---
`);
    const result = findInSource(file, 'テスト');
    assert.equal(result, null);
  });

  it('同じテキストが複数回出現する場合、最初の出現にマッチする', () => {
    const file = createTestFile(`---
title: test
---

繰り返しテキスト。

別の段落。

繰り返しテキスト。
`);
    const result = findInSource(file, '繰り返しテキスト。');
    assert.ok(result);
    assert.equal(result.startLine, 5);
  });

  it('5文字未満の短いテキストでもマッチする', () => {
    const file = createTestFile(`---
title: test
---

はい。
`);
    const result = findInSource(file, 'はい。');
    assert.ok(result);
  });

  it('H1からH6まで全レベルの見出しをストリップする', () => {
    const file = createTestFile(`---
title: test
---

# H1見出し

## H2見出し

### H3見出し

#### H4見出し

##### H5見出し

###### H6見出し
`);
    for (let level = 1; level <= 6; level++) {
      const result = findInSource(file, `H${level}見出し`);
      assert.ok(result, `H${level}見出しがマッチしない`);
    }
  });
});

// =====================================================
// findInSource - 返却値の整合性
// =====================================================
describe('findInSource - 返却値の整合性', () => {
  it('filePathが引数と同一のパスを返す', () => {
    const file = createTestFile(`---
title: test
---

テスト本文。
`);
    const result = findInSource(file, 'テスト本文。');
    assert.ok(result);
    assert.equal(result.filePath, file);
  });

  it('matchedSourceがstartLine〜endLineの元ソースと一致する', () => {
    const content = `---
title: test
---

1行目のテキスト。

2行目のテキスト。
`;
    const file = createTestFile(content);
    const result = findInSource(file, '1行目のテキスト。 2行目のテキスト。');
    assert.ok(result);

    const lines = content.split('\n');
    const expected = lines.slice(result.startLine - 1, result.endLine).join('\n');
    assert.equal(result.matchedSource, expected);
  });
});

// =====================================================
// findInSource - コードブロック後の見出しマッチング
// =====================================================
describe('findInSource - コードブロック後の見出しマッチング', () => {
  it('インデント付きコードブロックの後の見出しが正しい行にマッチする', () => {
    const file = createTestFile(`# 前の見出し

段落テキスト。

\`\`\`typescript
export const create = () => {
  const redux = Provider.create();
  return {
    signIn: async () => {
      const { data, error } = await redux.dispatch(
        api.endpoints.createToken.initiate(),
      );
      return data;
    },
    signOut: async () => {
      const { data, error } = await redux.dispatch(
        api.endpoints.deleteToken.initiate(),
      );
      return data;
    },
  };
};
\`\`\`

# コンポーネント設計方針（Component Layer）

本文テキスト。
`);
    const result = findInSource(file, 'コンポーネント設計方針（Component Layer）');
    assert.ok(result, '見出しがマッチしない');
    assert.ok(result.matchedSource.includes('# コンポーネント設計方針'), `matchedSource should contain heading, got: ${result.matchedSource}`);
    assert.ok(!result.matchedSource.includes('redux.dispatch'), 'コードブロック内の行にマッチすべきでない');
  });

  it('絵文字付き見出しがコードブロック後に正しくマッチする', () => {
    const file = createTestFile(`# 前セクション

\`\`\`typescript
const { data, error } = await redux.dispatch(
        authApi.endpoints.createAccessToken.initiate({
          email,
          password,
        }),
);
\`\`\`

# 🧩 コンポーネント設計方針（Component Layer）

ここは本文です。
`);
    const result = findInSource(file, '🧩 コンポーネント設計方針（Component Layer）');
    assert.ok(result, '絵文字付き見出しがマッチしない');
    assert.ok(result.matchedSource.includes('# 🧩'), `matchedSource should contain emoji heading, got: ${result.matchedSource}`);
    assert.ok(!result.matchedSource.includes('redux.dispatch'), 'コードブロック内の行にマッチすべきでない');
  });

  it('深くインデントされたコードブロックがあっても後続テキストの位置がずれない', () => {
    const file = createTestFile(`# 見出し1

\`\`\`typescript
if (a) {
    if (b) {
        if (c) {
            const result = await something.very.deeply.nested();
        }
    }
}
\`\`\`

ここが正しくマッチすべき段落です。
`);
    const result = findInSource(file, 'ここが正しくマッチすべき段落です。');
    assert.ok(result);
    assert.equal(result.startLine, 13);
  });
});

// =====================================================
// findSection
// =====================================================
describe('findSection', () => {
  it('H1セクションの範囲を正しく取得する', () => {
    const file = createTestFile(`---
title: test
---

# セクション1

段落A。

# セクション2

段落B。
`);
    const result = findSection(file, 'セクション1', 1);
    assert.ok(result);
    assert.equal(result.startLine, 5);
    assert.ok(result.matchedSource.includes('# セクション1'));
    assert.ok(result.matchedSource.includes('段落A。'));
    assert.ok(!result.matchedSource.includes('セクション2'));
  });

  it('H2セクションの範囲を正しく取得する', () => {
    const file = createTestFile(`# タイトル

## 子セクション1

段落A。

## 子セクション2

段落B。
`);
    const result = findSection(file, '子セクション1', 2);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('## 子セクション1'));
    assert.ok(result.matchedSource.includes('段落A。'));
    assert.ok(!result.matchedSource.includes('子セクション2'));
  });

  it('H3セクションが上位レベル見出しで区切られる', () => {
    const file = createTestFile(`## 親

### 子セクション

段落。

## 次の親

別の内容。
`);
    const result = findSection(file, '子セクション', 3);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('### 子セクション'));
    assert.ok(result.matchedSource.includes('段落。'));
    assert.ok(!result.matchedSource.includes('次の親'));
  });

  it('最後のセクションはファイル末尾まで含む', () => {
    const file = createTestFile(`# 最初

段落。

# 最後のセクション

これが最後。

最終段落。
`);
    const result = findSection(file, '最後のセクション', 1);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('これが最後。'));
    assert.ok(result.matchedSource.includes('最終段落。'));
  });

  it('該当見出しなしでnullを返す', () => {
    const file = createTestFile(`# タイトル

段落。
`);
    const result = findSection(file, '存在しない見出し', 1);
    assert.equal(result, null);
  });

  it('frontmatterをスキップしてセクションを取得する', () => {
    const file = createTestFile(`---
title: テスト記事
date: 2026-01-01
---

# 本文セクション

本文テキスト。
`);
    const result = findSection(file, '本文セクション', 1);
    assert.ok(result);
    assert.equal(result.startLine, 6);
    assert.ok(result.matchedSource.includes('# 本文セクション'));
    assert.ok(result.matchedSource.includes('本文テキスト。'));
  });

  it('Markdown装飾付き見出しにマッチする', () => {
    const file = createTestFile(`# **太字の見出し**

段落。

# 次の見出し
`);
    const result = findSection(file, '太字の見出し', 1);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('**太字の見出し**'));
    assert.ok(result.matchedSource.includes('段落。'));
  });

  it('コードブロック内の#をセクション区切りと誤認しない', () => {
    const file = createTestFile(`### 設定方法

以下のコードを使います:

\`\`\`python
# This is a Python comment
def setup():
    # Another comment
    pass
\`\`\`

設定完了後の説明。

## 次のセクション
`);
    const result = findSection(file, '設定方法', 3);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('# This is a Python comment'));
    assert.ok(result.matchedSource.includes('設定完了後の説明。'));
    assert.ok(!result.matchedSource.includes('次のセクション'));
  });

  it('絵文字付き見出しのセクションを取得する', () => {
    const file = createTestFile(`# 🧩 コンポーネント設計

コンポーネントの説明。

# ⚠️ エラーハンドリング
`);
    const result = findSection(file, '🧩 コンポーネント設計', 1);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('コンポーネントの説明。'));
    assert.ok(!result.matchedSource.includes('エラーハンドリング'));
  });

  it('空セクション（見出し直後に次の見出し）', () => {
    const file = createTestFile(`# セクションA

# セクションB

内容B。
`);
    const result = findSection(file, 'セクションA', 1);
    assert.ok(result);
    assert.equal(result.startLine, 1);
    assert.equal(result.endLine, 1);
    assert.ok(result.matchedSource.includes('# セクションA'));
    assert.ok(!result.matchedSource.includes('セクションB'));
  });

  it('H3セクション内のH4はセクションを区切らない', () => {
    const file = createTestFile(`### メインセクション

概要。

#### サブセクション

詳細。

### 次のセクション
`);
    const result = findSection(file, 'メインセクション', 3);
    assert.ok(result);
    assert.ok(result.matchedSource.includes('#### サブセクション'));
    assert.ok(result.matchedSource.includes('詳細。'));
    assert.ok(!result.matchedSource.includes('次のセクション'));
  });

  it('末尾の空行がmatchedSourceに含まれない', () => {
    const file = createTestFile(`# セクション1

段落。



# セクション2
`);
    const result = findSection(file, 'セクション1', 1);
    assert.ok(result);
    assert.ok(result.matchedSource.endsWith('段落。'));
  });
});

// =====================================================
// findInSource - タイポグラフィ正規化
// =====================================================
describe('findInSource - タイポグラフィ正規化', () => {
  it('スマートダブルクォートをストレートクォートにマッチする', () => {
    const file = createTestFile(`---
title: test
---

What remains is "the ability to experience friction and derive ideas for specifications."
`);
    // ブラウザが選択したテキスト（スマートクォート付き）
    const selected = 'What remains is \u201Cthe ability to experience friction and derive ideas for specifications.\u201D';
    const result = findInSource(file, selected);
    assert.ok(result, 'スマートダブルクォートでマッチしない');
    assert.equal(result.startLine, 5);
  });

  it('スマートシングルクォートをストレートクォートにマッチする', () => {
    const file = createTestFile(`---
title: test
---

It's a developer's tool.
`);
    const selected = 'It\u2019s a developer\u2019s tool.';
    const result = findInSource(file, selected);
    assert.ok(result, 'スマートシングルクォートでマッチしない');
    assert.equal(result.startLine, 5);
  });

  it('emダッシュをダブルハイフンにマッチする', () => {
    const file = createTestFile(`---
title: test
---

This is important--very important.
`);
    const selected = 'This is important\u2014very important.';
    const result = findInSource(file, selected);
    assert.ok(result, 'emダッシュでマッチしない');
    assert.equal(result.startLine, 5);
  });

  it('省略記号をドット3つにマッチする', () => {
    const file = createTestFile(`---
title: test
---

Wait for it...
`);
    const selected = 'Wait for it\u2026';
    const result = findInSource(file, selected);
    assert.ok(result, '省略記号でマッチしない');
    assert.equal(result.startLine, 5);
  });
});
