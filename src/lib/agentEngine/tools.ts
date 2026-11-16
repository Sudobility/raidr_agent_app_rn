/**
 * Build the agent's toolset: the site's MCP tools (classified read vs write by
 * HTTP method) plus the engine pseudo-tools (memory + finish). The model sees
 * every tool's name, description and input schema and chooses one per step.
 */

import type { McpManifest } from '@sudobility/raidr_types';
import { ENGINE_TOOLS, type AgentTool } from './types';

/** Map a site manifest's tools to agent tools; non-GET methods are writes. */
export function siteToolsToAgentTools(manifest: McpManifest): AgentTool[] {
  return manifest.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
    kind: tool.request.method === 'GET' ? 'read' : 'write',
  }));
}

/** The engine pseudo-tools, handled inside the loop (never sent to a site). */
export function engineTools(): AgentTool[] {
  return [
    {
      name: ENGINE_TOOLS.recall,
      description:
        'Recall facts you saved in earlier runs (e.g. who you already contacted). ' +
        'Use this BEFORE any irreversible action to avoid repeating it.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
      kind: 'engine',
    },
    {
      name: ENGINE_TOOLS.remember,
      description:
        'Save a fact for future runs (e.g. that you messaged a user). ' +
        'Use this AFTER you perform an action you must not repeat.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
      kind: 'engine',
    },
    {
      name: ENGINE_TOOLS.finish,
      description: 'Finish the task and report what you did.',
      inputSchema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
      },
      kind: 'engine',
    },
  ];
}

/** The full toolset for a single-site agent: engine tools first, then site tools. */
export function buildToolset(manifest: McpManifest): AgentTool[] {
  return [...engineTools(), ...siteToolsToAgentTools(manifest)];
}
