/**
 * Memory compaction for long-lasting sessions: keep the prompt bounded by
 * carrying a rolling "essential info" summary plus the most recent exchanges,
 * instead of the whole transcript.
 *
 * The pure parts ({@link needsCompaction}, {@link buildContext},
 * {@link planCompaction}, {@link turnsToItems}) are tested on their own;
 * {@link createSummarizer} folds older exchanges into a new summary through the
 * same engine as the agent loop (cloud server-key or a local CLI — no user key),
 * so there is no separate AI path to configure.
 */

import type { AgentStepCaller } from './agentEngine/types';
import type { SessionTurn } from './session';

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

/** The two conversation lines (user + reply) one turn contributes. */
export function turnsToItems(turns: readonly SessionTurn[]): CompactItem[] {
  return turns.flatMap(turn => [
    { role: 'user' as const, text: turn.request },
    { role: 'agent' as const, text: turn.response ?? '(no reply)' },
  ]);
}

/**
 * The range of turn indices to fold into the summary now — everything older
 * than the most recent `keepRecent` turns that is not already folded. Returns
 * `null` when the summary is already caught up (so no model call is made).
 *
 * `from` starts at `summarizedCount` (not just the newly aged-out turn), so a
 * transient summarizer failure leaves a turn temporarily out of context but a
 * later success re-folds the whole gap — the summary never permanently loses a
 * turn.
 */
export function planCompaction(
  turnCount: number,
  summarizedCount: number,
  keepRecent = DEFAULT_KEEP_RECENT
): { from: number; to: number } | null {
  const to = Math.max(0, turnCount - keepRecent);
  const from = Math.max(0, Math.min(summarizedCount, to));
  return to > from ? { from, to } : null;
}

export interface SessionSummarizer {
  summarize(priorSummary: string, items: readonly CompactItem[]): Promise<string>;
}

/**
 * A summarizer that folds exchanges into a running summary through the agent
 * engine. It frames summarization as a no-tool agent step: the model is asked
 * to finish (done=true) with the updated summary in `respond`, so the same
 * cloud/CLI routing powers it with no extra endpoint or key. On an empty or
 * unreadable reply it keeps the prior summary rather than lose context.
 */
export function createSummarizer(caller: AgentStepCaller): SessionSummarizer {
  return {
    async summarize(priorSummary, items) {
      if (items.length === 0) {
        return priorSummary;
      }
      const exchanges = items
        .map(i => `${i.role === 'user' ? 'User' : 'Agent'}: ${i.text}`)
        .join('\n');
      const goal = [
        'Maintain a running summary of a conversation so it can continue with ' +
          'full context while staying short.',
        priorSummary
          ? `Current running summary:\n${priorSummary}`
          : 'There is no summary yet.',
        `New exchanges to fold into it:\n${exchanges}`,
        'Do not call any tool. Set done=true and put the updated running ' +
          'summary — preserving names, facts, decisions and anything needed to ' +
          'continue — in the respond field.',
      ].join('\n\n');

      const output = await caller.decide({
        goal,
        tools: [],
        memoryDigest: '',
        observations: [],
      });
      const next = (output.respond ?? '').trim() || (output.thought ?? '').trim();
      return next || priorSummary;
    },
  };
}
