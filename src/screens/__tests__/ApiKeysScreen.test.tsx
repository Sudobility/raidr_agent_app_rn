/**
 * AI screen: the engine selector drives the aiEngine setting, CLI engines are
 * disabled off-desktop, and Tool API keys still save.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Tabs, TabsTrigger } from '@sudobility/components-rn';
import ApiKeysScreen from '../ApiKeysScreen';
import type { ApiKeysScreenProps } from '@/navigation/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { saveToolApiKey } from '@/lib/toolApiKeys';

let mockSupported = true;

jest.mock('@/native/cliAgent', () => ({
  cliAgentSupported: () => mockSupported,
  getCliAgentBridge: () => null,
}));
jest.mock('@/lib/toolApiKeys', () => ({
  listToolApiKeyHosts: jest.fn(() => Promise.resolve([])),
  saveToolApiKey: jest.fn(() => Promise.resolve()),
  deleteToolApiKey: jest.fn(() => Promise.resolve()),
  normalizeApiHost: (h: string) => h.trim().toLowerCase(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@/hooks/useTabBarHeight', () => ({ useTabBarHeight: () => 0 }));
jest.mock('@/analytics', () => ({
  trackScreenView: jest.fn(),
  trackButtonClick: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@react-navigation/native', () => ({
  useTheme: () => ({ dark: false }),
  useFocusEffect: (effect: () => void) =>
    require('react').useEffect(effect, [effect]),
  useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn() }),
}));

const props = {} as ApiKeysScreenProps;
const mounted: ReactTestRenderer[] = [];

function render(): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(<ApiKeysScreen {...props} />);
  });
  mounted.push(tree!);
  return tree!;
}

function trigger(tree: ReactTestRenderer, value: string) {
  return tree.root.findAllByType(TabsTrigger).find(n => n.props.value === value)!;
}

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

beforeEach(() => {
  mockSupported = true;
  useSettingsStore.getState().reset();
  (saveToolApiKey as jest.Mock).mockClear();
});

describe('ApiKeysScreen', () => {
  it('offers the three engines and defaults to raidr', () => {
    const tree = render();
    const values = tree.root
      .findAllByType(TabsTrigger)
      .map(n => n.props.value);
    expect(values).toEqual(['raidr', 'claude', 'codex']);
    expect(useSettingsStore.getState().aiEngine).toBe('raidr');
  });

  it('selects a CLI engine through the Tabs control', () => {
    const tree = render();
    const tabs = tree.root.findByType(Tabs);
    act(() => tabs.props.onValueChange('codex'));
    expect(useSettingsStore.getState().aiEngine).toBe('codex');
  });

  it('disables CLI engines and warns when not on desktop', () => {
    mockSupported = false;
    const tree = render();
    expect(trigger(tree, 'raidr').props.disabled).toBeFalsy();
    expect(trigger(tree, 'claude').props.disabled).toBe(true);
    expect(trigger(tree, 'codex').props.disabled).toBe(true);
  });

  it('saves a Tool API key', async () => {
    const tree = render();
    const host = tree.root.find(n => n.props.testID === 'tool-api-key-host');
    const value = tree.root.find(n => n.props.testID === 'tool-api-key-value');
    const saveBtn = tree.root.find(
      n => n.props.testID === 'tool-api-key-save'
    );
    act(() => host.props.onChangeText('places.googleapis.com'));
    act(() => value.props.onChangeText('sk-tool'));
    await act(async () => {
      await saveBtn.props.onPress();
    });
    expect(saveToolApiKey).toHaveBeenCalledWith(
      'places.googleapis.com',
      'sk-tool'
    );
  });
});
