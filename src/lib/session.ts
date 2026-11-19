/**
 * Conversational sessions: a thread of turns the user refines over time. Each
 * turn is one run; the agent loop itself is stateless, so context is stitched
 * on the client — {@link buildTurnRequest} folds a compact summary of the
 * recent turns into the next request before it is understood and run.
 *
 * Sessions are kept on-device only (transcripts can be large and there is no
 * server need, since execution is client-side). Pure helpers here — no React,
 * storage or navigation — so they unit-test on their own.
 */

import type {
  BestData,
  ResultGroup,
  ResultItem,
} from '@sudobility/raidr_agent_types';
import type { AgentEvent } from './agentEngine/types';
import { newAgentId } from './savedAgent';

export type TurnStatus = 'running' | 'done' | 'failed';

/**
 * One exchange in a conversation. A general-assistant turn carries the agentic
 * `transcript` + `response`; a legacy retrieval turn carries `results` etc.
 */
export interface SessionTurn {
  id: string;
  /** The raw text the user typed (what the UI shows). */
  request: string;
  /** Agentic turn: the thought/action/observation stream. */
  transcript?: AgentEvent[];
  /** Agentic turn: the assistant's final reply. */
  response?: string;
  /** Retrieval turn (Phase 2): result cards. */
  results?: ResultItem[];
  best?: BestData | null;
  groups?: ResultGroup[];
  status: TurnStatus;
  error?: string;
  createdAt: string;
}

/** A multi-turn conversation. */
export interface AgentSession {
  id: string;
  title: string;
  /** The saved agent this started from, if any. */
  savedAgentId?: string;
  /** Rolling compacted summary of earlier turns (keeps the prompt bounded). */
  summary?: string;
  /** How many leading turns the {@link summary} already folds in. */
  summarizedCount?: number;
  turns: SessionTurn[];
  createdAt: string;
  updatedAt: string;
}

/** A new session id. */
export function newSessionId(): string {
  return newAgentId();
}

/** A short title from the first request. */
export function sessionTitle(request: string): string {
  const trimmed = request.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || 'New conversation';
}

/** Recent turns used for context (keeps the prompt small). */
const CONTEXT_TURNS = 3;
const SUMMARY_CHARS = 160;

function turnSummary(turn: SessionTurn): string {
  // Agentic turns carry a response; prefer it.
  if (turn.response) {
    return turn.response.length > SUMMARY_CHARS
      ? `${turn.response.slice(0, SUMMARY_CHARS)}…`
      : turn.response;
  }
  const results = turn.results ?? [];
  const top =
    (turn.best && results.find(r => r.id === turn.best?.resultId)) ||
    results[0];
  if (!top) {
    return turn.status === 'failed' ? '(no answer)' : '';
  }
  const text = [top.title, top.summary].filter(Boolean).join(' — ');
  return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS)}…` : text;
}

/**
 * Fold recent turns into the next request so the run is understood in context.
 * With no prior turns it returns the request unchanged.
 */
export function buildTurnRequest(
  priorTurns: readonly SessionTurn[],
  request: string
): string {
  const recent = priorTurns.slice(-CONTEXT_TURNS);
  if (recent.length === 0) {
    return request;
  }
  const lines = recent.map(turn => {
    const summary = turnSummary(turn);
    return summary
      ? `- You asked: "${turn.request}" → ${summary}`
      : `- You asked: "${turn.request}"`;
  });
  return [
    'Earlier in this conversation:',
    ...lines,
    '',
    `Now: ${request}`,
  ].join('\n');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeTurn(value: unknown): SessionTurn | null {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) {
    return null;
  }
  if (typeof value.request !== 'string') {
    return null;
  }
  const status: TurnStatus =
    value.status === 'running' || value.status === 'failed'
      ? value.status
      : 'done';
  return {
    id: value.id,
    request: value.request,
    ...(Array.isArray(value.transcript)
      ? { transcript: value.transcript as AgentEvent[] }
      : {}),
    ...(typeof value.response === 'string' ? { response: value.response } : {}),
    ...(Array.isArray(value.results)
      ? { results: value.results as ResultItem[] }
      : {}),
    ...(isObject(value.best) ? { best: value.best as unknown as BestData } : {}),
    ...(Array.isArray(value.groups)
      ? { groups: value.groups as ResultGroup[] }
      : {}),
    // A run that was still streaming when the app closed is marked failed.
    status: status === 'running' ? 'failed' : status,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    createdAt:
      typeof value.createdAt === 'string'
        ? value.createdAt
        : new Date().toISOString(),
  };
}

/** Coerce any persisted value to a valid, de-duplicated session list. */
export function sanitizeSessions(value: unknown): AgentSession[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: AgentSession[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    const createdAt =
      typeof item.createdAt === 'string'
        ? item.createdAt
        : new Date().toISOString();
    seen.add(item.id);
    out.push({
      id: item.id,
      title:
        typeof item.title === 'string' && item.title
          ? item.title
          : 'Conversation',
      ...(typeof item.savedAgentId === 'string'
        ? { savedAgentId: item.savedAgentId }
        : {}),
      ...(typeof item.summary === 'string' ? { summary: item.summary } : {}),
      ...(typeof item.summarizedCount === 'number' &&
      Number.isFinite(item.summarizedCount) &&
      item.summarizedCount >= 0
        ? { summarizedCount: Math.floor(item.summarizedCount) }
        : {}),
      turns: Array.isArray(item.turns)
        ? item.turns
            .map(sanitizeTurn)
            .filter((t): t is SessionTurn => t !== null)
        : [],
      createdAt,
      updatedAt:
        typeof item.updatedAt === 'string' ? item.updatedAt : createdAt,
    });
  }
  return out;
}
