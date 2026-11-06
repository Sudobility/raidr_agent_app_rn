/**
 * Settings, as master and detail ({@link SplitView}): Account, Appearance,
 * Credentials (the sites the user is signed in to) and App settings, then
 * API Keys. Wide, the chosen section shows beside the list; narrow (a phone),
 * choosing a section drills into it on the split view's own stack, with a back
 * control to the list — the family's one master/detail, so `detailFocused`
 * keeps the reader on the section across a rotation.
 *
 * API Keys is a screen of its own in either layout (its drag-ordered list
 * needs the whole screen), so it is a link, not a drilled-in section.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Screen from '@/components/layout/Screen';
import SplitView, { SplitMenuList } from '@/components/layout/SplitView';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLlmKeys } from '@/hooks/useLlmKeys';
import { LLM_PROVIDER_INFO } from '@/config/llmProviders';
import type { SettingsScreenProps } from '@/navigation/types';
import { trackButtonClick, trackScreenView } from '@/analytics';
import {
  SECTION_LABEL,
  SETTINGS_SECTIONS,
  isSettingsSection,
  type SettingsSectionId,
} from './settings/sections';
import SettingsSectionView from './settings/SettingsSectionView';
import { useAccountScrollsItself } from './settings/AccountSection';

const API_KEYS = 'apiKeys';

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t } = useTranslation();
  const agentMode = useSettingsStore(s => s.agentMode);
  const { effective } = useLlmKeys();
  const [chosen, setChosen] = useState<SettingsSectionId>('account');
  // Whether the reader has drilled into a section, so a collapse after a
  // rotation reopens on it rather than on the list.
  const [detailFocused, setDetailFocused] = useState(false);
  const accountScrolls = useAccountScrollsItself();

  useEffect(() => {
    trackScreenView('Settings');
  }, []);

  /** "Cloud", or "Local · <provider in use>". */
  const agentModeLabel =
    agentMode === 'local'
      ? effective[0]
        ? t('settings.agentMode.localWith', {
            provider: LLM_PROVIDER_INFO[effective[0]].name,
          })
        : t('settings.agentMode.local')
      : t('settings.agentMode.cloud');

  const entries = [
    ...SETTINGS_SECTIONS.map(id => ({ id, label: t(SECTION_LABEL[id]) })),
    { id: API_KEYS, label: t('settings.apiKeys'), value: agentModeLabel },
  ];

  const choose = (id: string, split: boolean, showDetail: () => void) => {
    trackButtonClick(`settings_${id}`);
    if (id === API_KEYS) {
      // API Keys is its own full screen in either layout (its drag-ordered list
      // needs the whole window), so it is always a push, never a drilled-in pane.
      navigation.navigate('ApiKeys');
    } else if (isSettingsSection(id)) {
      setChosen(id);
      // Beside the list this is inert; on a narrow screen it drills in.
      if (!split) showDetail();
    }
  };

  return (
    <Screen title={t('settings.title')} hideBack layout='fill'>
      <SplitView
        detailFocused={detailFocused}
        onDetailFocusedChange={setDetailFocused}
        renderMaster={(split, showDetail) => (
          <SplitMenuList
            entries={entries}
            selected={split ? chosen : null}
            onSelect={id => choose(id, split, showDetail)}
          />
        )}
        detailTitle={t(SECTION_LABEL[chosen])}
        detail={<SettingsSectionView section={chosen} />}
        detailScrolls={chosen === 'account' && accountScrolls}
      />
    </Screen>
  );
}
