/**
 * Agent detail — run, rename or delete one saved agent.
 *
 * "Run now" re-prepares the agent's stored intent and sites, seeds the shared
 * run-flow store and opens the Results screen on the Ask tab, where the run
 * streams and lands in History exactly like an interactive run. Scheduling is
 * added in a later phase; this screen shows an agent's schedule state only.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Text, Button, Spinner } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import Screen from '@/components/layout/Screen';
import AgentNameModal from '@/components/AgentNameModal';
import ScheduleModal from '@/components/ScheduleModal';
import { useSavedAgentsStore } from '@/stores/savedAgentsStore';
import { useAgentClient } from '@/hooks/useAgentClient';
import { useAuth } from '@/context/AuthContext';
import { prepareAndSeedSavedAgent } from '@/lib/agentRun';
import { touchAgent } from '@/lib/savedAgent';
import { computeNextRun } from '@/lib/schedule';
import type { AgentSchedule } from '@sudobility/raidr_agent_types';
import { trackButtonClick } from '@/analytics';
import type { AgentDetailScreenProps } from '@/navigation/types';

export default function AgentDetailScreen({
  route,
  navigation,
}: AgentDetailScreenProps) {
  const { t } = useTranslation();
  const { id } = route.params;

  const agent = useSavedAgentsStore(s => s.agents.find(a => a.id === id));
  const upsert = useSavedAgentsStore(s => s.upsert);
  const remove = useSavedAgentsStore(s => s.remove);

  const client = useAgentClient();
  const { getToken } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  if (!agent) {
    return (
      <Screen title={t('agents.detailTitle')}>
        <Text size='base' color='muted'>
          {t('agents.notFound')}
        </Text>
      </Screen>
    );
  }

  const runNow = async () => {
    trackButtonClick('agent_run_now');
    setBusy(true);
    setError(null);
    try {
      await prepareAndSeedSavedAgent(client, getToken, agent);
      navigation.getParent()?.navigate('AskTab', { screen: 'Results' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const rename = (name: string) => {
    upsert(touchAgent({ ...agent, name }));
    setRenaming(false);
  };

  const saveSchedule = (schedule: AgentSchedule | null) => {
    trackButtonClick('agent_schedule_save');
    upsert(touchAgent({ ...agent, schedule }));
    setScheduling(false);
  };

  const scheduleSummary = (schedule: AgentSchedule): string => {
    if (schedule.kind === 'interval') {
      return t('schedule.summary.interval', {
        count: schedule.intervalMinutes ?? 0,
      });
    }
    if (schedule.kind === 'daily') {
      return t('schedule.summary.daily', { time: schedule.timeOfDay });
    }
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const names = (schedule.daysOfWeek ?? [])
      .map(d => t(`schedule.dayShort.${dayKeys[d]}`))
      .join(', ');
    return t('schedule.summary.weekly', {
      days: names,
      time: schedule.timeOfDay,
    });
  };

  const deleteAgent = () => {
    trackButtonClick('agent_delete');
    remove(agent.id);
    navigation.goBack();
  };

  return (
    <Screen title={agent.name}>
      <View className='gap-6'>
        <View>
          <Text
            size='sm'
            weight='semibold'
            color='muted'
            transform='uppercase'
            className='mb-1 tracking-wide'
          >
            {t('agents.request')}
          </Text>
          <Text size='base'>{agent.request}</Text>
        </View>

        <View>
          <Text
            size='sm'
            weight='semibold'
            color='muted'
            transform='uppercase'
            className='mb-1 tracking-wide'
          >
            {t('agents.sites')}
          </Text>
          {agent.sites.length === 0 ? (
            <Text size='sm' color='muted'>
              {t('agents.siteCount', { count: 0 })}
            </Text>
          ) : (
            agent.sites.map(site => (
              <Text key={site.apiHost} size='sm' className='mt-0.5'>
                {site.apiHost}
              </Text>
            ))
          )}
        </View>

        <View>
          <Text
            size='sm'
            weight='semibold'
            color='muted'
            transform='uppercase'
            className='mb-1 tracking-wide'
          >
            {t('agents.schedule')}
          </Text>
          {agent.schedule?.enabled ? (
            <>
              <Text size='sm'>{scheduleSummary(agent.schedule)}</Text>
              {(() => {
                const next = computeNextRun(agent.schedule, Date.now());
                return next ? (
                  <Text size='xs' color='muted' className='mt-0.5'>
                    {t('schedule.nextRun', {
                      when: new Date(next).toLocaleString(),
                    })}
                  </Text>
                ) : null;
              })()}
            </>
          ) : (
            <Text size='sm' color='muted'>
              {t('agents.notScheduled')}
            </Text>
          )}
        </View>

        {error ? (
          <Text size='sm' color='danger'>
            {error}
          </Text>
        ) : null}

        <View className='gap-3'>
          <Button onPress={runNow} disabled={busy}>
            {busy ? <Spinner size='small' /> : t('agents.runNow')}
          </Button>
          <Button variant='outline' onPress={() => setScheduling(true)} disabled={busy}>
            {t('agents.schedule')}
          </Button>
          <Button variant='outline' onPress={() => setRenaming(true)} disabled={busy}>
            {t('agents.rename')}
          </Button>
          <Button variant='outline' onPress={deleteAgent} disabled={busy}>
            {t('agents.delete')}
          </Button>
        </View>
      </View>

      <AgentNameModal
        visible={renaming}
        title={t('agents.renameTitle')}
        initialName={agent.name}
        submitLabel={t('agents.rename')}
        onSubmit={rename}
        onClose={() => setRenaming(false)}
      />

      <ScheduleModal
        visible={scheduling}
        schedule={agent.schedule}
        onSubmit={saveSchedule}
        onClose={() => setScheduling(false)}
      />
    </Screen>
  );
}
