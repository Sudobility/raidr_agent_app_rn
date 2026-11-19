/**
 * The shared prompt for the agentic model step: the system prompt, the per-turn
 * user prompt (goal + tools + memory + observations), and a coercion from a raw
 * model reply to a typed decision.
 *
 * Both routes reuse these — the cloud route (`src/lib/agentCaller.ts`, the
 * server's key via the managed `agent` ShapeShyft endpoint) and the local CLI
 * route (`src/lib/cliAgent.ts`, the user's Claude Code / Codex). Neither needs a
 * user API key. The cloud endpoint owns its own prompt template on the service;
 * the CLI embeds the required JSON shape itself. This module is the single
 * place the request shape and the reply coercion are defined.
 */

import {
  type AgentPromptInput,
  type AgentStepOutput,
  type AgentTool,
} from './types';

export const SYSTEM_PROMPT = [
  'You are an autonomous agent that completes a task by calling tools one at a time.',
  'Each turn: think briefly, then either choose ONE action (a tool + its args) or set done=true with a respond message.',
  'Tools are marked [read] (safe), [write] (a real side effect — use sparingly and never repeat), or [engine].',
  'Before any [write] / irreversible action, call memory_recall to check you have not already done it;',
  'after a successful [write], call memory_remember so future runs skip it.',
  'Call finish (or set done=true) as soon as the goal is achieved or nothing more can help.',
  'Reply ONLY with the structured response.',
].join(' ');

function describeTool(tool: AgentTool): string {
  const fields = Object.keys(
    ((tool.inputSchema as { properties?: Record<string, unknown> }).properties ??
      {}) as Record<string, unknown>
  );
  const args = fields.length ? ` args: {${fields.join(', ')}}` : '';
  return `- ${tool.name} [${tool.kind}]: ${tool.description}${args}`;
}

export function buildPrompt(input: AgentPromptInput): string {
  const parts: string[] = [`GOAL: ${input.goal}`];
  if (input.context) {
    parts.push(`CONTEXT SO FAR:\n${input.context}`);
  }
  parts.push(`TOOLS:\n${input.tools.map(describeTool).join('\n')}`);
  if (input.memoryDigest) {
    parts.push(`MEMORY (from earlier runs):\n${input.memoryDigest}`);
  }
  if (input.observations.length) {
    parts.push(
      `RECENT RESULTS:\n${input.observations
        .map(o => `- ${o.tool}: ${o.ok ? '' : '(failed) '}${o.summary}`)
        .join('\n')}`
    );
  } else {
    parts.push('RECENT RESULTS: (none yet)');
  }
  parts.push('Decide the next action, or finish.');
  return parts.join('\n\n');
}

/**
 * Tool args reach us two ways: the CLI route emits them as a nested object,
 * while the cloud endpoint's structured output encodes them as a JSON string
 * (kept a string so its output schema stays strict — see the `raidr-agent-step`
 * endpoint). Accept either; anything else, or an unparseable string, is no args.
 */
function coerceArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not JSON — treat as no args rather than throwing.
    }
  }
  return {};
}

export function coerce(content: unknown): AgentStepOutput {
  const obj = (content ?? {}) as Record<string, unknown>;
  const rawAction = obj.action as Record<string, unknown> | undefined;
  const action =
    rawAction && typeof rawAction.tool === 'string'
      ? {
          tool: rawAction.tool,
          args: coerceArgs(rawAction.args),
        }
      : null;
  return {
    thought: typeof obj.thought === 'string' ? obj.thought : '',
    action,
    done: obj.done === true,
    ...(typeof obj.respond === 'string' ? { respond: obj.respond } : {}),
  };
}
