/**
 * Tests the agentic-decision routing: the cloud caller coerces the server's
 * decision and sends the dynamic inputs, and the resolver picks cloud vs the
 * local CLI agent from the agentMode setting (cloud is the default, no key).
 */

import {
  createCloudAgentStepCaller,
  resolveAgentStepCaller,
} from '../agentCaller';
import type { AgentPromptInput } from '../agentEngine/types';

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: jest.fn() },
}));
jest.mock('@/native/cliAgent', () => ({
  getCliAgentBridge: jest.fn(),
  cliAgentSupported: () => true,
  CLI_AGENTS: ['claude', 'codex'],
}));

import { useSettingsStore } from '@/stores/settingsStore';
import { getCliAgentBridge } from '@/native/cliAgent';

const mockGetState = (useSettingsStore as unknown as { getState: jest.Mock })
  .getState;
const mockGetBridge = getCliAgentBridge as jest.Mock;

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
  mockGetState.mockReset();
  mockGetBridge.mockReset();
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

  it('parses action args delivered as a JSON-encoded string', async () => {
    // The managed `raidr-agent-step` endpoint keeps args a string so its
    // structured output stays strict; the caller must decode it to an object.
    const client = cloudClient({
      thought: 'message bob',
      action: {
        tool: 'send_message',
        args: '{"to":"bob","text":"hi"}',
      },
      done: false,
    });
    const caller = createCloudAgentStepCaller({ client, getToken });
    const out = await caller.decide(INPUT);

    expect(out.action).toEqual({
      tool: 'send_message',
      args: { to: 'bob', text: 'hi' },
    });
  });

  it('falls back to empty args when the JSON string is unparseable', async () => {
    const client = cloudClient({
      thought: 'oops',
      action: { tool: 'send_message', args: 'not json' },
      done: false,
    });
    const caller = createCloudAgentStepCaller({ client, getToken });
    const out = await caller.decide(INPUT);

    expect(out.action).toEqual({ tool: 'send_message', args: {} });
  });

  it('throws when the server reports failure', async () => {
    const client = {
      invokeAgentStep: jest.fn(async () => ({ success: false, error: 'boom' })),
    } as any;
    const caller = createCloudAgentStepCaller({ client, getToken });
    await expect(caller.decide(INPUT)).rejects.toThrow('boom');
  });
});

describe('resolveAgentStepCaller', () => {
  it('uses cloud for the raidr engine (no CLI)', async () => {
    mockGetState.mockReturnValue({ aiEngine: 'raidr' });
    const client = cloudClient({ thought: '', action: null, done: true });

    const caller = resolveAgentStepCaller(client, getToken);
    await caller.decide(INPUT);

    expect(client.invokeAgentStep).toHaveBeenCalledTimes(1);
    expect(mockGetBridge).not.toHaveBeenCalled();
  });

  it('uses the local CLI agent for a CLI engine (never calls the server)', async () => {
    mockGetState.mockReturnValue({ aiEngine: 'claude' });
    const decision = JSON.stringify({ thought: 't', action: null, done: true });
    const run = jest.fn(async () => ({
      stdout: JSON.stringify({ result: decision }),
      stderr: '',
      exitCode: 0,
    }));
    mockGetBridge.mockReturnValue({ isAvailable: async () => true, run });
    const client = cloudClient({ thought: '', action: null, done: true });

    const caller = resolveAgentStepCaller(client, getToken);
    const out = await caller.decide(INPUT);

    expect(out.done).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(client.invokeAgentStep).not.toHaveBeenCalled();
  });
});
