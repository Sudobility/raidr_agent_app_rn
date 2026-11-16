/**
 * Pure helpers for saved agents (no React, storage or navigation imports, so
 * they unit-test on their own):
 *
 * - {@link sanitizeSavedAgents}: coerce any persisted/synced blob to a valid
 *   list (used by the store's `merge` and by the sync pull);
 * - {@link buildSavedAgentFromRun}: turn a finished/prepared run into a saved
 *   agent definition (a {@link RunRequest} minus tokens, plus a name);
 * - {@link mergeAgents}: last-write-wins merge of a local and a remote list,
 *   per agent by {@link SavedAgent.updatedAt} (the sync reconciliation);
 * - document helpers for the server sync blob.
 */

import {
  SAVED_AGENTS_DOCUMENT_VERSION,
  type AgentIntent,
  type FormValue,
  type GeoLocation,
  type SavedAgent,
  type SavedAgentSite,
  type SavedAgentsDocument,
} from '@sudobility/raidr_agent_types';

/** A reasonably unique client id (uuid v4 when a CSPRNG is available). */
export function newAgentId(): string {
  const getRandom = (globalThis.crypto as Crypto | undefined)?.getRandomValues;
  if (getRandom) {
    const bytes = new Uint8Array(16);
    getRandom.call(globalThis.crypto, bytes);
    /* eslint-disable no-bitwise */
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    /* eslint-enable no-bitwise */
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') +
      '-' +
      hex.slice(4, 6).join('') +
      '-' +
      hex.slice(6, 8).join('') +
      '-' +
      hex.slice(8, 10).join('') +
      '-' +
      hex.slice(10, 16).join('')
    );
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeSites(value: unknown): SavedAgentSite[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: SavedAgentSite[] = [];
  for (const item of value) {
    if (!isObject(item) || typeof item.apiHost !== 'string' || !item.apiHost) {
      continue;
    }
    const tools = Array.isArray(item.tools)
      ? item.tools.filter((x): x is string => typeof x === 'string')
      : undefined;
    out.push({ apiHost: item.apiHost, ...(tools ? { tools } : {}) });
  }
  return out;
}

function sanitizeInputs(value: unknown): Record<string, FormValue> {
  if (!isObject(value)) {
    return {};
  }
  const out: Record<string, FormValue> = {};
  for (const [key, v] of Object.entries(value)) {
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      out[key] = v;
    } else if (
      Array.isArray(v) &&
      v.every((x): x is string => typeof x === 'string')
    ) {
      out[key] = v;
    }
  }
  return out;
}

function sanitizeLocation(value: unknown): GeoLocation | undefined {
  if (
    isObject(value) &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number'
  ) {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
      ...(typeof value.accuracy === 'number'
        ? { accuracy: value.accuracy }
        : {}),
    };
  }
  return undefined;
}

/** One sanitized agent, or null if it cannot be trusted. */
function sanitizeAgent(value: unknown): SavedAgent | null {
  if (!isObject(value)) {
    return null;
  }
  const { id, name, request, intent } = value;
  if (typeof id !== 'string' || !id) {
    return null;
  }
  if (typeof request !== 'string' || !isObject(intent)) {
    return null;
  }
  const now = new Date().toISOString();
  const createdAt =
    typeof value.createdAt === 'string' ? value.createdAt : now;
  const updatedAt =
    typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  const location = sanitizeLocation(value.location);
  return {
    id,
    name: typeof name === 'string' && name ? name : request.slice(0, 80),
    ...(Array.isArray(value.tags)
      ? {
          tags: value.tags.filter((x): x is string => typeof x === 'string'),
        }
      : {}),
    ...(value.mode === 'autonomous' ? { mode: 'autonomous' as const } : {}),
    ...(typeof value.goal === 'string' ? { goal: value.goal } : {}),
    request,
    intent: intent as unknown as AgentIntent,
    sites: sanitizeSites(value.sites),
    inputs: sanitizeInputs(value.inputs),
    // Schedule shape is validated by the scheduler (Phase 3); keep it opaque here.
    ...(isObject(value.schedule) || value.schedule === null
      ? { schedule: value.schedule as SavedAgent['schedule'] }
      : {}),
    ...(location ? { location } : {}),
    createdAt,
    updatedAt,
  };
}

/** Coerce any persisted/synced value to a valid, de-duplicated agent list. */
export function sanitizeSavedAgents(value: unknown): SavedAgent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: SavedAgent[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const agent = sanitizeAgent(item);
    if (agent && !seen.has(agent.id)) {
      seen.add(agent.id);
      out.push(agent);
    }
  }
  return out;
}

export interface BuildSavedAgentParams {
  name: string;
  request: string;
  intent: AgentIntent;
  /** The run's chosen sites (apiHost + the tools prepare picked). */
  sites: SavedAgentSite[];
  inputs: Record<string, FormValue>;
  location?: GeoLocation | null;
  tags?: string[];
  /** Overridable for tests. */
  now?: () => string;
  id?: string;
}

/** Build a new saved agent from a prepared/finished run. */
export function buildSavedAgentFromRun(
  params: BuildSavedAgentParams
): SavedAgent {
  const now = (params.now ?? (() => new Date().toISOString()))();
  return {
    id: params.id ?? newAgentId(),
    name: params.name.trim() || params.request.slice(0, 80),
    ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
    request: params.request,
    intent: params.intent,
    sites: params.sites,
    inputs: params.inputs,
    schedule: null,
    ...(params.location ? { location: params.location } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** Bump `updatedAt` on an edited agent. */
export function touchAgent(agent: SavedAgent, now?: () => string): SavedAgent {
  return { ...agent, updatedAt: (now ?? (() => new Date().toISOString()))() };
}

/**
 * Last-write-wins merge of two agent lists, per id by `updatedAt`. Agents on
 * only one side are kept; when both sides have an id, the newer `updatedAt`
 * wins. Used to reconcile the local store with the server copy.
 */
export function mergeAgents(
  local: readonly SavedAgent[],
  remote: readonly SavedAgent[]
): SavedAgent[] {
  const byId = new Map<string, SavedAgent>();
  for (const agent of local) {
    byId.set(agent.id, agent);
  }
  for (const agent of remote) {
    const existing = byId.get(agent.id);
    if (
      !existing ||
      new Date(agent.updatedAt).getTime() >=
        new Date(existing.updatedAt).getTime()
    ) {
      byId.set(agent.id, agent);
    }
  }
  return Array.from(byId.values());
}

/** Wrap an agent list in the synced settings document. */
export function toDocument(
  agents: readonly SavedAgent[],
  now?: () => string
): SavedAgentsDocument {
  return {
    version: SAVED_AGENTS_DOCUMENT_VERSION,
    agents: [...agents],
    updatedAt: (now ?? (() => new Date().toISOString()))(),
  };
}
