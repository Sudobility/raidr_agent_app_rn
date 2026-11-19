/**
 * The agentic model step — CLI route (a local Claude Code / Codex install).
 *
 * Builds the same decision prompt the on-device caller uses, runs it through
 * the chosen CLI via the native bridge, and parses one `{thought, action, done,
 * respond}` decision out of the CLI's output. No API key and no server: the
 * CLI uses whatever the user logged into in Terminal.
 *
 * Failure handling, per the product decision:
 * - CLI/bridge not present (mobile, not installed) → {@link CliUnavailableError}.
 * - CLI runs but isn't authenticated → {@link CliNotLoggedInError} ("log in in
 *   Terminal"); the app does not build an in-app login.
 */

import { buildPrompt, coerce, SYSTEM_PROMPT } from './agentEngine/caller';
import type { AgentStepCaller } from './agentEngine/types';
import {
  getCliAgentBridge,
  type CliAgentBridge,
  type CliAgentKind,
} from '@/native/cliAgent';

const CLI_TIMEOUT_MS = 120_000;

export class CliUnavailableError extends Error {
  constructor(kind: CliAgentKind) {
    super(
      `${kind === 'claude' ? 'Claude Code' : 'Codex'} is not available on this device.`
    );
    this.name = 'CliUnavailableError';
  }
}

export class CliNotLoggedInError extends Error {
  constructor(kind: CliAgentKind) {
    const cmd = kind === 'claude' ? 'claude' : 'codex';
    super(`Open Terminal and run \`${cmd}\` to log in, then try again.`);
    this.name = 'CliNotLoggedInError';
  }
}

/** Reads like "not authenticated" in the CLI's output. */
function looksLikeAuthError(text: string): boolean {
  return /not logged in|log ?in|sign ?in|authenticat|unauthori[sz]ed|API[_ ]?key|credential|401/i.test(
    text
  );
}

/** The CLI invocation (args + whether the prompt goes on stdin) per agent. */
function invocation(kind: CliAgentKind): { args: string[] } {
  // Both run non-interactively and read the prompt from stdin.
  return kind === 'claude'
    ? { args: ['-p', '--output-format', 'json'] }
    : { args: ['exec', '--json', '-'] };
}

/** The first balanced top-level `{...}` object in `text`, or null. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Pull the model's decision text out of the CLI's stdout. Claude Code's
 * `--output-format json` wraps the answer in `{ result: "<text>" }`; Codex
 * prints the answer directly. Either way the decision is the first JSON object
 * found in that text.
 */
export function decisionTextFromStdout(
  kind: CliAgentKind,
  stdout: string
): string | null {
  if (kind === 'claude') {
    const envelope = extractJsonObject(stdout);
    if (envelope) {
      try {
        const parsed = JSON.parse(envelope) as { result?: unknown };
        if (typeof parsed.result === 'string') {
          return extractJsonObject(parsed.result);
        }
      } catch {
        // Not the envelope we expected; fall through to a direct scan.
      }
    }
  }
  return extractJsonObject(stdout);
}

export interface CliAgentCallerOptions {
  kind: CliAgentKind;
  /** Override the bridge (tests); defaults to {@link getCliAgentBridge}. */
  getBridge?: () => CliAgentBridge | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** An {@link AgentStepCaller} backed by a local CLI coding agent. */
export function createCliAgentStepCaller(
  options: CliAgentCallerOptions
): AgentStepCaller {
  const resolveBridge = options.getBridge ?? getCliAgentBridge;
  const { kind } = options;

  return {
    async decide(input) {
      if (options.signal?.aborted) {
        throw new Error('Cancelled');
      }
      const bridge = resolveBridge();
      if (!bridge) {
        throw new CliUnavailableError(kind);
      }

      const prompt = [
        SYSTEM_PROMPT,
        '',
        buildPrompt(input),
        '',
        'Reply with ONLY a JSON object of this shape (no prose, no code fence):',
        '{"thought": string, "action": {"tool": string, "args": object} | null, "done": boolean, "respond"?: string}',
      ].join('\n');

      const { args } = invocation(kind);
      const result = await bridge.run(
        kind,
        args,
        prompt,
        options.timeoutMs ?? CLI_TIMEOUT_MS
      );

      if (result.exitCode !== 0) {
        const detail = `${result.stderr}\n${result.stdout}`.trim();
        if (looksLikeAuthError(detail)) {
          throw new CliNotLoggedInError(kind);
        }
        throw new Error(
          detail
            ? `${kind} exited ${result.exitCode}: ${detail.slice(0, 300)}`
            : `${kind} exited ${result.exitCode}`
        );
      }

      const decisionText = decisionTextFromStdout(kind, result.stdout);
      if (!decisionText) {
        if (looksLikeAuthError(result.stdout + result.stderr)) {
          throw new CliNotLoggedInError(kind);
        }
        throw new Error(`${kind} did not return a decision`);
      }
      try {
        return coerce(JSON.parse(decisionText));
      } catch {
        throw new Error(`${kind} returned an unreadable decision`);
      }
    },
  };
}
