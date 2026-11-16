/**
 * Shared types for the autonomous agentic engine — a client-side ReAct-style
 * tool-use loop. The loop ({@link RunAgentTaskOptions}) is engine-agnostic: the
 * app injects a {@link AgentStepCaller} (the model), a {@link AgentToolExecutor}
 * (the site connector) and an {@link AgentMemoryPort} (persistent memory), so
 * the loop itself is pure and unit-testable with mocks.
 */

/** A tool the agent may call: a site tool, or an engine pseudo-tool. */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON-schema-shaped input, shown to the model. */
  inputSchema: Record<string, unknown>;
  /**
   * `read` (safe, repeatable), `write` (a side effect — guarded + capped), or
   * `engine` (memory / finish pseudo-tools handled in the loop, not executed).
   */
  kind: 'read' | 'write' | 'engine';
}

/** The model's chosen action this step. */
export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
}

/** One model decision (the loop's structured output). */
export interface AgentStepOutput {
  thought: string;
  action: AgentAction | null;
  done: boolean;
  /** A message to the user / final summary when the task is complete. */
  respond?: string;
}

/** A compact result of one executed tool call, fed into the next prompt. */
export interface AgentObservation {
  tool: string;
  ok: boolean;
  summary: string;
}

/** Streamed to the UI / transcript as the loop runs. */
export type AgentEvent =
  | { type: 'thought'; text: string }
  | { type: 'action'; tool: string; args: Record<string, unknown>; write: boolean }
  | { type: 'observation'; tool: string; ok: boolean; summary: string }
  | { type: 'skipped'; tool: string; reason: string }
  | { type: 'final'; summary: string }
  | { type: 'error'; message: string };

/** Persistent per-agent memory the loop reads/writes. */
export interface AgentMemoryPort {
  /** Entries whose key or value loosely match `query` (all when omitted). */
  recall(query?: string): { key: string; value: string }[];
  remember(key: string, value: string): void;
  has(key: string): boolean;
  /** A compact string for the prompt, within `budget` characters. */
  digest(budget?: number): string;
}

/** Executes a site tool call and returns a compact outcome (never throws). */
export interface AgentToolExecutor {
  call(
    tool: string,
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; summary: string }>;
}

/** The prompt inputs for one model decision. */
export interface AgentPromptInput {
  goal: string;
  tools: AgentTool[];
  memoryDigest: string;
  observations: AgentObservation[];
  /** Prior compacted conversation context (long-lasting sessions). */
  context?: string;
}

/** Produces one model decision from the running prompt. */
export interface AgentStepCaller {
  decide(input: AgentPromptInput): Promise<AgentStepOutput>;
}

export interface RunAgentTaskOptions {
  goal: string;
  tools: AgentTool[];
  caller: AgentStepCaller;
  executor: AgentToolExecutor;
  memory: AgentMemoryPort;
  context?: string;
  /** Hard cap on model rounds (default 12). */
  maxSteps?: number;
  /** Hard cap on write actions per run (default 5). */
  maxWrites?: number;
  signal?: { aborted: boolean };
  onEvent?: (event: AgentEvent) => void;
}

export interface RunAgentTaskResult {
  summary: string;
  steps: number;
  writes: number;
  observations: AgentObservation[];
}

/** Names of the engine pseudo-tools (handled in the loop, never executed). */
export const ENGINE_TOOLS = {
  recall: 'memory_recall',
  remember: 'memory_remember',
  finish: 'finish',
} as const;
