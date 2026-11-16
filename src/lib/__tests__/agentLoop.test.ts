/**
 * Tests for the agentic loop: it executes read/write tools, guards writes with
 * the idempotency memory, honours the write cap, drives the memory pseudo-tools,
 * and stops on done.
 */

import { runAgentTask } from '../agentEngine/loop';
import { ENGINE_TOOLS } from '../agentEngine/types';
import type {
  AgentEvent,
  AgentMemoryPort,
  AgentStepCaller,
  AgentStepOutput,
  AgentTool,
  AgentToolExecutor,
} from '../agentEngine/types';
import { idempotencyKey } from '../agentMemory';

const TOOLS: AgentTool[] = [
  { name: 'search_posts', description: '', inputSchema: {}, kind: 'read' },
  { name: 'send_message', description: '', inputSchema: {}, kind: 'write' },
];

function memory(seed: Record<string, string> = {}): AgentMemoryPort {
  const store = new Map(Object.entries(seed));
  return {
    recall: q =>
      [...store.entries()]
        .filter(([k, v]) => !q || k.includes(q) || v.includes(q))
        .map(([key, value]) => ({ key, value })),
    remember: (k, v) => {
      store.set(k, v);
    },
    has: k => store.has(k),
    digest: () => [...store.entries()].map(([k, v]) => `- ${k}: ${v}`).join('\n'),
  };
}

function caller(script: AgentStepOutput[]): AgentStepCaller {
  let i = 0;
  return {
    decide: async () => script[Math.min(i++, script.length - 1)],
  };
}

function executor(): AgentToolExecutor & { calls: { tool: string; args: unknown }[] } {
  const calls: { tool: string; args: unknown }[] = [];
  return {
    calls,
    call: async (tool, args) => {
      calls.push({ tool, args });
      return { ok: true, summary: `${tool} ok` };
    },
  };
}

const base = {
  tools: TOOLS,
  goal: 'do the thing',
};

it('runs a read then a write, records idempotency, and stops on done', async () => {
  const mem = memory();
  const exec = executor();
  const result = await runAgentTask({
    ...base,
    caller: caller([
      { thought: 'look', action: { tool: 'search_posts', args: { q: 'sudoku' } }, done: false },
      { thought: 'msg', action: { tool: 'send_message', args: { to: 'alice', text: 'hi' } }, done: false },
      { thought: 'fin', action: null, done: true, respond: 'Messaged alice.' },
    ]),
    executor: exec,
    memory: mem,
  });
  expect(exec.calls.map(c => c.tool)).toEqual(['search_posts', 'send_message']);
  expect(result.writes).toBe(1);
  expect(result.summary).toBe('Messaged alice.');
  expect(mem.has(idempotencyKey('send_message', { to: 'alice', text: 'hi' }))).toBe(true);
});

it('skips a write already recorded in memory (no repeat across runs)', async () => {
  const seedKey = idempotencyKey('send_message', { to: 'alice', text: 'hi' });
  const mem = memory({ [seedKey]: 'done' });
  const exec = executor();
  const events: AgentEvent[] = [];
  const result = await runAgentTask({
    ...base,
    caller: caller([
      { thought: 'msg', action: { tool: 'send_message', args: { to: 'alice', text: 'hi' } }, done: false },
      { thought: 'fin', action: null, done: true, respond: 'Nothing new.' },
    ]),
    executor: exec,
    memory: mem,
    onEvent: e => events.push(e),
  });
  expect(exec.calls).toHaveLength(0);
  expect(result.writes).toBe(0);
  expect(events).toContainEqual({ type: 'skipped', tool: 'send_message', reason: 'already done' });
});

it('drives the memory recall/remember pseudo-tools', async () => {
  const mem = memory({ 'messaged:alice': 'yes' });
  const result = await runAgentTask({
    ...base,
    caller: caller([
      { thought: 'check', action: { tool: ENGINE_TOOLS.recall, args: { query: 'alice' } }, done: false },
      { thought: 'save', action: { tool: ENGINE_TOOLS.remember, args: { key: 'messaged:bob', value: 'yes' } }, done: false },
      { thought: 'fin', action: null, done: true, respond: 'ok' },
    ]),
    executor: executor(),
    memory: mem,
  });
  expect(mem.has('messaged:bob')).toBe(true);
  expect(result.observations.some(o => o.tool === ENGINE_TOOLS.recall && o.summary.includes('alice'))).toBe(true);
});

it('enforces the per-run write cap', async () => {
  const exec = executor();
  const result = await runAgentTask({
    ...base,
    maxWrites: 1,
    caller: caller([
      { thought: '1', action: { tool: 'send_message', args: { to: 'a' } }, done: false },
      { thought: '2', action: { tool: 'send_message', args: { to: 'b' } }, done: false },
      { thought: 'fin', action: null, done: true, respond: 'done' },
    ]),
    executor: exec,
    memory: memory(),
  });
  expect(exec.calls).toHaveLength(1);
  expect(result.writes).toBe(1);
});

it('finishes immediately when the first decision is done', async () => {
  const exec = executor();
  const result = await runAgentTask({
    ...base,
    caller: caller([{ thought: 'nothing to do', action: null, done: true, respond: 'nothing' }]),
    executor: exec,
    memory: memory(),
  });
  expect(result.steps).toBe(1);
  expect(result.summary).toBe('nothing');
  expect(exec.calls).toHaveLength(0);
});
