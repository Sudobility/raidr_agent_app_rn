/**
 * The AI engine the app uses to make model decisions — the single user-facing
 * AI setting (Settings → AI). Pure rules only (no React, no storage).
 *
 * - `raidr`  — the cloud route: calls go through raidr's server (ShapeShyft,
 *   the server's key), metered against the user's raidr credit balance. Works
 *   on every platform; no login beyond the raidr account.
 * - `claude` — a local Claude Code CLI install (desktop only).
 * - `codex`  — a local Codex CLI install (desktop only).
 *
 * Picking `claude`/`codex` tells the app exactly which CLI to invoke; auth is
 * the terminal's (the user logs in with `claude` / `codex` there).
 */

/** Which CLI kinds an engine maps to; mirrors `CliAgentKind` in native/cliAgent. */
export type AiEngineCli = 'claude' | 'codex';

export type AiEngine = 'raidr' | AiEngineCli;

/** Every engine, in display order. */
export const AI_ENGINES: readonly AiEngine[] = ['raidr', 'claude', 'codex'];

/** Turn any stored value into an engine (defaults to raidr — the cloud route). */
export function normalizeAiEngine(value: unknown): AiEngine {
  return value === 'claude' || value === 'codex' ? value : 'raidr';
}

/** The cloud route (raidr server key) rather than a local CLI. */
export function engineIsCloud(engine: AiEngine): boolean {
  return engine === 'raidr';
}

/** The CLI kind for a local engine, or null for the cloud engine. */
export function engineCliKind(engine: AiEngine): AiEngineCli | null {
  return engine === 'raidr' ? null : engine;
}
