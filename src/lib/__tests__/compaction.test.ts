/**
 * Tests for the pure compaction helpers: when to compact and how the bounded
 * context string is assembled.
 */

import { buildContext, needsCompaction } from '../compaction';

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
