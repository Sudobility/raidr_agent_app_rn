/**
 * The user's saved agents, persisted on-device (AsyncStorage) so the client
 * scheduler and the Agents tab can read them instantly and offline. This local
 * store is the source of truth for execution; `src/lib/agentSync.ts` reconciles
 * it with the server copy so the agents follow the user across devices.
 *
 * No secrets live here: a saved agent is a run definition (request, intent,
 * chosen sites, form answers, optional schedule) minus the per-run site tokens,
 * which are always re-fetched from the Keychain at run time.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedAgent } from '@sudobility/raidr_agent_types';
import { sanitizeSavedAgents } from '@/lib/savedAgent';

interface SavedAgentsState {
  agents: SavedAgent[];
  /** Insert or replace an agent by id (the caller owns its timestamps). */
  upsert: (agent: SavedAgent) => void;
  /** Remove an agent by id. */
  remove: (id: string) => void;
  /** Replace the whole list (used by the sync merge). */
  replaceAll: (agents: SavedAgent[]) => void;
  clear: () => void;
}

/** Newest-edited first. */
export function sortAgents(list: readonly SavedAgent[]): SavedAgent[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export const useSavedAgentsStore = create<SavedAgentsState>()(
  persist(
    set => ({
      agents: [],
      upsert: agent =>
        set(state => ({
          agents: sortAgents([
            ...state.agents.filter(a => a.id !== agent.id),
            agent,
          ]),
        })),
      remove: id =>
        set(state => ({ agents: state.agents.filter(a => a.id !== id) })),
      replaceAll: agents => set({ agents: sortAgents(agents) }),
      clear: () => set({ agents: [] }),
    }),
    {
      name: 'raidr-agent-saved-agents',
      version: 0,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ agents: state.agents }),
      merge: (persisted, current) => ({
        ...current,
        agents: sanitizeSavedAgents(
          (persisted as { agents?: unknown } | undefined)?.agents
        ),
      }),
    }
  )
);
