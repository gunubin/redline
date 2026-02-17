import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getSession, setSession, deleteSession, hasSession } from './session.js';
import type { Agent, EditContext } from './index.js';
import type { AgentConfig } from '../config.js';
import { DEFAULT_FIRST_CALL, DEFAULT_SUBSEQUENT_CALL, renderPrompt } from './prompt.js';

export class ClaudeCodeAgent implements Agent {
  private firstCallTemplate: string;
  private subsequentCallTemplate: string;
  private model?: string;
  private maxBudgetUsd?: number;
  private systemPrompt?: string;
  private effort?: string;

  constructor(agentConfig?: AgentConfig) {
    this.firstCallTemplate = agentConfig?.prompt_first_call ?? DEFAULT_FIRST_CALL;
    this.subsequentCallTemplate = agentConfig?.prompt_subsequent_call ?? DEFAULT_SUBSEQUENT_CALL;
    this.model = agentConfig?.model;
    this.maxBudgetUsd = agentConfig?.max_budget_usd;
    this.systemPrompt = agentConfig?.system_prompt;
    this.effort = agentConfig?.effort;
  }

  buildPrompt(ctx: EditContext, isFirstCall: boolean): string {
    const { fullSource, matchedSource, selectedText, startLine, endLine, instruction } = ctx;
    const selectionContext =
      selectedText !== matchedSource.trim()
        ? `\nユーザーが選択した部分: 「${selectedText}」\n指示はこの選択部分に対して適用してください。選択部分以外は変更しないでください。`
        : '';

    const vars: Record<string, string> = {
      fullSource,
      target: matchedSource,
      startLine: String(startLine),
      endLine: String(endLine),
      instruction,
      selectionContext,
    };

    const template = isFirstCall ? this.firstCallTemplate : this.subsequentCallTemplate;
    return renderPrompt(template, vars);
  }

  edit(ctx: EditContext): Promise<string> {
    const { fileKey } = ctx;
    const isFirstCall = !hasSession(fileKey);
    const prompt = this.buildPrompt(ctx, isFirstCall);

    return new Promise((resolve, reject) => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key !== 'CLAUDECODE'),
      );
      const args = ['--print', '--tools', ''];
      if (this.model) args.push('--model', this.model);
      if (this.maxBudgetUsd) args.push('--max-budget-usd', String(this.maxBudgetUsd));
      if (this.systemPrompt) args.push('--system-prompt', this.systemPrompt);
      if (this.effort) args.push('--effort', this.effort);
      if (isFirstCall) {
        const sessionId = randomUUID();
        setSession(fileKey, sessionId);
        args.push('--session-id', sessionId);
      } else {
        const sessionId = getSession(fileKey)!;
        args.push('--resume', sessionId);
      }

      const proc = spawn('claude', args, {
        cwd: process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdin.write(prompt);
      proc.stdin.end();

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Claude CLI timed out after 120s'));
      }, 120_000);

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stripCodeFences(stdout.trim()));
      });
      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });
    });
  }

  resetSession(fileKey: string): void {
    deleteSession(fileKey);
  }
}

/**
 * Strip wrapping code fences from LLM output.
 * Handles: ```markdown\n...\n``` , ```\n...\n``` , etc.
 */
function stripCodeFences(text: string): string {
  const match = text.match(/^```[a-z]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  return match ? match[1] : text;
}
