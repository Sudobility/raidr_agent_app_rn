/**
 * Tests for the pure Sites-step helpers: grouping and the toggle rules (the
 * same for every selection mode).
 */

import type { CandidateSite } from '@sudobility/raidr_agent_types';
import {
  canAddMore,
  groupByLabel,
  initialSelection,
  isNextEnabled,
  MAX_SELECTED_SITES,
  nextSelection,
  selectedInOrder,
  siteDomain,
} from '../sites';

function site(overrides: Partial<CandidateSite>): CandidateSite {
  return {
    apiHost: 'api.example.com',
    title: 'Example',
    description: '',
    labels: ['recipes'],
    siteOrigins: ['https://example.com'],
    toolCount: 1,
    authStyle: 'none',
    ...overrides,
  };
}

const hosts = (n: number) => Array.from({ length: n }, (_, i) => `h${i}`);

describe('groupByLabel', () => {
  it('groups candidates by their first label, in first-seen order', () => {
    const groups = groupByLabel([
      site({ apiHost: 'a', labels: ['recipes'] }),
      site({ apiHost: 'b', labels: ['travel'] }),
      site({ apiHost: 'c', labels: ['recipes'] }),
    ]);
    expect(groups.map(g => g.label)).toEqual(['recipes', 'travel']);
    expect(groups[0].sites.map(s => s.apiHost)).toEqual(['a', 'c']);
  });
});

describe('nextSelection', () => {
  it('toggles a site on and off', () => {
    expect([...nextSelection(new Set(['a']), 'b')]).toEqual(['a', 'b']);
    expect([...nextSelection(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('never exceeds the cap', () => {
    const full = new Set(hosts(MAX_SELECTED_SITES));
    expect(nextSelection(full, 'extra').size).toBe(MAX_SELECTED_SITES);
    expect(canAddMore(full)).toBe(false);
    expect(canAddMore(new Set(['a']))).toBe(true);
  });
});

describe('isNextEnabled', () => {
  it('needs 1..8 sites on', () => {
    expect(isNextEnabled(new Set())).toBe(false);
    expect(isNextEnabled(new Set(['a']))).toBe(true);
    expect(isNextEnabled(new Set(['a', 'b']))).toBe(true);
    expect(isNextEnabled(new Set(hosts(9)))).toBe(false);
  });
});

describe('initialSelection / selectedInOrder', () => {
  const candidates = [site({ apiHost: 'a' }), site({ apiHost: 'b' })];

  it('turns every site on, up to the cap, best-ranked first', () => {
    expect([...initialSelection(candidates)]).toEqual(['a', 'b']);
    const many = hosts(12).map(apiHost => site({ apiHost }));
    expect([...initialSelection(many)]).toEqual(hosts(MAX_SELECTED_SITES));
    expect(initialSelection([]).size).toBe(0);
  });

  it('keeps candidate order', () => {
    expect(
      selectedInOrder(candidates, new Set(['b', 'a'])).map(s => s.apiHost)
    ).toEqual(['a', 'b']);
  });
});

describe('siteDomain', () => {
  it('uses the first site origin without www, else the API host', () => {
    expect(
      siteDomain({
        apiHost: 'api.humanitix.com',
        siteOrigins: [
          'https://www.humanitix.com',
          'https://events.humanitix.com',
        ],
      })
    ).toBe('humanitix.com');
    expect(siteDomain({ apiHost: 'www.vividseats.com', siteOrigins: [] })).toBe(
      'vividseats.com'
    );
    expect(
      siteDomain({ apiHost: 'localhost:8080', siteOrigins: ['nope'] })
    ).toBe('localhost');
  });
});
