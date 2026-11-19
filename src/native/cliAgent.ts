/**
 * Bridge to a locally-installed coding-agent CLI (Claude Code or Codex) used as
 * the agent loop's "local" brain. Desktop only — iOS/Android have no terminal
 * and no process to spawn, so the bridge is absent there.
 *
 * The native module (macOS `NSTask`/`Process`, Windows `CreateProcess`) runs the
 * chosen binary with args, feeds the prompt on stdin, and returns stdout/stderr
 * and the exit code. It never handles login: if the CLI isn't authenticated the
 * app tells the user to log in in Terminal (see `CliNotLoggedInError`).
 *
 * This file is only the TS contract + resolver. When the native module is not
 * registered (mobile, or before the native side is built) {@link getCliAgentBridge}
 * returns `null`, and the caller surfaces a clear "unavailable" message rather
 * than crashing.
 */

import { NativeModules, Platform } from 'react-native';

export type CliAgentKind = 'claude' | 'codex';

/** Every supported CLI agent, in the app's default order. */
export const CLI_AGENTS: readonly CliAgentKind[] = ['claude', 'codex'];

/** The raw result of running the CLI once. */
export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** The native module's surface. */
export interface CliAgentBridge {
  /** Whether `kind`'s binary is on PATH and runnable on this machine. */
  isAvailable(kind: CliAgentKind): Promise<boolean>;
  /** Run `kind` with `args`, writing `stdin`, aborting after `timeoutMs`. */
  run(
    kind: CliAgentKind,
    args: string[],
    stdin: string,
    timeoutMs: number
  ): Promise<CliRunResult>;
}

/** Whether this platform can host a CLI agent at all (desktop only). */
export function cliAgentSupported(): boolean {
  return Platform.OS === 'macos' || Platform.OS === 'windows';
}

/**
 * The native CLI bridge, or `null` when it cannot exist here (mobile) or the
 * native module isn't registered yet.
 */
export function getCliAgentBridge(): CliAgentBridge | null {
  if (!cliAgentSupported()) {
    return null;
  }
  const mod = (NativeModules as Record<string, unknown>).CliAgent;
  return mod ? (mod as CliAgentBridge) : null;
}
