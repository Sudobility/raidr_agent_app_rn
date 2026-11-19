/**
 * AI screen — choose the AI engine, and manage per-site Tool API keys.
 *
 * AI engine (one choice; the only AI setting):
 * - **raidr** — the cloud route: model calls go through raidr's server, metered
 *   against the user's raidr credit balance. Works on every platform.
 * - **Claude Code** / **Codex** — a locally-installed CLI, used as the agent
 *   loop's brain. Desktop only; the user logs in with the CLI in Terminal, so
 *   there is no in-app key or login here.
 *
 * Tool API keys are unrelated to the engine: they are per-site credentials
 * (a site's own API key) kept in the Keychain, used when a site's tools need
 * one. That section is unchanged.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Alert, Linking } from 'react-native';
import Screen from '@/components/layout/Screen';
import {
  Text,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRunFlowStore } from '@/stores/runFlowStore';
import { AI_ENGINES, engineCliKind, type AiEngine } from '@/lib/aiEngine';
import { cliAgentSupported } from '@/native/cliAgent';
import {
  deleteToolApiKey,
  listToolApiKeyHosts,
  normalizeApiHost,
  saveToolApiKey,
} from '@/lib/toolApiKeys';
import { trackScreenView, trackButtonClick } from '@/analytics';
import type { ApiKeysScreenProps } from '@/navigation/types';

/** Where the user tops up raidr credits. */
const TOP_UP_URL = 'https://raidr.app/account/credits';

/** Section heading. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size='sm'
      weight='semibold'
      color='muted'
      transform='uppercase'
      className='mb-2 tracking-wide'
    >
      {children}
    </Text>
  );
}

export default function ApiKeysScreen(_props: ApiKeysScreenProps) {
  const { t } = useTranslation();
  const aiEngine = useSettingsStore(s => s.aiEngine);
  const setAiEngine = useSettingsStore(s => s.setAiEngine);
  const plan = useRunFlowStore(s => s.plan);

  const [toolHosts, setToolHosts] = useState<string[]>([]);
  const [toolHost, setToolHost] = useState('');
  const [toolKey, setToolKey] = useState('');
  const [toolError, setToolError] = useState('');
  const [savingToolKey, setSavingToolKey] = useState(false);

  const neededToolHosts = useMemo(
    () =>
      [
        ...new Set(
          (plan?.sites ?? [])
            .filter(site => site.credentialType === 'api_key')
            .map(site => site.apiHost)
        ),
      ].filter(host => !toolHosts.includes(host)),
    [plan, toolHosts]
  );

  useEffect(() => {
    trackScreenView('ApiKeys');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listToolApiKeyHosts().then(hosts => {
        if (active && hosts.length > 0) setToolHosts(hosts);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  // ---- engine -------------------------------------------------------------

  const cliKind = engineCliKind(aiEngine);
  const cliSupported = cliAgentSupported();

  const chooseEngine = useCallback(
    (value: string) => {
      const engine = value as AiEngine;
      if (engine === aiEngine) return;
      trackButtonClick('ai_engine', { engine });
      setAiEngine(engine);
    },
    [aiEngine, setAiEngine]
  );

  const topUp = useCallback(() => {
    trackButtonClick('ai_credits_top_up');
    Linking.openURL(TOP_UP_URL).catch(() => {
      Alert.alert(t('apiKeys.engine.raidr'), t('apiKeys.topUpUnavailable'));
    });
  }, [t]);

  // ---- tool keys ----------------------------------------------------------

  const saveToolKeyFn = useCallback(async () => {
    const host = normalizeApiHost(toolHost);
    if (!host || !toolKey.trim()) {
      setToolError(t('apiKeys.toolMissing'));
      return;
    }
    setSavingToolKey(true);
    setToolError('');
    try {
      await saveToolApiKey(host, toolKey);
      setToolHosts(await listToolApiKeyHosts());
      setToolHost('');
      setToolKey('');
    } catch (error) {
      setToolError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingToolKey(false);
    }
  }, [toolHost, toolKey, t]);

  const removeToolKey = useCallback(
    (host: string) => {
      Alert.alert(
        t('apiKeys.toolRemoveTitle'),
        t('apiKeys.toolRemoveMessage', { host }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('apiKeys.remove'),
            style: 'destructive',
            onPress: () => {
              deleteToolApiKey(host).then(async () =>
                setToolHosts(await listToolApiKeyHosts())
              );
            },
          },
        ]
      );
    },
    [t]
  );

  // ---- render -------------------------------------------------------------

  return (
    <Screen title={t('apiKeys.title')}>
      {/* AI engine */}
      <View className='mb-7'>
        <SectionTitle>{t('apiKeys.engineSection')}</SectionTitle>
        <Tabs value={aiEngine} onValueChange={chooseEngine}>
          <TabsList>
            {AI_ENGINES.map(engine => (
              <TabsTrigger
                key={engine}
                value={engine}
                disabled={engine !== 'raidr' && !cliSupported}
              >
                {t(`apiKeys.engine.${engine}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <View className='mt-3 px-1'>
          <Text size='sm' color={aiEngine === 'raidr' ? 'default' : 'muted'}>
            <Text size='sm' weight='semibold'>
              {t('apiKeys.engine.raidr')}
              {': '}
            </Text>
            {t('apiKeys.engineDesc.raidr')}
          </Text>
          <Text
            size='sm'
            color={aiEngine === 'claude' ? 'default' : 'muted'}
            className='mt-1'
          >
            <Text size='sm' weight='semibold'>
              {t('apiKeys.engine.claude')}
              {': '}
            </Text>
            {t('apiKeys.engineDesc.claude')}
          </Text>
          <Text
            size='sm'
            color={aiEngine === 'codex' ? 'default' : 'muted'}
            className='mt-1'
          >
            <Text size='sm' weight='semibold'>
              {t('apiKeys.engine.codex')}
              {': '}
            </Text>
            {t('apiKeys.engineDesc.codex')}
          </Text>

          {aiEngine === 'raidr' ? (
            <View className='mt-3'>
              <Button variant='outline' size='sm' onPress={topUp}>
                {t('apiKeys.topUp')}
              </Button>
            </View>
          ) : (
            <View className='mt-3' testID='ai-cli-note'>
              <Text size='sm' color={cliSupported ? 'muted' : 'warning'}>
                {cliSupported
                  ? t('apiKeys.cliLoginNote', {
                      cmd: cliKind === 'codex' ? 'codex' : 'claude',
                    })
                  : t('apiKeys.cliDesktopOnly')}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Tool API keys (per-site credentials) */}
      <View className='mb-7'>
        <SectionTitle>{t('apiKeys.toolSection')}</SectionTitle>
        <Text size='sm' color='muted' className='mb-3 px-1'>
          {t('apiKeys.toolDescription')}
        </Text>
        {neededToolHosts.map(host => (
          <Button
            key={host}
            variant='outline'
            size='sm'
            onPress={() => setToolHost(host)}
          >
            {host}
          </Button>
        ))}
        {toolHosts.map(host => (
          <View
            key={host}
            className='flex-row items-center justify-between rounded-lg bg-card p-3 mb-2'
          >
            <View className='flex-1'>
              <Text size='base' weight='semibold'>
                {host}
              </Text>
              <Text size='sm' color='muted'>
                {t('apiKeys.keySaved')}
              </Text>
            </View>
            <Button
              variant='outline'
              size='sm'
              onPress={() => removeToolKey(host)}
            >
              {t('apiKeys.remove')}
            </Button>
          </View>
        ))}
        <Input
          value={toolHost}
          onChangeText={setToolHost}
          placeholder={t('apiKeys.toolHostPlaceholder')}
          autoCapitalize='none'
          autoCorrect={false}
          testID='tool-api-key-host'
        />
        <View className='mt-2'>
          <Input
            value={toolKey}
            onChangeText={setToolKey}
            placeholder={t('apiKeys.toolKeyPlaceholder')}
            secureTextEntry
            autoCapitalize='none'
            autoCorrect={false}
            testID='tool-api-key-value'
          />
        </View>
        {toolError ? (
          <Text size='sm' color='danger' className='mt-2'>
            {toolError}
          </Text>
        ) : null}
        <View className='mt-3'>
          <Button
            variant='primary'
            disabled={savingToolKey}
            onPress={saveToolKeyFn}
            testID='tool-api-key-save'
          >
            {t('apiKeys.toolSave')}
          </Button>
        </View>
      </View>
    </Screen>
  );
}
