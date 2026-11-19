/**
 * Tests for the pure compaction helpers: when to compact and how the bounded
 * context string is assembled.
 */

import {
  buildContext,
  createSummarizer,
  needsCompaction,
  planCompaction,
  turnsToItems,
} from '../compaction';
import type { AgentPromptInput, AgentStepOutput } from '../agentEngine/types';
import type { SessionTurn } from '../session';

function turn(id: string, request: string, response?: string): SessionTurn {
  return {
    id,
    request,
    ...(response !== undefined ? { response } : {}),
    status: 'done',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('needsCompaction', () => {
  it('is true only above the budget', () => {
    expect(needsCompaction(10, 5)).toBe(true);
    expect(needsCompaction(3, 5)).toBe(false);
  });
});

describe('buildContext', () => {
  it('includes the summary and the recent exchanges', () => {
    const out = buildContext('earlier stuff', [
      { role: 'user', text: 'hi' },
      { role: 'agent', text: 'hello' },
    ]);
    expect(out).toContain('Summary of earlier conversation:');
    expect(out).toContain('earlier stuff');
    expect(out).toContain('User: hi');
    expect(out).toContain('Agent: hello');
  });

  it('is empty with no summary and no turns', () => {
    expect(buildContext('', [])).toBe('');
  });

  it('omits the summary header when there is no summary', () => {
    const out = buildContext('', [{ role: 'user', text: 'hi' }]);
    expect(out).toBe('User: hi');
  });
});

describe('planCompaction', () => {
  it('folds nothing while the conversation fits the recent window', () => {
    expect(planCompaction(3, 0, 6)).toBeNull();
    expect(planCompaction(6, 0, 6)).toBeNull();
  });

  it('folds the turns that have aged out of the recent window', () => {
    // 10 turns, keep 6 → turns 0..3 should be summarized.
    expect(planCompaction(10, 0, 6)).toEqual({ from: 0, to: 4 });
  });

  it('starts from what is already folded and is null once caught up', () => {
    expect(planCompaction(10, 2, 6)).toEqual({ from: 2, to: 4 });
    expect(planCompaction(10, 4, 6)).toBeNull();
  });
});

describe('turnsToItems', () => {
  it('yields a user and an agent line per turn, with a reply fallback', () => {
    expect(turnsToItems([turn('a', 'hi', 'hello'), turn('b', 'more')])).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'agent', text: 'hello' },
      { role: 'user', text: 'more' },
      { role: 'agent', text: '(no reply)' },
    ]);
  });
});

describe('createSummarizer', () => {
  const decision = (out: Partial<AgentStepOutput>) => ({
    decide: jest.fn(
      async (_input: AgentPromptInput): Promise<AgentStepOutput> => ({
        thought: '',
        action: null,
        done: true,
        ...out,
      })
    ),
  });

  it('folds exchanges via a no-tool agent step and returns respond', async () => {
    const caller = decision({ respond: 'Bob likes sudoku.' });
    const out = await createSummarizer(caller).summarize('', [
      { role: 'user', text: 'I am Bob' },
      { role: 'agent', text: 'Hi Bob' },
    ]);
    expect(out).toBe('Bob likes sudoku.');
    const input = caller.decide.mock.calls[0][0];
    expect(input.tools).toEqual([]);
    expect(input.goal).toContain('User: I am Bob');
  });

  it('keeps the prior summary when the model returns nothing', async () => {
    const caller = decision({ respond: '   ' });
    const out = await createSummarizer(caller).summarize('old summary', [
      { role: 'user', text: 'x' },
    ]);
    expect(out).toBe('old summary');
  });

  it('does not call the model when there is nothing to fold', async () => {
    const caller = decision({ respond: 'unused' });
    const out = await createSummarizer(caller).summarize('old', []);
    expect(out).toBe('old');
    expect(caller.decide).not.toHaveBeenCalled();
  });
});
