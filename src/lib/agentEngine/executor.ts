/**
 * An {@link AgentToolExecutor} that runs the agent's tool calls against one
 * site's MCP tools through a {@link ToolSession} (the `DirectSiteConnector`
 * session opened with the device's Keychain token). Returns a compact,
 * truncated outcome and never throws, so one bad call doesn't abort the loop.
 */

import type { ToolSession } from '@sudobility/raidr_agent_lib/runner';
import type { AgentToolExecutor } from './types';

/** Longest tool-result text fed back into the prompt. */
const SUMMARY_MAX = 1500;

export function createSiteExecutor(session: ToolSession): AgentToolExecutor {
  return {
    call: async (tool, args) => {
      try {
        const result = await session.callTool(tool, args);
        const text = (result.text ?? '').slice(0, SUMMARY_MAX);
        return {
          ok: result.ok,
          summary:
            text ||
            (result.ok
              ? 'ok'
              : `failed (HTTP ${result.httpStatus ?? '?'})`),
        };
      } catch (error) {
        return {
          ok: false,
          summary: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
