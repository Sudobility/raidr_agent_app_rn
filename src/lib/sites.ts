/**
 * Pure helpers for the Sites step: grouping candidates by label, and the
 * selection rules: a toggle per site, every one on to start, at least one and
 * at most {@link MAX_SELECTED_SITES} on — the same for every selection mode.
 *
 * Signing in is no longer decided here: the Prepare step works out which
 * chosen sites need it. Kept free of React, i18n and navigation imports so the
 * logic is unit-testable in isolation (the Jest config does not resolve
 * `@/assets/*`, so anything that reaches i18n cannot be imported from a test).
 */

import type { CandidateSite } from '@sudobility/raidr_agent_types';

/** Most sites one run may call (the server's `POST /runs` cap). */
export const MAX_SELECTED_SITES = 8;

/** A set of candidates sharing a first label. */
export interface SiteGroup {
  label: string;
  sites: CandidateSite[];
}

/**
 * Group candidates by their first label, preserving the order in which labels
 * are first seen. Candidates with no label fall into an empty-string group.
 */
export function groupByLabel(candidates: CandidateSite[]): SiteGroup[] {
  const groups: SiteGroup[] = [];
  const byLabel = new Map<string, SiteGroup>();
  for (const site of candidates) {
    const label = site.labels[0] ?? '';
    let group = byLabel.get(label);
    if (!group) {
      group = { label, sites: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.sites.push(site);
  }
  return groups;
}

/**
 * The selection after the user flips a site's toggle: on or off, but never
 * more than {@link MAX_SELECTED_SITES} on.
 */
export function nextSelection(
  selected: ReadonlySet<string>,
  apiHost: string
): Set<string> {
  const next = new Set(selected);
  if (next.has(apiHost)) {
    next.delete(apiHost);
  } else if (next.size < MAX_SELECTED_SITES) {
    next.add(apiHost);
  }
  return next;
}

/** Whether an off toggle can still be turned on (cap not reached). */
export function canAddMore(selected: ReadonlySet<string>): boolean {
  return selected.size < MAX_SELECTED_SITES;
}

/**
 * The selection the Sites step opens with: every candidate on, up to
 * {@link MAX_SELECTED_SITES} (the best-ranked ones, since candidates arrive
 * best-first), whatever the selection mode. `single` and `best` still end in
 * one result: the run picks it (`data-best`) from every site's results.
 */
export function initialSelection(candidates: CandidateSite[]): Set<string> {
  return new Set(
    candidates.slice(0, MAX_SELECTED_SITES).map(c => c.apiHost)
  );
}

/** "Next" is enabled for 1–{@link MAX_SELECTED_SITES} sites. */
export function isNextEnabled(selected: ReadonlySet<string>): boolean {
  return selected.size > 0 && selected.size <= MAX_SELECTED_SITES;
}

/** The chosen sites in candidate (ranked) order. */
export function selectedInOrder(
  candidates: CandidateSite[],
  selected: ReadonlySet<string>
): CandidateSite[] {
  return candidates.filter(c => selected.has(c.apiHost));
}

/**
 * The domain a site is known by: its first site origin's host, else the API
 * host, without `www.` (`https://www.humanitix.com` → `humanitix.com`).
 */
export function siteDomain(
  site: Pick<CandidateSite, 'apiHost' | 'siteOrigins'>
): string {
  for (const origin of site.siteOrigins) {
    try {
      return new URL(origin).hostname.replace(/^www\./, '');
    } catch {
      // Not a URL; try the next one.
    }
  }
  return site.apiHost.replace(/:\d+$/, '').replace(/^www\./, '');
}
