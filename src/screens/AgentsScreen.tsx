/**
 * Agents screen — the user's conversations and saved agents.
 *
 * Two sections: ongoing conversations (multi-turn sessions) and saved agents
 * (reusable one-shot runs). "New conversation" in the header starts a session;
 * saved agents are created with "Save as agent" on a finished run. A list when
 * narrow, tiles when wide.
 */

import React, { useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { Text, Badge, Button } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import Screen from '@/components/layout/Screen';
import TileGrid from '@/components/layout/TileGrid';
import { useSavedAgentsStore } from '@/stores/savedAgentsStore';
import { useSessionsStore } from '@/stores/sessionsStore';
import { trackScreenView, trackButtonClick } from '@/analytics';
import type { AgentsScreenProps } from '@/navigation/types';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      size='sm'
      weight='semibold'
      color='muted'
      transform='uppercase'
      className='mb-2 mt-1 tracking-wide'
    >
      {children}
    </Text>
  );
}

export default function AgentsScreen({ navigation }: AgentsScreenProps) {
  const { t } = useTranslation();
  const agents = useSavedAgentsStore(s => s.agents);
  const sessions = useSessionsStore(s => s.sessions);
  const createSession = useSessionsStore(s => s.create);

  useEffect(() => {
    trackScreenView('Agents');
  }, []);

  const startConversation = () => {
    trackButtonClick('session_new');
    const id = createSession();
    navigation.navigate('Session', { sessionId: id });
  };

  const empty = agents.length === 0 && sessions.length === 0;
  const showHeadings = agents.length > 0 && sessions.length > 0;

  return (
    <Screen
      title={t('agents.title')}
      layout='list'
      hideBack
      headerRight={
        <Button
          variant='ghost'
          size='sm'
          onPress={startConversation}
          accessibilityLabel={t('session.new')}
        >
          {t('session.new')}
        </Button>
      }
    >
      {empty ? (
        <Text size='base' color='muted' className='px-1'>
          {t('agents.empty')}
        </Text>
      ) : null}

      {sessions.length > 0 ? (
        <View className='mb-6'>
          {showHeadings ? <SectionLabel>{t('session.heading')}</SectionLabel> : null}
          <TileGrid>
            {sessions.map(s => (
              <Pressable
                key={s.id}
                className='grow p-4 rounded-lg bg-card border border-foreground/10'
                onPress={() =>
                  navigation.navigate('Session', { sessionId: s.id })
                }
                accessibilityRole='button'
                accessibilityLabel={s.title || t('session.title')}
              >
                <Text size='base' weight='semibold' numberOfLines={1}>
                  {s.title || t('session.title')}
                </Text>
                <Text size='xs' color='muted' className='mt-1'>
                  {t('session.turnCount', { count: s.turns.length })}
                  {'  ·  '}
                  {new Date(s.updatedAt).toLocaleDateString()}
                </Text>
              </Pressable>
            ))}
          </TileGrid>
        </View>
      ) : null}

      {agents.length > 0 ? (
        <View>
          {showHeadings ? <SectionLabel>{t('agents.heading')}</SectionLabel> : null}
          <TileGrid>
            {agents.map(agent => (
              <Pressable
                key={agent.id}
                className='grow p-4 rounded-lg bg-card border border-foreground/10'
                onPress={() =>
                  navigation.navigate('AgentDetail', { id: agent.id })
                }
                accessibilityRole='button'
                accessibilityLabel={agent.name}
              >
                <View className='flex-row items-start justify-between'>
                  <Text size='base' weight='semibold' className='flex-1 mr-2' numberOfLines={1}>
                    {agent.name}
                  </Text>
                  {agent.schedule?.enabled ? (
                    <Badge variant='info' size='sm'>
                      {t('agents.scheduled')}
                    </Badge>
                  ) : null}
                </View>
                <Text size='sm' color='muted' className='mt-1' numberOfLines={2}>
                  {agent.request}
                </Text>
                <Text size='xs' color='muted' className='mt-2'>
                  {t('agents.siteCount', { count: agent.sites.length })}
                </Text>
              </Pressable>
            ))}
          </TileGrid>
        </View>
      ) : null}
    </Screen>
  );
}
