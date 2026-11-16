/**
 * Session screen — a long-lasting general assistant conversation.
 *
 * Always-on composer; each message runs the multi-site agentic loop
 * ({@link runAssistantTurn}) across whichever sites fit, streaming the
 * thought/action/observation transcript and a final reply. The prompt stays
 * bounded by compaction: a rolling summary covers older turns while the recent
 * ones are sent verbatim. The in-flight turn is held locally and committed to
 * the store when it finishes. Requires the user's own LLM key.
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
import { NoLlmKeyError } from '@/lib/autonomousRun';
import { loadProviderKeys } from '@/lib/llmKeys';
import {
  buildContext,
  createSessionSummarizer,
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
  const setSummary = useSessionsStore(s => s.setSummary);

  const client = useAgentClient();
  const { getToken } = useAuth();
  const providerOrder = useSettingsStore(s => s.providerOrder);

  const [input, setInput] = useState('');
  const [active, setActive] = useState<ActiveTurn | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    trackScreenView('Session');
    loadProviderKeys(providerOrder)
      .then(keys => setHasKey(keys.length > 0))
      .catch(() => setHasKey(false));
    return () => {
      cancelledRef.current = true;
    };
  }, [providerOrder]);

  const turns = useMemo(() => session?.turns ?? [], [session]);

  /** Fold the turn that just dropped out of the recent window into the summary. */
  const maybeCompact = useCallback(
    async (committed: SessionTurn[], priorSummary: string) => {
      if (committed.length <= DEFAULT_KEEP_RECENT) {
        return;
      }
      const dropped = committed[committed.length - DEFAULT_KEEP_RECENT - 1];
      if (!dropped) {
        return;
      }
      try {
        const providers = await loadProviderKeys(providerOrder);
        if (providers.length === 0) {
          return;
        }
        const items: CompactItem[] = [
          { role: 'user', text: dropped.request },
          { role: 'agent', text: dropped.response ?? '(no reply)' },
        ];
        const summary = await createSessionSummarizer(providers).summarize(
          priorSummary,
          items
        );
        setSummary(sessionId, summary);
      } catch {
        // Compaction is best-effort; the recent turns still carry context.
      }
    },
    [providerOrder, sessionId, setSummary]
  );

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
      void maybeCompact([...turns, turn], priorSummary);
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
      const message =
        err instanceof NoLlmKeyError
          ? err.message
          : err instanceof Error
          ? err.message
          : String(err);
      commit({ ...current, status: 'failed', error: message });
    }
  }, [active, addTurn, client, getToken, input, maybeCompact, session?.summary, sessionId, turns]);

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
      {hasKey === false ? (
        <View className='mb-4 p-3 rounded-lg bg-primary/10'>
          <Text size='sm'>{t('session.needKey')}</Text>
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
