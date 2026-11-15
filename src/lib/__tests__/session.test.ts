/**
 * Tests for the pure conversation helpers: title derivation, client-side
 * context stitching, and sanitizing persisted sessions.
 */

import type { ResultItem } from '@sudobility/raidr_agent_types';
import {
  buildTurnRequest,
  sanitizeSessions,
  sessionTitle,
  type SessionTurn,
} from '../session';

function result(overrides: Partial<ResultItem> = {}): ResultItem {
  return {
    id: 'r1',
    apiHost: 'api.example.com',
    siteTitle: 'Example',
    title: 'Pasta Carbonara',
    summary: 'A classic Roman dish',
    imageUrl: '',
    sourceUrl: '',
    pageUrl: '',
    recipe: null,
    fields: [],
    ...overrides,
  };
}

function turn(overrides: Partial<SessionTurn> = {}): SessionTurn {
  return {
    id: 't1',
    request: 'find pasta recipes',
    results: [result()],
    best: null,
    groups: [],
    status: 'done',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sessionTitle', () => {
  it('uses the request, truncating long ones', () => {
    expect(sessionTitle('short one')).toBe('short one');
    expect(sessionTitle('  ')).toBe('New conversation');
    const long = 'a'.repeat(100);
    const title = sessionTitle(long);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});

describe('buildTurnRequest', () => {
  it('returns the request unchanged with no prior turns', () => {
    expect(buildTurnRequest([], 'hello')).toBe('hello');
  });

  it('folds recent turns and the new request into context', () => {
    const out = buildTurnRequest([turn()], 'make it vegetarian');
    expect(out).toContain('Earlier in this conversation');
    expect(out).toContain('find pasta recipes');
    expect(out).toContain('Pasta Carbonara');
    expect(out).toContain('Now: make it vegetarian');
  });

  it('keeps only the last few turns', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      turn({ id: `t${i}`, request: `req ${i}` })
    );
    const out = buildTurnRequest(many, 'next');
    expect(out).toContain('req 5');
    expect(out).not.toContain('req 2');
  });
});

describe('sanitizeSessions', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitizeSessions(undefined)).toEqual([]);
    expect(sanitizeSessions({})).toEqual([]);
  });

  it('drops sessions without an id and de-duplicates', () => {
    const out = sanitizeSessions([
      { id: 's1', title: 'A', turns: [] },
      { title: 'no id', turns: [] },
      { id: 's1', title: 'dup', turns: [] },
    ]);
    expect(out.map(s => s.id)).toEqual(['s1']);
    expect(out[0].title).toBe('A');
  });

  it('marks a turn that was still running as failed on reload', () => {
    const [out] = sanitizeSessions([
      {
        id: 's2',
        title: 'B',
        turns: [{ id: 't', request: 'r', status: 'running', results: [] }],
      },
    ]);
    expect(out.turns[0].status).toBe('failed');
  });

  it('keeps valid turn fields and defaults missing ones', () => {
    const [out] = sanitizeSessions([
      {
        id: 's3',
        title: 'C',
        turns: [{ id: 't', request: 'r', results: [result()], status: 'done' }],
      },
    ]);
    expect(out.turns[0].results).toHaveLength(1);
    expect(out.turns[0].best).toBeNull();
    expect(out.turns[0].groups).toEqual([]);
  });
});
