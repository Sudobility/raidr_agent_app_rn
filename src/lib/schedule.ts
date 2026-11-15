/**
 * Pure cadence math for agent schedules (no React, storage or Date-zone libs,
 * so it unit-tests on its own). Times for `daily`/`weekly` are interpreted in
 * the device's local time — the schedule runs on whichever device is awake.
 *
 * {@link computeNextRun} gives the next fire time (epoch ms) at or after a
 * reference time, honouring the last run so a slot never double-fires; the
 * scheduler stores it on the schedule and fires when it is due.
 */

import type { AgentSchedule } from '@sudobility/raidr_agent_types';

const DAY_MS = 86_400_000;

/** Parse `"HH:mm"` to hours/minutes, or null if malformed. */
export function parseHHmm(value: unknown): { hh: number; mm: number } | null {
  if (typeof value !== 'string') {
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) {
    return null;
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return { hh, mm };
}

/** The smallest local time at `hh:mm` that is >= `fromMs`. */
function nextDailyTime(fromMs: number, hh: number, mm: number): number {
  const d = new Date(fromMs);
  d.setHours(hh, mm, 0, 0);
  let t = d.getTime();
  if (t < fromMs) {
    t += DAY_MS;
  }
  return t;
}

/** The smallest local `hh:mm` on one of `days` (0=Sun…6=Sat) that is >= `fromMs`. */
function nextWeeklyTime(
  fromMs: number,
  hh: number,
  mm: number,
  days: number[]
): number | null {
  if (days.length === 0) {
    return null;
  }
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(fromMs + i * DAY_MS);
    d.setHours(hh, mm, 0, 0);
    const t = d.getTime();
    if (days.includes(d.getDay()) && t >= fromMs) {
      return t;
    }
  }
  return null;
}

/**
 * The next time this schedule should fire, at or after `fromMs` (epoch ms), or
 * null if it is disabled or misconfigured. Uses `schedule.lastRunAt` so a slot
 * that already ran is skipped.
 */
export function computeNextRun(
  schedule: AgentSchedule | null | undefined,
  fromMs: number
): number | null {
  if (!schedule || !schedule.enabled) {
    return null;
  }
  const last = schedule.lastRunAt ? Date.parse(schedule.lastRunAt) : null;
  const lastValid = last !== null && !Number.isNaN(last) ? last : null;

  if (schedule.kind === 'interval') {
    const minutes = schedule.intervalMinutes;
    if (!minutes || minutes < 1) {
      return null;
    }
    // First run is immediate; afterwards it is `interval` after the last run.
    return lastValid !== null ? lastValid + minutes * 60_000 : fromMs;
  }

  const time = parseHHmm(schedule.timeOfDay);
  if (!time) {
    return null;
  }
  // Start searching just after the last run so the same slot never repeats.
  const start = lastValid !== null ? Math.max(fromMs, lastValid + 60_000) : fromMs;

  if (schedule.kind === 'daily') {
    return nextDailyTime(start, time.hh, time.mm);
  }
  if (schedule.kind === 'weekly') {
    const days = Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    return nextWeeklyTime(start, time.hh, time.mm, days);
  }
  return null;
}

/**
 * Whether the schedule is due at `nowMs`. Prefers a stored `nextRunAt`; when
 * absent it computes one. A disabled or invalid schedule is never due.
 */
export function isDue(
  schedule: AgentSchedule | null | undefined,
  nowMs: number
): boolean {
  if (!schedule || !schedule.enabled) {
    return false;
  }
  const stored = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : NaN;
  const next = !Number.isNaN(stored) ? stored : computeNextRun(schedule, nowMs);
  return next !== null && next <= nowMs;
}

/** The next fire time as an ISO string, or null. */
export function nextRunIso(
  schedule: AgentSchedule | null | undefined,
  fromMs: number
): string | null {
  const next = computeNextRun(schedule, fromMs);
  return next === null ? null : new Date(next).toISOString();
}
