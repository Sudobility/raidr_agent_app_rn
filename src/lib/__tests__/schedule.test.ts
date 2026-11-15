/**
 * Tests for the pure schedule cadence math. Times are built with the local
 * Date constructor so the assertions hold in any time zone.
 */

import type { AgentSchedule } from '@sudobility/raidr_agent_types';
import { computeNextRun, isDue, parseHHmm } from '../schedule';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Local time on a fixed date (a Monday): 2026-01-05 at hh:mm. */
function at(hh: number, mm = 0): number {
  return new Date(2026, 0, 5, hh, mm, 0, 0).getTime();
}

function schedule(overrides: Partial<AgentSchedule>): AgentSchedule {
  return { enabled: true, kind: 'daily', ...overrides };
}

describe('parseHHmm', () => {
  it('parses valid times and rejects bad ones', () => {
    expect(parseHHmm('09:30')).toEqual({ hh: 9, mm: 30 });
    expect(parseHHmm('23:59')).toEqual({ hh: 23, mm: 59 });
    expect(parseHHmm('24:00')).toBeNull();
    expect(parseHHmm('9:5')).toBeNull();
    expect(parseHHmm('nope')).toBeNull();
    expect(parseHHmm(900)).toBeNull();
  });
});

describe('computeNextRun — disabled/invalid', () => {
  it('returns null when disabled or misconfigured', () => {
    expect(computeNextRun(null, at(8))).toBeNull();
    expect(computeNextRun(schedule({ enabled: false }), at(8))).toBeNull();
    expect(
      computeNextRun(schedule({ kind: 'interval', intervalMinutes: 0 }), at(8))
    ).toBeNull();
    expect(
      computeNextRun(schedule({ kind: 'daily', timeOfDay: 'bad' }), at(8))
    ).toBeNull();
    expect(
      computeNextRun(schedule({ kind: 'weekly', timeOfDay: '09:00', daysOfWeek: [] }), at(8))
    ).toBeNull();
  });
});

describe('computeNextRun — interval', () => {
  it('runs immediately the first time, then interval after last run', () => {
    const s = schedule({ kind: 'interval', intervalMinutes: 60 });
    expect(computeNextRun(s, at(8))).toBe(at(8));
    const ran = schedule({
      kind: 'interval',
      intervalMinutes: 60,
      lastRunAt: new Date(at(8)).toISOString(),
    });
    expect(computeNextRun(ran, at(8))).toBe(at(8) + HOUR);
  });
});

describe('computeNextRun — daily', () => {
  it('picks today when the time is still ahead, else tomorrow', () => {
    const s = schedule({ kind: 'daily', timeOfDay: '09:00' });
    expect(computeNextRun(s, at(8))).toBe(at(9)); // later today
    expect(computeNextRun(s, at(10))).toBe(at(9) + DAY); // tomorrow
  });

  it('skips the slot it already ran in', () => {
    const s = schedule({
      kind: 'daily',
      timeOfDay: '09:00',
      lastRunAt: new Date(at(9)).toISOString(),
    });
    expect(computeNextRun(s, at(9))).toBe(at(9) + DAY);
  });
});

describe('computeNextRun — weekly', () => {
  it('fires today when the weekday matches and time is ahead', () => {
    const today = new Date(at(8)).getDay();
    const s = schedule({ kind: 'weekly', timeOfDay: '09:00', daysOfWeek: [today] });
    expect(computeNextRun(s, at(8))).toBe(at(9));
  });

  it('rolls to the next matching weekday', () => {
    const tomorrow = (new Date(at(8)).getDay() + 1) % 7;
    const s = schedule({ kind: 'weekly', timeOfDay: '09:00', daysOfWeek: [tomorrow] });
    const expected = new Date(at(9));
    expected.setDate(expected.getDate() + 1);
    expect(computeNextRun(s, at(8))).toBe(expected.getTime());
  });
});

describe('isDue', () => {
  it('is true for a first-time interval and false when disabled', () => {
    expect(isDue(schedule({ kind: 'interval', intervalMinutes: 30 }), at(8))).toBe(true);
    expect(isDue(schedule({ enabled: false }), at(8))).toBe(false);
    expect(isDue(null, at(8))).toBe(false);
  });

  it('respects a stored nextRunAt', () => {
    const future = schedule({
      kind: 'daily',
      timeOfDay: '09:00',
      nextRunAt: new Date(at(9)).toISOString(),
    });
    expect(isDue(future, at(8))).toBe(false);
    expect(isDue(future, at(9))).toBe(true);
  });

  it('is due when a daily time has arrived (no stored nextRunAt)', () => {
    const s = schedule({ kind: 'daily', timeOfDay: '09:00' });
    expect(isDue(s, at(8))).toBe(false);
    expect(isDue(s, at(9))).toBe(true);
  });
});
