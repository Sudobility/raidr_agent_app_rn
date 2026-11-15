/**
 * Running a saved agent, client-side.
 *
 * A saved agent is replayed exactly like a fresh request: re-prepare its stored
 * intent + sites ({@link prepareRequest}) to get the current per-site plan
 * (tools, sign-in need), then seed the shared run-flow store and let the
 * existing Results screen stream the run. The run uses the device's Keychain
 * tokens (fetched by Results via `buildRunSites`) and lands in History the same
 * way an interactive run does — cloud or local per the user's agent mode.
 *
 * Re-preparing (rather than replaying a stored plan) keeps tools and auth
 * requirements fresh if a site has changed since the agent was saved.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import type {
  PrepareResponse,
  SavedAgent,
} from '@sudobility/raidr_agent_types';
import { prepareRequest, startAgentRun } from './agentFlow';
import { buildRunSites, supportedSites } from './prepare';
import { getSiteToken } from './secureStorage';
import { getToolApiKey } from './toolApiKeys';
import { useRunFlowStore } from '@/stores/runFlowStore';

/** Re-prepare a saved agent's stored intent and sites. */
export async function prepareSavedAgent(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  agent: SavedAgent
): Promise<PrepareResponse> {
  return prepareRequest(client, getToken, {
    request: agent.request,
    intent: agent.intent,
    sites: agent.sites.map(s => s.apiHost),
    ...(agent.location ? { location: agent.location } : {}),
  });
}

/** Seed the run-flow store so the shared Results screen runs this agent. */
export function seedRunFlow(agent: SavedAgent, plan: PrepareResponse): void {
  const store = useRunFlowStore.getState();
  store.setFlow(agent.request, agent.intent, [], agent.location ?? null);
  store.setPlan(plan);
  store.setInputs(agent.inputs);
}

/**
 * Prepare a saved agent and seed the run-flow store. The caller navigates to
 * the Results screen afterwards. Throws if preparing fails.
 */
export async function prepareAndSeedSavedAgent(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  agent: SavedAgent
): Promise<void> {
  const plan = await prepareSavedAgent(client, getToken, agent);
  seedRunFlow(agent, plan);
}

/**
 * Run a saved agent to completion with no UI (used by the scheduler). Prepares,
 * re-fetches Keychain tokens, runs, and resolves when the run finishes or
 * fails. The run lands in History the normal way. A site needing sign-in whose
 * token is missing/expired simply fails for that site; the run is not retried.
 */
export async function runSavedAgentHeadless(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  agent: SavedAgent
): Promise<void> {
  const plan = await prepareSavedAgent(client, getToken, agent);
  const supported = supportedSites(plan);
  if (supported.length === 0) {
    return;
  }
  const tokens: Record<string, string | null> = {};
  for (const p of supported) {
    tokens[p.apiHost] =
      p.login === 'none'
        ? null
        : p.credentialType === 'api_key'
        ? await getToolApiKey(p.apiHost)
        : await getSiteToken(p.apiHost);
  }
  await new Promise<void>(resolve => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    startAgentRun(
      client,
      getToken,
      {
        request: agent.request,
        intent: agent.intent,
        sites: buildRunSites(supported, tokens),
        inputs: agent.inputs,
        ...(agent.location ? { location: agent.location } : {}),
      },
      { onPart: () => {}, onError: () => done(), onFinish: () => done() }
    ).catch(() => done());
  });
}
