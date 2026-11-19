/**
 * The agent (one-shot retrieval) flow's calls to raidr_agent_api. The
 * understand → prepare → run pipeline always runs in the cloud (the raidr
 * engine): the in-app own-key path was removed, and the local CLI engines
 * (Claude Code / Codex) power the autonomous + long-lasting agent loop, not the
 * structured retrieval pipeline.
 *
 * Every raidr_agent_client call of the flow is made here, so a change in the
 * client's API touches this file only.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import type {
  IntentRequest,
  IntentResponse,
  PrepareRequest,
  PrepareResponse,
  RunRequest,
} from '@sudobility/raidr_agent_types';
import type { BaseResponse } from '@sudobility/types';
import { startRun, type RunCallbacks, type RunHandle } from './runTransport';

function unwrap<T>(response: BaseResponse<T>, what: string): T {
  if (!response.success || response.data == null) {
    throw new Error(response.error || `${what} failed`);
  }
  return response.data as T;
}

async function requiredToken(getToken: TokenGetter): Promise<string> {
  const token = await getToken();
  if (!token) {
    throw new Error('Sign in first');
  }
  return token;
}

/** Ask step: the intent and the ranked candidate sites (`POST /intent`). */
export async function understandRequest(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  body: IntentRequest
): Promise<IntentResponse> {
  return unwrap(
    await client.understandIntent(body, await requiredToken(getToken)),
    'Understanding the request'
  );
}

/** Prepare step: per-site plans and the merged form (`POST /prepare`). */
export async function prepareRequest(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  body: PrepareRequest
): Promise<PrepareResponse> {
  return unwrap(
    await client.prepare(body, await requiredToken(getToken)),
    'Preparing the sites'
  );
}

/** Run step: stream the run (`POST /runs`). */
export async function startAgentRun(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  runRequest: RunRequest,
  callbacks: RunCallbacks
): Promise<RunHandle> {
  return startRun(client, getToken, runRequest, callbacks);
}
