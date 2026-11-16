/**
 * The client-side agent scheduler.
 *
 * While the app process is alive (foregrounded on mobile; kept running by the
 * menubar/tray host on desktop), this ticks every {@link TICK_MS} and runs any
 * enabled saved-agent schedule that is due, on-device, with the Keychain
 * tokens. After a run it records `lastRunAt` so the next slot is computed from
 * it (and syncs across devices so another device won't double-fire). There is
 * no server scheduler: if the app is not running, nothing fires.
 *
 * Mounted once near the app root ({@link useAgentScheduler}).
 */

import { useEffect, useRef } from 'react';
import { useApi } from '@/context/ApiContext';
import { useAuth } from '@/context/AuthContext';
import { useAgentClient } from '@/hooks/useAgentClient';
import { useSavedAgentsStore } from '@/stores/savedAgentsStore';
import { runSavedAgentHeadless } from './agentRun';
import { runAutonomousHeadless } from './autonomousRun';
import { isDue } from './schedule';

/** How often to check for due agents. */
const TICK_MS = 30_000;

export function useAgentScheduler(): void {
  const { isReady, userId } = useApi();
  const client = useAgentClient();
  const { getToken } = useAuth();
  const enabled = isReady && !!userId;

  // Agents currently running, so a long run isn't started twice.
  const running = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let stopped = false;

    const tick = async () => {
      const now = Date.now();
      const agents = useSavedAgentsStore.getState().agents;
      for (const agent of agents) {
        if (stopped) {
          return;
        }
        if (running.current.has(agent.id) || !isDue(agent.schedule, now)) {
          continue;
        }
        running.current.add(agent.id);
        try {
          if (agent.mode === 'autonomous') {
            await runAutonomousHeadless(client, getToken, agent);
          } else {
            await runSavedAgentHeadless(client, getToken, agent);
          }
        } catch {
          // A failed scheduled run is recorded in History by the run path;
          // swallow here so one bad agent doesn't stop the others.
        } finally {
          running.current.delete(agent.id);
        }
        // Record the run so the next fire is computed from it. Re-read the
        // agent in case it was edited while running.
        const current = useSavedAgentsStore
          .getState()
          .agents.find(a => a.id === agent.id);
        if (current?.schedule) {
          const ranAt = new Date().toISOString();
          useSavedAgentsStore.getState().upsert({
            ...current,
            schedule: { ...current.schedule, lastRunAt: ranAt },
            updatedAt: ranAt,
          });
        }
      }
    };

    const timer = setInterval(() => {
      if (!stopped) {
        void tick();
      }
    }, TICK_MS);
    // Catch up once on mount (e.g. the app was just opened).
    void tick();

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, client, getToken]);
}
