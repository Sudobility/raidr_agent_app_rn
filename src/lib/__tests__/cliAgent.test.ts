/**
 * Tests the CLI agent-step caller: it parses a decision from Claude Code's JSON
 * envelope and from Codex's plain output, maps an auth failure to "log in in
 * Terminal", and reports when no CLI/bridge is available.
 */

import {
  createCliAgentStepCaller,
  decisionTextFromStdout,
  extractJsonObject,
  CliNotLoggedInError,
  CliUnavailableError,
} from '../cliAgent';
import type {
  CliAgentBridge,
  CliRunResult,
} from '@/native/cliAgent';
import type { AgentPromptInput } from '../agentEngine/types';

const INPUT: AgentPromptInput = {
  goal: 'g',
  tools: [{ name: 't', description: 'd', inputSchema: {}, kind: 'read' }],
  memoryDigest: '',
  observations: [],
};

function bridge(result: CliRunResult): CliAgentBridge & { run: jest.Mock } {
  const run = jest.fn(async () => result);
  return { isAvailable: async () => true, run };
}

const DECISION = JSON.stringify({
  thought: 'looked',
  action: { tool: 't', args: { x: 1 } },
  done: false,
});

describe('extractJsonObject', () => {
  it('returns the first balanced object, ignoring braces in strings', () => {
    expect(extractJsonObject('noise {"a": "}{"} tail')).toBe('{"a": "}{"}');
    expect(extractJsonObject('none here')).toBeNull();
  });
});

describe('decisionTextFromStdout', () => {
  it('unwraps claude --output-format json', () => {
    const stdout = JSON.stringify({ result: `here: ${DECISION}` });
    expect(decisionTextFromStdout('claude', stdout)).toBe(DECISION);
  });
  it('reads codex plain output', () => {
    expect(decisionTextFromStdout('codex', `log line\n${DECISION}`)).toBe(
      DECISION
    );
  });
});

describe('createCliAgentStepCaller', () => {
  it('parses a claude decision', async () => {
    const b = bridge({
      stdout: JSON.stringify({ result: DECISION }),
      stderr: '',
      exitCode: 0,
    });
    const caller = createCliAgentStepCaller({ kind: 'claude', getBridge: () => b });
    const out = await caller.decide(INPUT);
    expect(out).toEqual({
      thought: 'looked',
      action: { tool: 't', args: { x: 1 } },
      done: false,
    });
    // Claude is invoked with the JSON output format on stdin.
    expect(b.run).toHaveBeenCalledWith(
      'claude',
      ['-p', '--output-format', 'json'],
      expect.stringContaining('GOAL: g'),
      expect.any(Number)
    );
  });

  it('parses a codex decision', async () => {
    const b = bridge({ stdout: DECISION, stderr: '', exitCode: 0 });
    const caller = createCliAgentStepCaller({ kind: 'codex', getBridge: () => b });
    const out = await caller.decide(INPUT);
    expect(out.action).toEqual({ tool: 't', args: { x: 1 } });
  });

  it('maps an auth failure to CliNotLoggedInError', async () => {
    const b = bridge({
      stdout: '',
      stderr: 'Error: not logged in. Run `claude` to authenticate.',
      exitCode: 1,
    });
    const caller = createCliAgentStepCaller({ kind: 'claude', getBridge: () => b });
    await expect(caller.decide(INPUT)).rejects.toBeInstanceOf(
      CliNotLoggedInError
    );
  });

  it('reports when no CLI bridge is available', async () => {
    const caller = createCliAgentStepCaller({
      kind: 'codex',
      getBridge: () => null,
    });
    await expect(caller.decide(INPUT)).rejects.toBeInstanceOf(
      CliUnavailableError
    );
  });

  it('errors clearly on a non-zero exit that is not an auth problem', async () => {
    const b = bridge({ stdout: '', stderr: 'segfault', exitCode: 139 });
    const caller = createCliAgentStepCaller({ kind: 'codex', getBridge: () => b });
    await expect(caller.decide(INPUT)).rejects.toThrow(/139/);
  });
});
