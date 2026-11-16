/**
 * Renders an agentic run's transcript — the thought / action / observation /
 * skipped events — as compact muted lines. Shared by the assistant session and
 * an autonomous agent's Run-now view. The `final` event is rendered by the
 * caller (as the reply), so it is skipped here.
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '@sudobility/components-rn';
import type { AgentEvent } from '@/lib/agentEngine/types';

function Line({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case 'thought':
      return (
        <Text size='xs' color='muted' className='italic mt-1'>
          {event.text}
        </Text>
      );
    case 'action':
      return (
        <Text size='xs' color='muted' className='mt-1'>
          → {event.tool}
          {event.write ? ' (action)' : ''}
        </Text>
      );
    case 'observation':
      return (
        <Text size='xs' color='muted' className='mt-0.5' numberOfLines={2}>
          · {event.ok ? '' : '⚠ '}
          {event.summary}
        </Text>
      );
    case 'skipped':
      return (
        <Text size='xs' color='muted' className='mt-0.5'>
          · skipped {event.tool}: {event.reason}
        </Text>
      );
    case 'error':
      return (
        <Text size='xs' color='danger' className='mt-0.5'>
          {event.message}
        </Text>
      );
    default:
      return null;
  }
}

export default function AgentTranscript({ events }: { events: AgentEvent[] }) {
  const lines = events.filter(e => e.type !== 'final');
  if (lines.length === 0) {
    return null;
  }
  return (
    <View className='pl-1 border-l-2 border-foreground/10'>
      {lines.map((event, i) => (
        <Line key={i} event={event} />
      ))}
    </View>
  );
}
