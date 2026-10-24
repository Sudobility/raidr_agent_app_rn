import type { AgentIntent, ResultItem } from '@sudobility/raidr_agent_types';

/** A place result or a request whose answer depends on a named or current place. */
export function isLocationIntent(intent: AgentIntent | null | undefined): boolean {
  return intent?.resultKind === 'place' || intent?.where != null;
}

/** Reject malformed points so a bad extractor answer cannot move the map. */
export function hasResultCoordinates(
  item: ResultItem
): item is ResultItem & { location: { latitude: number; longitude: number } } {
  const point = item.location;
  return point != null &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180;
}

/** Show the source's address or place name, then coordinates if no text exists. */
export function resultLocationText(item: ResultItem): string | null {
  const field = item.fields.find(({ label, value }) =>
    /^(address|location|venue|place|city|neighbou?rhood|coordinates?)$/i.test(label.trim()) &&
    value.trim().length > 0
  );
  if (field) return field.value.trim();
  if (hasResultCoordinates(item)) {
    return `${item.location.latitude.toFixed(5)}, ${item.location.longitude.toFixed(5)}`;
  }
  return null;
}
