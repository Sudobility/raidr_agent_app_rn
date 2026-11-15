/**
 * Edit an agent's schedule: enable it, pick a cadence (every N minutes, daily
 * at a time, or weekly on chosen days), and save. Returns an {@link AgentSchedule}
 * (or null to clear the schedule). Pure UI — the parent persists the result.
 */

import React, { useEffect, useState } from 'react';
import { View, Switch, Pressable } from 'react-native';
import { Modal, Input, Button, Text } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import type {
  AgentSchedule,
  AgentScheduleKind,
} from '@sudobility/raidr_agent_types';
import { parseHHmm } from '@/lib/schedule';

const KINDS: AgentScheduleKind[] = ['interval', 'daily', 'weekly'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export default function ScheduleModal({
  visible,
  schedule,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  schedule?: AgentSchedule | null;
  onSubmit: (schedule: AgentSchedule | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const [enabled, setEnabled] = useState(false);
  const [kind, setKind] = useState<AgentScheduleKind>('daily');
  const [interval, setInterval] = useState('60');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setEnabled(schedule?.enabled ?? false);
    setKind(schedule?.kind ?? 'daily');
    setInterval(
      schedule?.intervalMinutes ? String(schedule.intervalMinutes) : '60'
    );
    setTime(schedule?.timeOfDay ?? '09:00');
    setDays(
      schedule?.daysOfWeek && schedule.daysOfWeek.length > 0
        ? schedule.daysOfWeek
        : [1, 2, 3, 4, 5]
    );
  }, [visible, schedule]);

  const intervalValid =
    kind !== 'interval' || (Number.isInteger(Number(interval)) && Number(interval) >= 1);
  const timeValid = kind === 'interval' || parseHHmm(time) !== null;
  const daysValid = kind !== 'weekly' || days.length > 0;
  const valid = !enabled || (intervalValid && timeValid && daysValid);

  const toggleDay = (day: number) =>
    setDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );

  const submit = () => {
    if (!valid) {
      return;
    }
    if (!enabled) {
      // Keep the cadence settings but mark it off (null clears entirely).
      onSubmit(
        schedule
          ? { ...schedule, enabled: false }
          : null
      );
      return;
    }
    const next: AgentSchedule = {
      enabled: true,
      kind,
      ...(kind === 'interval' ? { intervalMinutes: Number(interval) } : {}),
      ...(kind !== 'interval' ? { timeOfDay: time.trim() } : {}),
      ...(kind === 'weekly' ? { daysOfWeek: days } : {}),
      ...(deviceTimeZone() ? { timeZone: deviceTimeZone() } : {}),
      // Preserve the last run so editing doesn't restart the cadence.
      ...(schedule?.lastRunAt ? { lastRunAt: schedule.lastRunAt } : {}),
    };
    onSubmit(next);
  };

  return (
    <Modal isOpen={visible} onClose={onClose} title={t('schedule.title')}>
      <View className='gap-5'>
        <View className='flex-row items-center justify-between'>
          <Text size='base'>{t('schedule.enable')}</Text>
          <Switch value={enabled} onValueChange={setEnabled} />
        </View>

        {enabled ? (
          <>
            <View className='flex-row gap-2'>
              {KINDS.map(k => (
                <Button
                  key={k}
                  variant={kind === k ? 'primary' : 'outline'}
                  size='sm'
                  onPress={() => setKind(k)}
                >
                  {t(`schedule.kind.${k}`)}
                </Button>
              ))}
            </View>

            {kind === 'interval' ? (
              <View className='gap-1'>
                <Text size='sm' color='muted'>
                  {t('schedule.everyMinutes')}
                </Text>
                <Input
                  value={interval}
                  onChangeText={setInterval}
                  keyboardType='number-pad'
                  accessibilityLabel={t('schedule.everyMinutes')}
                />
              </View>
            ) : (
              <View className='gap-1'>
                <Text size='sm' color='muted'>
                  {t('schedule.atTime')}
                </Text>
                <Input
                  value={time}
                  onChangeText={setTime}
                  placeholder='09:00'
                  autoCapitalize='none'
                  accessibilityLabel={t('schedule.atTime')}
                />
              </View>
            )}

            {kind === 'weekly' ? (
              <View className='gap-1'>
                <Text size='sm' color='muted'>
                  {t('schedule.onDays')}
                </Text>
                <View className='flex-row gap-1'>
                  {DAY_KEYS.map((key, day) => {
                    const on = days.includes(day);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => toggleDay(day)}
                        accessibilityRole='button'
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={t(`schedule.day.${key}`)}
                        className={`w-9 h-9 rounded-full items-center justify-center ${
                          on ? 'bg-primary' : 'bg-card border border-foreground/20'
                        }`}
                      >
                        <Text size='xs' className={on ? 'text-white' : ''}>
                          {t(`schedule.dayShort.${key}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <View className='flex-row justify-end gap-2'>
          <Button variant='outline' size='sm' onPress={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size='sm' disabled={!valid} onPress={submit}>
            {t('common.done')}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
