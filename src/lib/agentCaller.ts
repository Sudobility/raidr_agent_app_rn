/**
 * Chooses how the agentic loop makes each model decision, mirroring the
 * cloud-or-device switch of the one-shot flow (`agentFlow.ts`):
 *
 * - **Cloud** (default): the device posts the decision's dynamic inputs to
 *   `POST /agent/step`, which calls the managed `agent` ShapeShyft endpoint
 *   with the server's key and returns the structured decision. **No user key.**
 * - **Local**: only when the user picked local mode AND has a provider key —
 *   the decision is made on-device with that key (`createAgentStepCaller`).
 *
 * Either way the loop itself and every site call stay on the device (they need
 * the Keychain tokens); only this single model decision may be delegated. The
 * `agent` endpoint owns the cloud prompt + output schema (authored on the
 * ShapeShyft service); the local prompt lives in `agentEngine/caller.ts`.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import { useSettingsStore } from '@/stores/settingsStore';
import { loadProviderKeys } from './llmKeys';
import { coerce, createAgentStepCaller } from './agentEngine/caller';
import type {
  AgentPromptInput,
  AgentStepCaller,
  AgentTool,
} from './agentEngine/types';

const AGENT_STEP_TIMEOUT_MS = 90_000;

/** The field names of a tool's input schema, shown to the model. */
function toolArgs(tool: AgentTool): string[] {
  const props = (tool.inputSchema as { properties?: Record<string, unknown> })
    .properties;
  return props ? Object.keys(props) : [];
}

/** The dynamic decision inputs the managed `agent` prompt interpolates. */
function serializeInput(input: AgentPromptInput): Record<string, unknown> {
  return {
    goal: input.goal,
    ...(input.context ? { context: input.context } : {}),
    tools: input.tools.map(tool => ({
      name: tool.name,
      kind: tool.kind,
      description: tool.description,
      args: toolArgs(tool),
    })),
    memory: input.memoryDigest,
    observations: input.observations.map(o => ({
      tool: o.tool,
      ok: o.ok,
      summary: o.summary,
    })),
  };
}

export interface CloudAgentCallerOptions {
  client: RaidrAgentClient;
  getToken: TokenGetter;
  signal?: AbortSignal;
}

/** An {@link AgentStepCaller} backed by the server's key (`POST /agent/step`). */
export function createCloudAgentStepCaller(
  options: CloudAgentCallerOptions
): AgentStepCaller {
  return {
    async decide(input) {
      if (options.signal?.aborted) {
        throw new Error('Cancelled');
      }
      const token = await options.getToken();
      const response = await options.client.invokeAgentStep(
        { input: serializeInput(input) },
        token ?? '',
        { timeout: AGENT_STEP_TIMEOUT_MS }
      );
      if (!response.success || response.data == null) {
        throw new Error(response.error || 'The agent step failed');
      }
      return coerce(response.data.output);
    },
  };
}

/**
 * The caller for an agentic run, per the `agentMode` setting. Local only when
 * the user chose it and has a key; otherwise cloud (server key, no user key).
 */
export async function resolveAgentStepCaller(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  options: { signal?: AbortSignal } = {}
): Promise<AgentStepCaller> {
  const { agentMode, providerOrder } = useSettingsStore.getState();
  if (agentMode === 'local') {
    const providers = await loadProviderKeys(providerOrder);
    if (providers.length > 0) {
      return createAgentStepCaller({
        providers,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    }
  }
  return createCloudAgentStepCaller({
    client,
    getToken,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
