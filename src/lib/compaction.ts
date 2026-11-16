/**
 * Memory compaction for long-lasting sessions: keep the prompt bounded by
 * carrying a rolling "essential info" summary plus the most recent exchanges,
 * instead of the whole transcript.
 *
 * The pure parts ({@link needsCompaction}, {@link buildContext}) are tested on
 * their own; {@link createSessionSummarizer} folds older exchanges into a new
 * summary with the user's own provider (same on-device path as the agent loop).
 */

import {
  buildProviderRequest,
  parseProviderResponse,
  type LlmProvider,
} from '@sudobility/shapeshyft_engine/core';
import type { ProviderCredential } from './agentEngine/caller';

/** One line of conversation for the context / summarizer. */
export interface CompactItem {
  role: 'user' | 'agent';
  text: string;
}

/** Characters of running context above which we fold older turns into the summary. */
export const DEFAULT_CONTEXT_BUDGET = 4000;
/** Exchanges kept verbatim; older ones get summarized. */
export const DEFAULT_KEEP_RECENT = 6;

export function needsCompaction(
  contextChars: number,
  budget = DEFAULT_CONTEXT_BUDGET
): boolean {
  return contextChars > budget;
}

/** The context string fed into a turn: prior summary + recent exchanges. */
export function buildContext(
  summary: string,
  recent: readonly CompactItem[]
): string {
  const lines = recent.map(
    i => `${i.role === 'user' ? 'User' : 'Agent'}: ${i.text}`
  );
  return [
    summary ? `Summary of earlier conversation:\n${summary}` : '',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n');
}

const SUMMARY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'string',
      description:
        'A concise running summary of the conversation that preserves names, ' +
        'facts, decisions and anything needed to continue — a few sentences.',
    },
  },
  required: ['summary'],
};

export interface SessionSummarizer {
  summarize(priorSummary: string, items: readonly CompactItem[]): Promise<string>;
}

/** A summarizer backed by the user's provider keys (fallthrough in order). */
export function createSessionSummarizer(
  providers: readonly ProviderCredential[],
  deps: { fetch?: typeof fetch } = {}
): SessionSummarizer {
  const doFetch = deps.fetch ?? globalThis.fetch;
  return {
    async summarize(priorSummary, items) {
      const prompt = [
        priorSummary ? `Current summary:\n${priorSummary}` : 'No summary yet.',
        'New exchanges to fold in:',
        ...items.map(i => `${i.role === 'user' ? 'User' : 'Agent'}: ${i.text}`),
        'Produce the updated running summary.',
      ].join('\n\n');
      const failures: string[] = [];
      for (const { provider, key } of providers) {
        try {
          const request = buildProviderRequest({
            provider: provider as LlmProvider,
            systemPrompt:
              'You compress a conversation into a short running summary without losing essentials.',
            prompt,
            outputSchema: SUMMARY_SCHEMA,
            temperature: 0,
          });
          const response = await doFetch(request.url, {
            method: request.method,
            headers: {
              ...request.headers,
              [request.auth.header]: `${request.auth.prefix}${key}`,
            },
            body: JSON.stringify(request.body),
          });
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const parsed = parseProviderResponse(
            request.provider as LlmProvider,
            JSON.parse(text)
          );
          const summary = (parsed.content as { summary?: unknown } | null)
            ?.summary;
          if (typeof summary === 'string' && summary.trim()) {
            return summary.trim();
          }
          throw new Error('no summary returned');
        } catch (error) {
          failures.push(
            `${provider}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      throw new Error(failures.join('; '));
    },
  };
}
