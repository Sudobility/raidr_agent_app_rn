/**
 * Run one turn of the general multi-site assistant on-device.
 *
 * Per message: understand the request to pick candidate sites, load the top
 * few sites' tools into one namespaced toolset, then drive the agentic loop
 * ({@link runAgentTask}) across them with the user's LLM key, each site's
 * Keychain token, and the session's persistent memory. Prior context is folded
 * in via compaction so the prompt stays bounded.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import {
  DirectSiteConnector,
  type FetchLike,
} from '@sudobility/raidr_agent_lib/runner';
import { useSettingsStore } from '@/stores/settingsStore';
import { loadProviderKeys } from './llmKeys';
import { createSiteSource } from './localAgent';
import { understandRequest } from './agentFlow';
import { getDeviceContext } from './deviceContext';
import { getSiteToken } from './secureStorage';
import { getToolApiKey } from './toolApiKeys';
import { createAgentMemory } from './agentMemory';
import { createAgentStepCaller } from './agentEngine/caller';
import { runAgentTask } from './agentEngine/loop';
import {
  buildMultiSiteToolset,
  createMultiSiteExecutor,
  siteSlug,
  type SiteAuth,
  type SiteToolset,
} from './agentEngine/multiSite';
import type { AgentEvent, RunAgentTaskResult } from './agentEngine/types';
import { NoLlmKeyError } from './autonomousRun';

/** Most sites one assistant turn pulls tools from (keeps the toolset bounded). */
const MAX_ASSISTANT_SITES = 4;

export interface AssistantTurnOptions {
  /** Prior compacted conversation context. */
  context?: string;
  /** Persistent memory namespace (the session id). */
  memoryId: string;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export interface AssistantTurnResult extends RunAgentTaskResult {
  /** The apiHosts whose tools were available this turn. */
  sites: string[];
}

export async function runAssistantTurn(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  message: string,
  options: AssistantTurnOptions
): Promise<AssistantTurnResult> {
  const { providerOrder } = useSettingsStore.getState();
  const providers = await loadProviderKeys(providerOrder);
  if (providers.length === 0) {
    throw new NoLlmKeyError();
  }

  // Pick candidate sites for this message.
  const understood = await understandRequest(client, getToken, {
    request: message,
    ...getDeviceContext(),
  });
  const apiHosts = Array.from(
    new Set(understood.candidates.map(c => c.apiHost))
  ).slice(0, MAX_ASSISTANT_SITES);

  const catalog = createSiteSource(client, getToken);
  const sites: SiteToolset[] = [];
  const auth: SiteAuth[] = [];
  for (const apiHost of apiHosts) {
    try {
      const manifest = await catalog.manifest(apiHost);
      const slug = siteSlug(apiHost);
      sites.push({ slug, apiHost, manifest });
      const token =
        (await getSiteToken(apiHost)) ??
        (await getToolApiKey(apiHost)) ??
        undefined;
      auth.push({ slug, apiHost, ...(token ? { token } : {}) });
    } catch {
      // A site whose manifest can't load is simply left out of this turn.
    }
  }

  const tools = buildMultiSiteToolset(sites);
  const connector = new DirectSiteConnector({
    catalog,
    fetch: globalThis.fetch as unknown as FetchLike,
  });
  const executor = createMultiSiteExecutor(connector, auth);

  try {
    const caller = createAgentStepCaller({
      providers,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const result = await runAgentTask({
      goal: message,
      tools,
      caller,
      executor,
      memory: createAgentMemory(options.memoryId),
      ...(options.context ? { context: options.context } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return { ...result, sites: sites.map(s => s.apiHost) };
  } finally {
    await executor.close();
  }
}
