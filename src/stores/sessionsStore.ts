/**
 * Conversational sessions, persisted on-device (AsyncStorage). Local-only: the
 * transcript lives here; each turn's run still lands in server History through
 * the normal run path. No secrets are stored.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sanitizeSessions,
  sessionTitle,
  newSessionId,
  type AgentSession,
  type SessionTurn,
} from '@/lib/session';

interface SessionsState {
  sessions: AgentSession[];
  /** Create an empty session and return its id. */
  create: (savedAgentId?: string) => string;
  /** Append a turn to a session (also sets the title from the first turn). */
  addTurn: (sessionId: string, turn: SessionTurn) => void;
  /** Patch an existing turn (e.g. stream results, mark done/failed). */
  updateTurn: (
    sessionId: string,
    turnId: string,
    patch: Partial<SessionTurn>
  ) => void;
  /** Set the rolling compacted summary for a session. */
  setSummary: (sessionId: string, summary: string) => void;
  remove: (sessionId: string) => void;
  clear: () => void;
}

/** Newest-updated first. */
function sortSessions(list: readonly AgentSession[]): AgentSession[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    set => ({
      sessions: [],
      create: savedAgentId => {
        const id = newSessionId();
        const now = new Date().toISOString();
        set(state => ({
          sessions: sortSessions([
            {
              id,
              title: '',
              ...(savedAgentId ? { savedAgentId } : {}),
              turns: [],
              createdAt: now,
              updatedAt: now,
            },
            ...state.sessions,
          ]),
        }));
        return id;
      },
      addTurn: (sessionId, turn) =>
        set(state => ({
          sessions: sortSessions(
            state.sessions.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    title: s.title || sessionTitle(turn.request),
                    turns: [...s.turns, turn],
                    updatedAt: new Date().toISOString(),
                  }
                : s
            )
          ),
        })),
      updateTurn: (sessionId, turnId, patch) =>
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  turns: s.turns.map(tn =>
                    tn.id === turnId ? { ...tn, ...patch } : tn
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : s
          ),
        })),
      setSummary: (sessionId, summary) =>
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === sessionId ? { ...s, summary } : s
          ),
        })),
      remove: sessionId =>
        set(state => ({
          sessions: state.sessions.filter(s => s.id !== sessionId),
        })),
      clear: () => set({ sessions: [] }),
    }),
    {
      name: 'raidr-agent-sessions',
      version: 0,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ sessions: state.sessions }),
      merge: (persisted, current) => ({
        ...current,
        sessions: sanitizeSessions(
          (persisted as { sessions?: unknown } | undefined)?.sessions
        ),
      }),
    }
  )
);
