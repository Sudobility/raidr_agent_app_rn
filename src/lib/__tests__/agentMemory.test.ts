/**
 * Tests for the pure agent-memory helpers: deterministic canonical JSON,
 * idempotency keys, recall matching, and the prompt digest.
 */

import {
  canonicalJson,
  digestEntries,
  idempotencyKey,
  matchEntries,
} from '../agentMemory';

describe('canonicalJson', () => {
  it('is independent of key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
  it('handles nested objects and arrays', () => {
    expect(canonicalJson({ x: [{ b: 1, a: 2 }] })).toBe('{"x":[{"a":2,"b":1}]}');
  });
});

describe('idempotencyKey', () => {
  it('matches for equal args regardless of order', () => {
    expect(idempotencyKey('send', { to: 'a', text: 'hi' })).toBe(
      idempotencyKey('send', { text: 'hi', to: 'a' })
    );
  });
  it('differs for different args or tools', () => {
    expect(idempotencyKey('send', { to: 'a' })).not.toBe(
      idempotencyKey('send', { to: 'b' })
    );
    expect(idempotencyKey('send', { to: 'a' })).not.toBe(
      idempotencyKey('post', { to: 'a' })
    );
  });
});

describe('matchEntries', () => {
  const entries = [
    { key: 'messaged:alice', value: 'yes' },
    { key: 'seen:bob', value: 'post123' },
  ];
  it('returns all when no query', () => {
    expect(matchEntries(entries)).toHaveLength(2);
  });
  it('matches key or value, case-insensitive', () => {
    expect(matchEntries(entries, 'ALICE').map(e => e.key)).toEqual(['messaged:alice']);
    expect(matchEntries(entries, 'post123').map(e => e.key)).toEqual(['seen:bob']);
  });
});

describe('digestEntries', () => {
  it('lists entries newest-first and respects the budget', () => {
    const out = digestEntries(
      [
        { key: 'a', value: '1', updatedAt: '2026-01-01T00:00:00Z' },
        { key: 'b', value: '2', updatedAt: '2026-02-01T00:00:00Z' },
      ],
      1000
    );
    expect(out.split('\n')[0]).toContain('b');
    const tiny = digestEntries(
      [
        { key: 'a', value: 'x'.repeat(50), updatedAt: '2026-02-01T00:00:00Z' },
        { key: 'b', value: 'y'.repeat(50), updatedAt: '2026-01-01T00:00:00Z' },
      ],
      30
    );
    expect(tiny.split('\n')).toHaveLength(1);
  });
});
