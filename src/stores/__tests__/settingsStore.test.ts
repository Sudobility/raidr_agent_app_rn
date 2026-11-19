/**
 * The agent settings persist, and state saved by older versions (theme only)
 * rehydrates with the new defaults.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore, sanitizeSettings } from '../settingsStore';

const KEY = 'raidr-agent-settings';

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettingsStore.getState().reset();
});

describe('settingsStore agent settings', () => {
  it('defaults to the raidr engine', () => {
    expect(useSettingsStore.getState().aiEngine).toBe('raidr');
  });

  it('sets the AI engine, normalising unknown values', () => {
    useSettingsStore.getState().setAiEngine('codex');
    expect(useSettingsStore.getState().aiEngine).toBe('codex');
    useSettingsStore.getState().setAiEngine('nope' as never);
    expect(useSettingsStore.getState().aiEngine).toBe('raidr');
  });

  it('migrates version-0 state (theme only) to the new defaults', async () => {
    useSettingsStore.getState().setAiEngine('codex');
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ state: { theme: 'dark' }, version: 0 })
    );
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    expect(s.theme).toBe('dark');
    expect(s.aiEngine).toBe('raidr');
  });

  it('maps a legacy cloud/local agentMode to the raidr engine', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        state: { theme: 'light', agentMode: 'local', providerOrder: [] },
        version: 1,
      })
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().aiEngine).toBe('raidr');
  });

  it('keeps a legacy codex cliAgent choice as the codex engine', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        state: { theme: 'light', agentMode: 'local', cliAgent: 'codex' },
        version: 3,
      })
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().aiEngine).toBe('codex');
  });

  it('sanitizes garbage', () => {
    expect(sanitizeSettings({ theme: 'neon', aiEngine: 7 })).toEqual({
      theme: 'system',
      aiEngine: 'raidr',
      grantedPermissions: [],
    });
  });

  it('keeps known granted permissions once (v1 had none)', () => {
    expect(
      sanitizeSettings({
        grantedPermissions: ['location', 'teleport', 'location'],
      }).grantedPermissions
    ).toEqual(['location']);
  });

  it('records a permission being allowed and taken back', () => {
    const { setPermissionGranted } = useSettingsStore.getState();
    setPermissionGranted('location', true);
    setPermissionGranted('location', true);
    expect(useSettingsStore.getState().grantedPermissions).toEqual(['location']);
    setPermissionGranted('location', false);
    expect(useSettingsStore.getState().grantedPermissions).toEqual([]);
  });
});
