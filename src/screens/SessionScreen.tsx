/**
 * Session screen — a conversation with the agent.
 *
 * Shows the thread of turns (the user's request, then its results) and a
 * composer. Each send folds the recent turns into the request for context
 * ({@link buildTurnRequest}), runs it client-side ({@link runTurn}) and streams
 * the answers in. The in-flight turn is held in local state and committed to
 * the sessions store when it finishes, so streaming doesn't thrash storage.
 */

import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, Input, Button, Spinner } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import type {
  BestData,
  ResultGroup,
  ResultItem,
} from '@sudobility/raidr_agent_types';
import Screen from '@/components/layout/Screen';
import ResultList from '@/components/ResultList';
import { useAgentClient } from '@/hooks/useAgentClient';
import { useAuth } from '@/context/AuthContext';
import { useSessionsStore } from '@/stores/sessionsStore';
import {
  buildTurnRequest,
  newSessionId,
  type SessionTurn,
  type TurnStatus,
} from '@/lib/session';
import { runTurn } from '@/lib/sessionRun';
import type { RunHandle } from '@/lib/runTransport';
import { trackButtonClick, trackScreenView } from '@/analytics';
import type { SessionScreenProps } from '@/navigation/types';

/** The in-flight turn, held locally until it finishes. */
interface ActiveTurn {
  id: string;
  request: string;
  results: ResultItem[];
  best: BestData | null;
  groups: ResultGroup[];
  status: TurnStatus;
  error?: string;
}

function TurnView({
  request,
  results,
  groups,
  best,
  status,
  error,
}: {
  request: string;
  results: ResultItem[];
  groups: ResultGroup[];
  best: BestData | null;
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
      {status === 'running' ? (
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
      ) : results.length === 0 ? (
        <Text size='sm' color='muted'>
          {t('session.noResults')}
        </Text>
      ) : (
        <ResultList results={results} groups={groups} best={best} />
      )}
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

  const [input, setInput] = useState('');
  const [active, setActive] = useState<ActiveTurn | null>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const cancelledRef = useRef(false);

  React.useEffect(() => {
    trackScreenView('Session');
    return () => {
      cancelledRef.current = true;
      handleRef.current?.abort();
    };
  }, []);

  const turns = session?.turns ?? [];

  const send = useCallback(async () => {
    const raw = input.trim();
    if (!raw || active) {
      return;
    }
    trackButtonClick('session_send');
    setInput('');
    const turnId = newSessionId();
    const priorTurns = useSessionsStore
      .getState()
      .sessions.find(s => s.id === sessionId)?.turns ?? [];
    cancelledRef.current = false;
    const current: ActiveTurn = {
      id: turnId,
      request: raw,
      results: [],
      best: null,
      groups: [],
      status: 'running',
    };
    setActive(current);

    const commit = (final: ActiveTurn) => {
      if (cancelledRef.current) {
        return;
      }
      const turn: SessionTurn = {
        id: final.id,
        request: final.request,
        results: final.results,
        best: final.best,
        groups: final.groups,
        status: final.status,
        ...(final.error ? { error: final.error } : {}),
        createdAt: new Date().toISOString(),
      };
      addTurn(sessionId, turn);
      setActive(null);
      handleRef.current = null;
    };

    try {
      const handle = await runTurn(
        client,
        getToken,
        buildTurnRequest(priorTurns, raw),
        {
          onPart: part => {
            if (cancelledRef.current) {
              return;
            }
            setActive(prev => {
              if (!prev) {
                return prev;
              }
              switch (part.type) {
                case 'result':
                  return prev.results.some(r => r.id === part.data.id)
                    ? {
                        ...prev,
                        results: prev.results.map(r =>
                          r.id === part.data.id ? part.data : r
                        ),
                      }
                    : { ...prev, results: [...prev.results, part.data] };
                case 'best':
                  return { ...prev, best: part.data };
                case 'groups':
                  return { ...prev, groups: part.data.groups };
                default:
                  return prev;
              }
            });
          },
          onError: err => {
            setActive(prev =>
              prev ? { ...prev, status: 'failed', error: err.message } : prev
            );
          },
          onFinish: () => {
            setActive(prev => {
              if (prev) {
                commit({ ...prev, status: 'done' });
              }
              return prev;
            });
          },
        }
      );
      if (cancelledRef.current) {
        handle.abort();
        return;
      }
      handleRef.current = handle;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      commit({ ...current, status: 'failed', error: message });
    }
  }, [active, addTurn, client, getToken, input, sessionId]);

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
      {turns.length === 0 && !active ? (
        <Text size='base' color='muted' className='px-1'>
          {t('session.empty')}
        </Text>
      ) : null}
      {turns.map(turn => (
        <TurnView
          key={turn.id}
          request={turn.request}
          results={turn.results}
          groups={turn.groups}
          best={turn.best}
          status={turn.status}
          {...(turn.error ? { error: turn.error } : {})}
        />
      ))}
      {active ? (
        <TurnView
          request={active.request}
          results={active.results}
          groups={active.groups}
          best={active.best}
          status={active.status}
          {...(active.error ? { error: active.error } : {})}
        />
      ) : null}
    </Screen>
  );
}
