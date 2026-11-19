/**
 * Settings store - Persisted app settings with Zustand
 *
 * Uses Zustand's `persist` middleware with AsyncStorage as the storage backend
 * to persist user preferences across app restarts: theme, the AI engine
 * (raidr cloud, or a local Claude Code / Codex CLI) and granted permissions.
 *
 * The store is keyed under `'raidr-agent-settings'` in AsyncStorage.
 * Version history:
 * - 0: `{ theme }`
 * - 1: adds `agentMode` and `providerOrder`
 * - 2: adds `grantedPermissions`
 * - 3: adds `cliAgent`
 * - 4: replaces `agentMode`/`providerOrder`/`cliAgent` with `aiEngine`
 *      (the in-app own-key path was removed)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAiEngine, type AiEngine } from '@/lib/aiEngine';
import {
  normalizePermissions,
  type PermissionKind,
} from '@/lib/permissionKinds';

export type { AiEngine } from '@/lib/aiEngine';

/** The user's preferred colour scheme. `'system'` follows the OS setting. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** The persisted fields. */
interface PersistedSettings {
  theme: ThemeMode;
  /** The AI engine for model decisions: raidr (cloud) or a local CLI. */
  aiEngine: AiEngine;
  /**
   * Permissions the user allowed on a permission screen. Their screen is
   * skipped next time (the OS prompt has been answered); if using the
   * permission then fails, the screen is shown again.
   */
  grantedPermissions: PermissionKind[];
}

/** Shape of the settings Zustand store. */
interface SettingsState extends PersistedSettings {
  /** Update the theme mode preference and persist it. */
  setTheme: (theme: ThemeMode) => void;
  /** Choose the AI engine (raidr cloud, or a local Claude Code / Codex CLI). */
  setAiEngine: (aiEngine: AiEngine) => void;
  /** Record whether a permission was allowed. */
  setPermissionGranted: (kind: PermissionKind, granted: boolean) => void;
  /** Reset all settings to their initial defaults. */
  reset: () => void;
}

/** Default values for all settings fields. */
const initialState: PersistedSettings = {
  theme: 'system',
  aiEngine: 'raidr',
  grantedPermissions: [],
};

const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark'];

/**
 * Bring any persisted value (any version, possibly hand-edited or partial) to
 * the current shape, filling defaults for missing or invalid fields.
 */
export function sanitizeSettings(persisted: unknown): PersistedSettings {
  const p = (
    persisted && typeof persisted === 'object' ? persisted : {}
  ) as Partial<Record<keyof PersistedSettings, unknown>>;
  return {
    theme: THEMES.includes(p.theme as ThemeMode)
      ? (p.theme as ThemeMode)
      : initialState.theme,
    // Older versions stored agentMode ('cloud' | 'local') + provider keys;
    // the own-key path is gone, so any prior mode maps to the raidr cloud
    // engine unless a CLI engine was explicitly chosen.
    aiEngine: normalizeAiEngine(
      p.aiEngine ??
        ((p as Record<string, unknown>).cliAgent === 'codex'
          ? 'codex'
          : undefined)
    ),
    grantedPermissions: normalizePermissions(p.grantedPermissions),
  };
}

/**
 * Zustand store hook for app settings.
 *
 * @example
 * ```ts
 * const { theme, setTheme } = useSettingsStore();
 * setTheme('dark');
 * ```
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      ...initialState,
      setTheme: theme => set({ theme }),
      setAiEngine: aiEngine => set({ aiEngine: normalizeAiEngine(aiEngine) }),
      setPermissionGranted: (kind, granted) =>
        set(state => ({
          grantedPermissions: granted
            ? [...new Set([...state.grantedPermissions, kind])]
            : state.grantedPermissions.filter(k => k !== kind),
        })),
      reset: () =>
        set({
          ...initialState,
          grantedPermissions: [],
        }),
    }),
    {
      name: 'raidr-agent-settings',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        theme: state.theme,
        aiEngine: state.aiEngine,
        grantedPermissions: state.grantedPermissions,
      }),
      // Older versions lack the agent fields; sanitizing fills the defaults.
      migrate: persisted => sanitizeSettings(persisted),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeSettings(persisted),
      }),
    }
  )
);
