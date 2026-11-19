/**
 * Session screen — a long-lasting general assistant conversation.
 *
 * Always-on composer; each message runs the multi-site agentic loop
 * ({@link runAssistantTurn}) across whichever sites fit, streaming the
 * thought/action/observation transcript and a final reply. The prompt stays
 * bounded by compaction: once turns age out of the recent window they are
 * folded into a rolling summary (through the chosen engine — cloud or CLI, no
 * user key) while the recent ones are sent verbatim. The in-flight turn is held
 * locally and committed to the store when it finishes.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, Input, Button, Spinner } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import Screen from '@/components/layout/Screen';
import AgentTranscript from '@/components/AgentTranscript';
import { useAgentClient } from '@/hooks/useAgentClient';
import { useAuth } from '@/context/AuthContext';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionsStore } from '@/stores/sessionsStore';
import { newSessionId, type SessionTurn, type TurnStatus } from '@/lib/session';
import { runAssistantTurn } from '@/lib/assistantRun';
import { resolveAgentStepCaller } from '@/lib/agentCaller';
import { engineCliKind } from '@/lib/aiEngine';
import { getCliAgentBridge } from '@/native/cliAgent';
import {
  buildContext,
  createSummarizer,
  planCompaction,
  turnsToItems,
  DEFAULT_KEEP_RECENT,
  type CompactItem,
} from '@/lib/compaction';
import type { AgentEvent } from '@/lib/agentEngine/types';
import { trackButtonClick, trackScreenView } from '@/analytics';
import type { SessionScreenProps } from '@/navigation/types';

interface ActiveTurn {
  id: string;
  request: string;
  transcript: AgentEvent[];
  response: string;
  status: TurnStatus;
  error?: string;
}

function TurnView({
  request,
  transcript,
  response,
  status,
  error,
}: {
  request: string;
  transcript: AgentEvent[];
  response: string;
  status: TurnStatus;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <View className='mb-6'>
      <View className='items-end mb-3'>
        <View className='px-4 py-2 rounded-2xl bg-primary/10 max-w-[85%]'>
          <Text size='base'>{request}</Text>
        </View>
      </View>
      {transcript.length > 0 ? (
        <View className='mb-2'>
          <AgentTranscript events={transcript} />
        </View>
      ) : null}
      {status === 'running' && !response ? (
        <View className='flex-row items-center'>
          <Spinner size='small' />
          <Text size='sm' color='muted' className='ml-2'>
            {t('session.working')}
          </Text>
        </View>
      ) : status === 'failed' ? (
        <Text size='sm' color='danger'>
          {error ?? t('session.failed')}
        </Text>
      ) : response ? (
        <View className='px-4 py-2 rounded-2xl bg-card border border-foreground/10 self-start max-w-[90%]'>
          <Text size='base'>{response}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function SessionScreen({ route }: SessionScreenProps) {
  const { t } = useTranslation();
  const { sessionId } = route.params;

  const session = useSessionsStore(s => s.sessions.find(x => x.id === sessionId));
  const addTurn = useSessionsStore(s => s.addTurn);

  const client = useAgentClient();
  const { getToken } = useAuth();
  const aiEngine = useSettingsStore(s => s.aiEngine);

  const [input, setInput] = useState('');
  const [active, setActive] = useState<ActiveTurn | null>(null);
  const cancelledRef = useRef(false);

  // A local CLI engine runs on the desktop; warn if it can't be reached here.
  const cliUnavailable =
    engineCliKind(aiEngine) != null && getCliAgentBridge() == null;

  useEffect(() => {
    trackScreenView('Session');
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const turns = useMemo(() => session?.turns ?? [], [session]);

  // Fold turns that have aged out of the recent window into the rolling summary
  // so the next prompt stays bounded. Routed through the same engine as the loop
  // (cloud server-key or a local CLI); best-effort — a failure just defers the
  // fold to the next successful turn.
  const compact = useCallback(async () => {
    const store = useSessionsStore.getState();
    const current = store.sessions.find(s => s.id === sessionId);
    if (!current) {
      return;
    }
    const plan = planCompaction(
      current.turns.length,
      current.summarizedCount ?? 0
    );
    if (!plan) {
      return;
    }
    const items = turnsToItems(current.turns.slice(plan.from, plan.to));
    const caller = resolveAgentStepCaller(client, getToken, {});
    try {
      const summary = await createSummarizer(caller).summarize(
        current.summary ?? '',
        items
      );
      store.setSummary(sessionId, summary, plan.to);
    } catch {
      // Best-effort; the gap re-folds on the next successful turn.
    }
  }, [client, getToken, sessionId]);

  const send = useCallback(async () => {
    const raw = input.trim();
    if (!raw || active) {
      return;
    }
    trackButtonClick('session_send');
    setInput('');
    cancelledRef.current = false;

    const current: ActiveTurn = {
      id: newSessionId(),
      request: raw,
      transcript: [],
      response: '',
      status: 'running',
    };
    setActive(current);

    // Build the bounded context: summary + the recent turns verbatim.
    const priorSummary = session?.summary ?? '';
    const recent: CompactItem[] = turns
      .slice(-DEFAULT_KEEP_RECENT)
      .flatMap(turn => [
        { role: 'user' as const, text: turn.request },
        { role: 'agent' as const, text: turn.response ?? '(no reply)' },
      ]);
    const context = buildContext(priorSummary, recent);

    const commit = (final: ActiveTurn) => {
      if (cancelledRef.current) {
        return;
      }
      const turn: SessionTurn = {
        id: final.id,
        request: final.request,
        transcript: final.transcript,
        response: final.response,
        status: final.status,
        ...(final.error ? { error: final.error } : {}),
        createdAt: new Date().toISOString(),
      };
      addTurn(sessionId, turn);
      setActive(null);
      if (final.status === 'done') {
        void compact();
      }
    };

    try {
      const result = await runAssistantTurn(client, getToken, raw, {
        memoryId: sessionId,
        ...(context ? { context } : {}),
        onEvent: event => {
          if (cancelledRef.current) {
            return;
          }
          setActive(prev =>
            prev
              ? {
                  ...prev,
                  transcript: [...prev.transcript, event],
                  response:
                    event.type === 'final' ? event.summary : prev.response,
                }
              : prev
          );
        },
      });
      commit({ ...current, response: result.summary, status: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      commit({ ...current, status: 'failed', error: message });
    }
  }, [
    active,
    addTurn,
    client,
    compact,
    getToken,
    input,
    session?.summary,
    sessionId,
    turns,
  ]);

  const composer = (
    <View className='flex-row items-end gap-2 px-4 py-3 border-t border-foreground/10 bg-background'>
      <View className='flex-1'>
        <Input
          value={input}
          onChangeText={setInput}
          placeholder={t('session.placeholder')}
          multiline
          editable={!active}
          returnKeyType='send'
          onSubmitEditing={send}
          accessibilityLabel={t('session.placeholder')}
        />
      </View>
      <Button size='sm' onPress={send} disabled={!input.trim() || !!active}>
        {t('session.send')}
      </Button>
    </View>
  );

  return (
    <Screen
      title={session?.title || t('session.title')}
      layout='list'
      footer={composer}
    >
      {cliUnavailable ? (
        <View className='mb-4 p-3 rounded-lg bg-primary/10'>
          <Text size='sm'>{t('session.cliUnavailable')}</Text>
        </View>
      ) : null}
      {turns.length === 0 && !active ? (
        <Text size='base' color='muted' className='px-1'>
          {t('session.empty')}
        </Text>
      ) : null}
      {turns.map(turn => (
        <TurnView
          key={turn.id}
          request={turn.request}
          transcript={turn.transcript ?? []}
          response={turn.response ?? ''}
          status={turn.status}
          {...(turn.error ? { error: turn.error } : {})}
        />
      ))}
      {active ? (
        <TurnView
          request={active.request}
          transcript={active.transcript}
          response={active.response}
          status={active.status}
          {...(active.error ? { error: active.error } : {})}
        />
      ) : null}
    </Screen>
  );
}
