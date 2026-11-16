/**
 * Persistent per-agent memory (on-device, AsyncStorage). This is what lets a
 * scheduled autonomous agent remember across firings — e.g. "already messaged
 * this user" — and what backstops write idempotency. No secrets live here.
 *
 * Shape: `memories[agentId][key] = { value, updatedAt }`. Local-only for now
 * (can grow large; server sync is deferred).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MemoryEntry {
  value: string;
  updatedAt: string;
}

export type AgentMemories = Record<string, Record<string, MemoryEntry>>;

interface AgentMemoryState {
  memories: AgentMemories;
  set: (agentId: string, key: string, value: string) => void;
  /** Remove one key, or the whole agent when `key` is omitted. */
  forget: (agentId: string, key?: string) => void;
  clear: () => void;
}

/** Coerce any persisted value to a valid memories map. */
export function sanitizeMemories(value: unknown): AgentMemories {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: AgentMemories = {};
  for (const [agentId, entries] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      continue;
    }
    const bag: Record<string, MemoryEntry> = {};
    for (const [key, entry] of Object.entries(
      entries as Record<string, unknown>
    )) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>;
        if (typeof e.value === 'string') {
          bag[key] = {
            value: e.value,
            updatedAt:
              typeof e.updatedAt === 'string'
                ? e.updatedAt
                : new Date(0).toISOString(),
          };
        }
      } else if (typeof entry === 'string') {
        // Tolerate a plain string that was stored before the entry shape.
        bag[key] = { value: entry, updatedAt: new Date(0).toISOString() };
      }
    }
    if (Object.keys(bag).length > 0) {
      out[agentId] = bag;
    }
  }
  return out;
}

export const useAgentMemoryStore = create<AgentMemoryState>()(
  persist(
    set => ({
      memories: {},
      set: (agentId, key, value) =>
        set(state => ({
          memories: {
            ...state.memories,
            [agentId]: {
              ...(state.memories[agentId] ?? {}),
              [key]: { value, updatedAt: new Date().toISOString() },
            },
          },
        })),
      forget: (agentId, key) =>
        set(state => {
          if (!state.memories[agentId]) {
            return state;
          }
          if (key === undefined) {
            const next = { ...state.memories };
            delete next[agentId];
            return { memories: next };
          }
          const bag = { ...state.memories[agentId] };
          delete bag[key];
          return { memories: { ...state.memories, [agentId]: bag } };
        }),
      clear: () => set({ memories: {} }),
    }),
    {
      name: 'raidr-agent-memory',
      version: 0,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ memories: state.memories }),
      merge: (persisted, current) => ({
        ...current,
        memories: sanitizeMemories(
          (persisted as { memories?: unknown } | undefined)?.memories
        ),
      }),
    }
  )
);
