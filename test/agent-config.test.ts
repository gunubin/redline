import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeCodeAgent } from '../src/agent/claude.js';
import type { EditContext } from '../src/agent/index.js';

const baseCtx: EditContext = {
  fullSource: '# Title\n\nSome content here.',
  matchedSource: 'Some content here.',
  selectedText: 'Some content here.',
  startLine: 3,
  endLine: 3,
  instruction: 'make it shorter',
  fileKey: 'test.md',
};

describe('ClaudeCodeAgent.buildPrompt', () => {
  it('configなしでデフォルトテンプレートを使う（初回）', () => {
    const agent = new ClaudeCodeAgent();
    const prompt = agent.buildPrompt(baseCtx, true);
    assert.ok(prompt.includes('# Title'));
    assert.ok(prompt.includes('Some content here.'));
    assert.ok(prompt.includes('make it shorter'));
    assert.ok(prompt.includes('ドキュメントの編集アシスタント'));
  });

  it('configなしでデフォルトテンプレートを使う（2回目）', () => {
    const agent = new ClaudeCodeAgent();
    const prompt = agent.buildPrompt(baseCtx, false);
    assert.ok(!prompt.includes('# Title')); // fullSource は含まない
    assert.ok(prompt.includes('同じドキュメント'));
  });

  it('カスタムprompt_first_callが使われる', () => {
    const agent = new ClaudeCodeAgent({
      prompt_first_call: 'CUSTOM FIRST: {{fullSource}} | {{instruction}}',
    });
    const prompt = agent.buildPrompt(baseCtx, true);
    assert.equal(prompt, 'CUSTOM FIRST: # Title\n\nSome content here. | make it shorter');
  });

  it('カスタムprompt_subsequent_callが使われる', () => {
    const agent = new ClaudeCodeAgent({
      prompt_subsequent_call: 'CUSTOM SUBSEQUENT: L{{startLine}}-{{endLine}} {{instruction}}',
    });
    const prompt = agent.buildPrompt(baseCtx, false);
    assert.equal(prompt, 'CUSTOM SUBSEQUENT: L3-3 make it shorter');
  });

  it('片方だけカスタムした場合、もう片方はデフォルトのまま', () => {
    const agent = new ClaudeCodeAgent({
      prompt_first_call: 'CUSTOM: {{instruction}}',
    });
    const firstPrompt = agent.buildPrompt(baseCtx, true);
    const subsequentPrompt = agent.buildPrompt(baseCtx, false);
    assert.equal(firstPrompt, 'CUSTOM: make it shorter');
    assert.ok(subsequentPrompt.includes('同じドキュメント'));
  });

  it('selectionContextがサブセレクション時に含まれる', () => {
    const agent = new ClaudeCodeAgent({
      prompt_first_call: '{{selectionContext}}',
    });
    const ctx: EditContext = {
      ...baseCtx,
      selectedText: 'content', // matchedSource.trim() と異なる
    };
    const prompt = agent.buildPrompt(ctx, true);
    assert.ok(prompt.includes('ユーザーが選択した部分: 「content」'));
  });

  it('selectionContextがフル選択時は空になる', () => {
    const agent = new ClaudeCodeAgent({
      prompt_first_call: '[{{selectionContext}}]',
    });
    const prompt = agent.buildPrompt(baseCtx, true);
    assert.equal(prompt, '[]');
  });

  it('カスタムテンプレートの未知変数はそのまま残る', () => {
    const agent = new ClaudeCodeAgent({
      prompt_first_call: '{{instruction}} {{unknownVar}}',
    });
    const prompt = agent.buildPrompt(baseCtx, true);
    assert.equal(prompt, 'make it shorter {{unknownVar}}');
  });
});

describe('ClaudeCodeAgent CLI options', () => {
  it('configなしでもインスタンス生成できる', () => {
    const agent = new ClaudeCodeAgent();
    assert.ok(agent);
  });

  it('全オプション指定でインスタンス生成できる', () => {
    const agent = new ClaudeCodeAgent({
      prompt_first_call: 'custom',
      prompt_subsequent_call: 'custom2',
      model: 'haiku',
      max_budget_usd: 0.05,
      system_prompt: 'You are a markdown editor.',
      effort: 'low',
    });
    assert.ok(agent);
    // buildPrompt が壊れていないことを確認
    const prompt = agent.buildPrompt(baseCtx, true);
    assert.equal(prompt, 'custom');
  });

  it('一部オプションのみ指定でもデフォルトが維持される', () => {
    const agent = new ClaudeCodeAgent({
      model: 'sonnet',
    });
    // デフォルトテンプレートが使われる
    const prompt = agent.buildPrompt(baseCtx, true);
    assert.ok(prompt.includes('ドキュメントの編集アシスタント'));
  });
});
