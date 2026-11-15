/**
 * Keeps the local saved-agents store in sync with the per-user server copy so
 * agents follow the user across devices. The server is a passive store; all
 * scheduling and execution stay on the client.
 *
 * - Pull: when the server document loads, last-write-wins merge it into the
 *   local store (per agent by `updatedAt`), once per sign-in.
 * - Push: after a local change (and once the first merge has happened),
 *   debounce-write the whole document back.
 *
 * Mounted once near the app root ({@link useAgentSync}).
 */

import { useEffect, useRef } from 'react';
import {
  useAgentSettings,
  useSaveAgentSettings,
} from '@sudobility/raidr_agent_client';
import type { SavedAgent } from '@sudobility/raidr_agent_types';
import { useApi } from '@/context/ApiContext';
import { useAuth } from '@/context/AuthContext';
import { useSavedAgentsStore } from '@/stores/savedAgentsStore';
import { mergeAgents, sanitizeSavedAgents, toDocument } from './savedAgent';

/** How long after the last local change to push. */
const PUSH_DEBOUNCE_MS = 1500;

/** A cheap change signature: id + updatedAt of every agent, order-independent. */
function signature(agents: readonly SavedAgent[]): string {
  return agents
    .map(a => `${a.id}@${a.updatedAt}`)
    .sort()
    .join('|');
}

export function useAgentSync(): void {
  const { networkClient, baseUrl, isReady, userId } = useApi();
  const { getToken } = useAuth();
  const enabled = isReady && !!userId;

  const settingsQuery = useAgentSettings(networkClient, baseUrl, getToken, {
    enabled,
  });
  const save = useSaveAgentSettings(networkClient, baseUrl, getToken);
  const saveRef = useRef(save);
  saveRef.current = save;

  const agents = useSavedAgentsStore(s => s.agents);
  const replaceAll = useSavedAgentsStore(s => s.replaceAll);

  /** Signature last written to or read from the server; '' until first merge. */
  const syncedSig = useRef('');
  const mergedForUser = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when the user changes (sign in/out).
  useEffect(() => {
    mergedForUser.current = null;
    syncedSig.current = '';
  }, [userId]);

  // Pull + merge, once per sign-in.
  useEffect(() => {
    if (!enabled || !userId || !settingsQuery.data) {
      return;
    }
    if (mergedForUser.current === userId) {
      return;
    }
    mergedForUser.current = userId;
    const remote = sanitizeSavedAgents(settingsQuery.data.agents);
    const local = useSavedAgentsStore.getState().agents;
    const merged = mergeAgents(local, remote);
    replaceAll(merged);
    const remoteSig = signature(remote);
    const mergedSig = signature(merged);
    syncedSig.current = mergedSig;
    // Local had newer or extra agents: write the merged result back.
    if (mergedSig !== remoteSig) {
      saveRef.current.mutate(toDocument(merged));
    }
  }, [enabled, userId, settingsQuery.data, replaceAll]);

  // Push local changes (debounced), only after the first merge.
  useEffect(() => {
    if (!enabled || mergedForUser.current !== userId) {
      return;
    }
    const sig = signature(agents);
    if (sig === syncedSig.current) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      syncedSig.current = sig;
      saveRef.current.mutate(toDocument(useSavedAgentsStore.getState().agents));
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [agents, enabled, userId]);
}
