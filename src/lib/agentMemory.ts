/**
 * Agent memory helpers. The pure parts (canonical JSON, idempotency keys,
 * digest, match) are unit-tested on their own; {@link createAgentMemory} binds
 * an {@link AgentMemoryPort} to the persistent store for one agent.
 */

import type { AgentMemoryPort } from './agentEngine/types';
import { useAgentMemoryStore } from '@/stores/agentMemoryStore';

/** Deterministic JSON with object keys sorted, so equal args hash equally. */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') {
      return v;
    }
    if (seen.has(v as object)) {
      return null;
    }
    seen.add(v as object);
    if (Array.isArray(v)) {
      return v.map(walk);
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      out[key] = walk((v as Record<string, unknown>)[key]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/** The memory key under which a completed write is recorded (idempotency). */
export function idempotencyKey(
  tool: string,
  args: Record<string, unknown>
): string {
  return `did:${tool}:${canonicalJson(args)}`;
}

/** Entries whose key or value contains `query` (case-insensitive); all when omitted. */
export function matchEntries(
  entries: readonly { key: string; value: string }[],
  query?: string
): { key: string; value: string }[] {
  if (!query || !query.trim()) {
    return [...entries];
  }
  const q = query.trim().toLowerCase();
  return entries.filter(
    e => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
  );
}

/** A compact, newest-first digest of entries within `budget` characters. */
export function digestEntries(
  entries: readonly { key: string; value: string; updatedAt?: string }[],
  budget = 1200
): string {
  const ordered = [...entries].sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );
  const lines: string[] = [];
  let used = 0;
  for (const e of ordered) {
    const line = `- ${e.key}: ${e.value}`;
    if (used + line.length + 1 > budget) {
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

/** An {@link AgentMemoryPort} backed by the persistent store for one agent. */
export function createAgentMemory(agentId: string): AgentMemoryPort {
  const entriesOf = (): { key: string; value: string; updatedAt: string }[] => {
    const bag = useAgentMemoryStore.getState().memories[agentId] ?? {};
    return Object.entries(bag).map(([key, e]) => ({
      key,
      value: e.value,
      updatedAt: e.updatedAt,
    }));
  };
  return {
    recall: query =>
      matchEntries(entriesOf(), query).map(({ key, value }) => ({ key, value })),
    remember: (key, value) =>
      useAgentMemoryStore.getState().set(agentId, key, value),
    has: key => {
      const bag = useAgentMemoryStore.getState().memories[agentId] ?? {};
      return Object.prototype.hasOwnProperty.call(bag, key);
    },
    digest: budget => digestEntries(entriesOf(), budget),
  };
}
