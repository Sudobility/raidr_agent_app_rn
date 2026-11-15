/**
 * Tests for the pure saved-agent helpers: sanitizing persisted/synced blobs,
 * building an agent from a run, bumping timestamps, and the last-write-wins
 * sync merge.
 */

import type { AgentIntent, SavedAgent } from '@sudobility/raidr_agent_types';
import {
  buildSavedAgentFromRun,
  mergeAgents,
  sanitizeSavedAgents,
  toDocument,
  touchAgent,
} from '../savedAgent';

const intent = { intent: 'find', labels: ['recipes'] } as unknown as AgentIntent;

function agent(overrides: Partial<SavedAgent> = {}): SavedAgent {
  return {
    id: 'a1',
    name: 'My agent',
    request: 'find pasta recipes',
    intent,
    sites: [{ apiHost: 'api.example.com', tools: ['search'] }],
    inputs: { q: 'pasta' },
    schedule: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sanitizeSavedAgents', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitizeSavedAgents(undefined)).toEqual([]);
    expect(sanitizeSavedAgents({})).toEqual([]);
    expect(sanitizeSavedAgents('nope')).toEqual([]);
  });

  it('keeps valid agents and drops invalid ones', () => {
    const out = sanitizeSavedAgents([
      agent(),
      { id: '', name: 'bad' }, // no id
      { id: 'x', request: 'r' }, // no intent
      { id: 'y', request: 'r', intent }, // minimal valid
    ]);
    expect(out.map(a => a.id)).toEqual(['a1', 'y']);
  });

  it('de-duplicates by id (first wins)', () => {
    const out = sanitizeSavedAgents([
      agent({ id: 'dup', name: 'first' }),
      agent({ id: 'dup', name: 'second' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('first');
  });

  it('coerces sites, inputs and location; drops junk', () => {
    const [out] = sanitizeSavedAgents([
      {
        id: 'z',
        name: 'Z',
        request: 'r',
        intent,
        sites: [
          { apiHost: 'ok.com', tools: ['a', 2, 'b'] },
          { apiHost: '' },
          'garbage',
        ],
        inputs: { a: 'x', b: 3, c: true, d: ['e'], bad: { nested: 1 } },
        location: { latitude: 1, longitude: 2, accuracy: 5 },
      },
    ]);
    expect(out.sites).toEqual([{ apiHost: 'ok.com', tools: ['a', 'b'] }]);
    expect(out.inputs).toEqual({ a: 'x', b: 3, c: true, d: ['e'] });
    expect(out.location).toEqual({ latitude: 1, longitude: 2, accuracy: 5 });
  });

  it('falls back name to the request when missing', () => {
    const [out] = sanitizeSavedAgents([
      { id: 'n', request: 'a very long request text', intent },
    ]);
    expect(out.name).toBe('a very long request text');
  });
});

describe('buildSavedAgentFromRun', () => {
  it('builds a definition with timestamps and no tokens', () => {
    const built = buildSavedAgentFromRun({
      name: '  Weekly deals  ',
      request: 'find deals',
      intent,
      sites: [{ apiHost: 'api.example.com', tools: ['search'] }],
      inputs: { q: 'tv' },
      location: { latitude: 10, longitude: 20 },
      now: () => '2026-05-05T00:00:00.000Z',
      id: 'fixed',
    });
    expect(built).toEqual({
      id: 'fixed',
      name: 'Weekly deals',
      request: 'find deals',
      intent,
      sites: [{ apiHost: 'api.example.com', tools: ['search'] }],
      inputs: { q: 'tv' },
      schedule: null,
      location: { latitude: 10, longitude: 20 },
      createdAt: '2026-05-05T00:00:00.000Z',
      updatedAt: '2026-05-05T00:00:00.000Z',
    });
  });

  it('uses the request when the name is blank', () => {
    const built = buildSavedAgentFromRun({
      name: '   ',
      request: 'find deals',
      intent,
      sites: [],
      inputs: {},
    });
    expect(built.name).toBe('find deals');
  });
});

describe('touchAgent', () => {
  it('bumps only updatedAt', () => {
    const a = agent();
    const touched = touchAgent(a, () => '2026-09-09T00:00:00.000Z');
    expect(touched.updatedAt).toBe('2026-09-09T00:00:00.000Z');
    expect(touched.createdAt).toBe(a.createdAt);
    expect(touched.name).toBe(a.name);
  });
});

describe('mergeAgents (last-write-wins)', () => {
  it('keeps agents unique to each side', () => {
    const local = [agent({ id: 'l' })];
    const remote = [agent({ id: 'r' })];
    const merged = mergeAgents(local, remote);
    expect(merged.map(a => a.id).sort()).toEqual(['l', 'r']);
  });

  it('prefers the newer updatedAt when ids collide', () => {
    const older = agent({ id: 'c', name: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = agent({ id: 'c', name: 'new', updatedAt: '2026-02-01T00:00:00.000Z' });
    expect(mergeAgents([older], [newer])[0].name).toBe('new');
    expect(mergeAgents([newer], [older])[0].name).toBe('new');
  });
});

describe('toDocument', () => {
  it('wraps agents with a version and timestamp', () => {
    const doc = toDocument([agent()], () => '2026-03-03T00:00:00.000Z');
    expect(doc.version).toBe(1);
    expect(doc.agents).toHaveLength(1);
    expect(doc.updatedAt).toBe('2026-03-03T00:00:00.000Z');
  });
});
