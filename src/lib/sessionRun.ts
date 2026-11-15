/**
 * Running one conversation turn, client-side.
 *
 * A turn is a full request run with no wizard: understand the (context-folded)
 * request, auto-select the top-ranked candidate sites, prepare them, then run
 * with the device's Keychain tokens. Results stream back through the same
 * {@link RunCallbacks} the interactive Results screen uses, and the run lands
 * in History the normal way (cloud or local per the user's agent mode).
 *
 * Conversational turns run without the prepared form (no inputs); refining is
 * done by asking a follow-up, not by filling fields.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import { understandRequest, prepareRequest, startAgentRun } from './agentFlow';
import { getDeviceContext } from './deviceContext';
import { buildRunSites, supportedSites } from './prepare';
import { MAX_SELECTED_SITES } from './sites';
import { getSiteToken } from './secureStorage';
import { getToolApiKey } from './toolApiKeys';
import type { RunCallbacks, RunHandle } from './runTransport';

/**
 * Understand → auto-select → prepare → run one turn. Throws if the request
 * cannot be understood, no site is found, or none can handle it (the caller
 * marks the turn failed); otherwise returns the run handle.
 */
export async function runTurn(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  request: string,
  callbacks: RunCallbacks
): Promise<RunHandle> {
  const understood = await understandRequest(client, getToken, {
    request,
    ...getDeviceContext(),
  });
  const { intent, candidates } = understood;
  if (candidates.length === 0) {
    throw new Error('No sites can handle this request yet.');
  }

  const sites = candidates.slice(0, MAX_SELECTED_SITES).map(c => c.apiHost);
  const plan = await prepareRequest(client, getToken, {
    request,
    intent,
    sites,
  });
  const supported = supportedSites(plan);
  if (supported.length === 0) {
    throw new Error('No site could handle this request.');
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

  return startAgentRun(
    client,
    getToken,
    { request, intent, sites: buildRunSites(supported, tokens), inputs: {} },
    callbacks
  );
}
