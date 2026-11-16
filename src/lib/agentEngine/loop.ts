/**
 * `runAgentTask` — the client-side agentic tool-use loop.
 *
 * Each round the model ({@link AgentStepCaller}) sees the goal, the available
 * tools, a memory digest and recent observations, and returns one action (or
 * `done`). The loop executes the action via the {@link AgentToolExecutor},
 * feeds the outcome back, and repeats until the model is done or a cap is hit.
 *
 * Write actions are first-class and guarded: capped per run, and skipped when
 * their idempotency key is already in memory — so a scheduled agent never
 * repeats an irreversible action (e.g. messaging the same person twice), even
 * if the model forgets to check. The model is also given `memory_recall` /
 * `memory_remember` pseudo-tools for semantic dedup, and `finish` to stop.
 */

import {
  ENGINE_TOOLS,
  type AgentObservation,
  type AgentTool,
  type RunAgentTaskOptions,
  type RunAgentTaskResult,
} from './types';
import { idempotencyKey } from '@/lib/agentMemory';

const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_WRITES = 5;
/** Keep the prompt bounded: only the most recent observations are fed back. */
const OBSERVATION_WINDOW = 12;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

export async function runAgentTask(
  options: RunAgentTaskOptions
): Promise<RunAgentTaskResult> {
  const {
    goal,
    tools,
    caller,
    executor,
    memory,
    context,
    signal,
    onEvent,
  } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxWrites = options.maxWrites ?? DEFAULT_MAX_WRITES;

  const byName = new Map<string, AgentTool>(tools.map(t => [t.name, t]));
  const observations: AgentObservation[] = [];
  const emit = onEvent ?? (() => {});
  let writes = 0;
  let steps = 0;
  let summary = '';

  const observe = (tool: string, ok: boolean, text: string) => {
    const obs: AgentObservation = { tool, ok, summary: text };
    observations.push(obs);
    emit({ type: 'observation', tool, ok, summary: text });
  };

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) {
      break;
    }
    steps = step + 1;

    const decision = await caller.decide({
      goal,
      tools,
      memoryDigest: memory.digest(),
      observations: observations.slice(-OBSERVATION_WINDOW),
      ...(context ? { context } : {}),
    });
    if (decision.thought) {
      emit({ type: 'thought', text: decision.thought });
    }

    // The model finished, or chose no action (treat as finished).
    if (decision.done || !decision.action) {
      summary = decision.respond || decision.thought || summary;
      break;
    }

    const { tool, args } = decision.action;
    const meta = byName.get(tool);

    // Engine pseudo-tools.
    if (tool === ENGINE_TOOLS.finish) {
      summary = asString(args.summary) || decision.respond || decision.thought;
      break;
    }
    if (tool === ENGINE_TOOLS.recall) {
      const hits = memory.recall(asString(args.query));
      observe(
        tool,
        true,
        hits.length === 0
          ? 'nothing remembered for that'
          : hits.map(h => `${h.key}: ${h.value}`).join('; ')
      );
      continue;
    }
    if (tool === ENGINE_TOOLS.remember) {
      const key = asString(args.key);
      if (key) {
        memory.remember(key, asString(args.value));
        observe(tool, true, `remembered ${key}`);
      } else {
        observe(tool, false, 'remember needs a key');
      }
      continue;
    }

    if (!meta) {
      observe(tool, false, `unknown tool "${tool}"`);
      continue;
    }

    const isWrite = meta.kind === 'write';
    emit({ type: 'action', tool, args, write: isWrite });

    if (isWrite) {
      // Idempotency guard: never repeat a completed write.
      const key = idempotencyKey(tool, args);
      if (memory.has(key)) {
        emit({ type: 'skipped', tool, reason: 'already done' });
        observe(tool, true, 'skipped — already done in a previous run');
        continue;
      }
      if (writes >= maxWrites) {
        emit({ type: 'skipped', tool, reason: 'write cap reached' });
        observe(tool, false, 'skipped — reached this run’s action limit');
        summary = summary || 'Reached this run’s action limit.';
        break;
      }
      const result = await executor.call(tool, args);
      writes += 1;
      if (result.ok) {
        // Backstop the model's own remember with an idempotency record.
        memory.remember(key, 'done');
      }
      observe(tool, result.ok, result.summary);
      continue;
    }

    // Read tool.
    const result = await executor.call(tool, args);
    observe(tool, result.ok, result.summary);
  }

  if (!summary) {
    summary = 'Stopped after reaching the step limit.';
  }
  emit({ type: 'final', summary });
  return { summary, steps, writes, observations };
}
