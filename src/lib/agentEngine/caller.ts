/**
 * The agentic model step: build a prompt (goal + tools + memory + observations),
 * call the user's own LLM provider directly on-device, and parse one structured
 * decision back. Uses `@sudobility/shapeshyft_engine/core`'s RN-safe
 * `buildProviderRequest` + `parseProviderResponse` — no ShapeShyft round-trip,
 * so it needs the user's own key (local providers, in their order, with
 * fallthrough), exactly like local run mode.
 */

import {
  buildProviderRequest,
  parseProviderResponse,
  type LlmProvider,
} from '@sudobility/shapeshyft_engine/core';
import type { LocalLlmProvider } from '@/config/llmProviders';
import {
  type AgentPromptInput,
  type AgentStepCaller,
  type AgentStepOutput,
  type AgentTool,
} from './types';

/** A provider the user has a key for, in the order to try them. */
export interface ProviderCredential {
  provider: LocalLlmProvider;
  key: string;
}

const PROVIDER_TIMEOUT_MS = 90_000;

/** JSON schema for one decision (the forced structured response). */
const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thought: {
      type: 'string',
      description: 'Brief reasoning for what to do next.',
    },
    action: {
      type: 'object',
      description: 'The single tool to call now. Omit when the task is done.',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object' },
      },
      required: ['tool', 'args'],
    },
    done: {
      type: 'boolean',
      description: 'true when the task is complete (or cannot proceed).',
    },
    respond: {
      type: 'string',
      description: 'Message to the user / summary of what was done, when done.',
    },
  },
  required: ['thought', 'done'],
};

const SYSTEM_PROMPT = [
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

function buildPrompt(input: AgentPromptInput): string {
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

function coerce(content: unknown): AgentStepOutput {
  const obj = (content ?? {}) as Record<string, unknown>;
  const rawAction = obj.action as Record<string, unknown> | undefined;
  const action =
    rawAction && typeof rawAction.tool === 'string'
      ? {
          tool: rawAction.tool,
          args:
            rawAction.args && typeof rawAction.args === 'object'
              ? (rawAction.args as Record<string, unknown>)
              : {},
        }
      : null;
  return {
    thought: typeof obj.thought === 'string' ? obj.thought : '',
    action,
    done: obj.done === true,
    ...(typeof obj.respond === 'string' ? { respond: obj.respond } : {}),
  };
}

export interface AgentCallerOptions {
  providers: ProviderCredential[];
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/** An {@link AgentStepCaller} backed by the user's own provider keys. */
export function createAgentStepCaller(
  options: AgentCallerOptions
): AgentStepCaller {
  const doFetch = options.fetch ?? globalThis.fetch;

  const callOne = async (
    input: AgentPromptInput,
    { provider, key }: ProviderCredential
  ): Promise<AgentStepOutput> => {
    const request = buildProviderRequest({
      provider: provider as LlmProvider,
      systemPrompt: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      outputSchema: OUTPUT_SCHEMA,
      temperature: 0,
    });

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await doFetch(request.url, {
        method: request.method,
        headers: {
          ...request.headers,
          [request.auth.header]: `${request.auth.prefix}${key}`,
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const parsed = parseProviderResponse(
        request.provider as LlmProvider,
        JSON.parse(text)
      );
      if (parsed.content == null || typeof parsed.content !== 'object') {
        throw new Error('The model did not return a decision');
      }
      return coerce(parsed.content);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  };

  return {
    async decide(input) {
      if (options.providers.length === 0) {
        throw new Error('No AI provider key is set up');
      }
      const failures: string[] = [];
      for (const credential of options.providers) {
        if (options.signal?.aborted) {
          throw new Error('Cancelled');
        }
        try {
          return await callOne(input, credential);
        } catch (error) {
          if (options.signal?.aborted) {
            throw error;
          }
          failures.push(
            `${credential.provider}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      throw new Error(failures.join('; '));
    },
  };
}
