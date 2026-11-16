/**
 * Tests the agentic-decision routing: the cloud caller coerces the server's
 * decision and sends the dynamic inputs, and the resolver picks cloud vs local
 * from the agentMode setting — defaulting to cloud (no user key) and falling
 * back to cloud when local mode has no key.
 */

import {
  createCloudAgentStepCaller,
  resolveAgentStepCaller,
} from '../agentCaller';
import type { AgentPromptInput } from '../agentEngine/types';

jest.mock('@/lib/llmKeys', () => ({ loadProviderKeys: jest.fn() }));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: jest.fn() },
}));

import { loadProviderKeys } from '@/lib/llmKeys';
import { useSettingsStore } from '@/stores/settingsStore';

const mockLoadKeys = loadProviderKeys as jest.Mock;
const mockGetState = (useSettingsStore as unknown as { getState: jest.Mock })
  .getState;

const INPUT: AgentPromptInput = {
  goal: 'check r/sudoku',
  tools: [
    {
      name: 'send_message',
      description: 'DM a user',
      inputSchema: { properties: { to: {}, text: {} } },
      kind: 'write',
    },
  ],
  memoryDigest: 'nothing yet',
  observations: [{ tool: 'search', ok: true, summary: '2 posts' }],
};

function cloudClient(output: unknown) {
  return {
    invokeAgentStep: jest.fn(async () => ({ success: true, data: { output } })),
  } as any;
}

const getToken = async () => 'tok';

beforeEach(() => {
  mockLoadKeys.mockReset();
  mockGetState.mockReset();
});

describe('createCloudAgentStepCaller', () => {
  it('coerces the server decision and sends the serialized inputs', async () => {
    const client = cloudClient({
      thought: 'look',
      action: { tool: 'send_message', args: { to: 'a', text: 'hi' } },
      done: false,
    });
    const caller = createCloudAgentStepCaller({ client, getToken });
    const out = await caller.decide(INPUT);

    expect(out).toEqual({
      thought: 'look',
      action: { tool: 'send_message', args: { to: 'a', text: 'hi' } },
      done: false,
    });
    const body = client.invokeAgentStep.mock.calls[0][0];
    expect(body.input.goal).toBe('check r/sudoku');
    expect(body.input.tools).toEqual([
      {
        name: 'send_message',
        kind: 'write',
        description: 'DM a user',
        args: ['to', 'text'],
      },
    ]);
    expect(body.input.observations).toEqual([
      { tool: 'search', ok: true, summary: '2 posts' },
    ]);
  });

  it('throws when the server reports failure', async () => {
    const client = {
      invokeAgentStep: jest.fn(async () => ({
        success: false,
        error: 'boom',
      })),
    } as any;
    const caller = createCloudAgentStepCaller({ client, getToken });
    await expect(caller.decide(INPUT)).rejects.toThrow('boom');
  });
});

describe('resolveAgentStepCaller', () => {
  it('uses cloud by default (cloud mode, no user key needed)', async () => {
    mockGetState.mockReturnValue({ agentMode: 'cloud', providerOrder: [] });
    const client = cloudClient({ thought: '', action: null, done: true });

    const caller = await resolveAgentStepCaller(client, getToken);
    await caller.decide(INPUT);

    expect(client.invokeAgentStep).toHaveBeenCalledTimes(1);
    expect(mockLoadKeys).not.toHaveBeenCalled();
  });

  it('falls back to cloud when local mode has no key', async () => {
    mockGetState.mockReturnValue({ agentMode: 'local', providerOrder: [] });
    mockLoadKeys.mockResolvedValue([]);
    const client = cloudClient({ thought: '', action: null, done: true });

    const caller = await resolveAgentStepCaller(client, getToken);
    await caller.decide(INPUT);

    expect(client.invokeAgentStep).toHaveBeenCalledTimes(1);
  });

  it('uses the device key when local mode has one (never calls the server)', async () => {
    mockGetState.mockReturnValue({
      agentMode: 'local',
      providerOrder: ['openai'],
    });
    mockLoadKeys.mockResolvedValue([{ provider: 'openai', key: 'sk-x' }]);
    const client = cloudClient({ thought: '', action: null, done: true });

    const localFetch = jest.fn(async () => {
      throw new Error('LOCAL_FETCH_HIT');
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = localFetch as unknown as typeof fetch;
    try {
      const caller = await resolveAgentStepCaller(client, getToken);
      await expect(caller.decide(INPUT)).rejects.toThrow('LOCAL_FETCH_HIT');
      expect(client.invokeAgentStep).not.toHaveBeenCalled();
      expect(localFetch).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
