/**
 * Run an autonomous agent on-device: pick its target site, load that site's
 * tools, and drive the agentic loop ({@link runAgentTask}) with the Keychain
 * site token and the agent's persistent memory.
 *
 * Each model decision goes through {@link resolveAgentStepCaller}: by default
 * the cloud route (server's key, no user key), or the device's own key when the
 * user chose local mode and has one. No LLM key is required. Tool actions
 * (including writes) use the device's token, so this only runs while the app is
 * alive.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import type { SavedAgent } from '@sudobility/raidr_agent_types';
import {
  DirectSiteConnector,
  type FetchLike,
} from '@sudobility/raidr_agent_lib/runner';
import { createSiteSource } from './siteCatalog';
import { getSiteToken } from './secureStorage';
import { getToolApiKey } from './toolApiKeys';
import { createAgentMemory } from './agentMemory';
import { resolveAgentStepCaller } from './agentCaller';
import { createSiteExecutor } from './agentEngine/executor';
import { buildToolset } from './agentEngine/tools';
import { runAgentTask } from './agentEngine/loop';
import type {
  AgentEvent,
  RunAgentTaskResult,
} from './agentEngine/types';

export interface AutonomousRunOptions {
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

/** The agent's goal text (explicit `goal`, else its request). */
export function agentGoal(agent: SavedAgent): string {
  return agent.goal?.trim() || agent.request;
}

/**
 * Run one autonomous agent to completion. Throws if the agent has no site to
 * act on. The model decision is routed by {@link resolveAgentStepCaller} (the
 * raidr cloud server key, or a local Claude Code / Codex CLI) — no key is
 * required.
 */
export async function runAutonomousAgent(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  agent: SavedAgent,
  options: AutonomousRunOptions = {}
): Promise<RunAgentTaskResult> {
  const apiHost = agent.sites[0]?.apiHost;
  if (!apiHost) {
    throw new Error('This agent has no site to act on.');
  }

  const catalog = createSiteSource(client, getToken);
  const manifest = await catalog.manifest(apiHost);
  const tools = buildToolset(manifest);

  const token =
    (await getSiteToken(apiHost)) ?? (await getToolApiKey(apiHost)) ?? undefined;

  const connector = new DirectSiteConnector({
    catalog,
    fetch: globalThis.fetch as unknown as FetchLike,
  });
  const session = await connector.open(apiHost, token);
  try {
    const caller = resolveAgentStepCaller(client, getToken, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return await runAgentTask({
      goal: agentGoal(agent),
      tools,
      caller,
      executor: createSiteExecutor(session),
      memory: createAgentMemory(agent.id),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } finally {
    await session.close();
  }
}

/** Headless wrapper for the scheduler: runs and resolves, swallowing events. */
export async function runAutonomousHeadless(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  agent: SavedAgent
): Promise<void> {
  await runAutonomousAgent(client, getToken, agent);
}
