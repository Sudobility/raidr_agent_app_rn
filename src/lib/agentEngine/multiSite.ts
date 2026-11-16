/**
 * Multi-site tooling for the general assistant: tools from several sites are
 * presented to the model under site-namespaced names (`<slug>__<tool>`), and a
 * routing executor sends each call to the right site's {@link ToolSession},
 * opening one lazily per site with that site's Keychain token.
 */

import type { McpManifest } from '@sudobility/raidr_types';
import type {
  SiteConnector,
  ToolSession,
} from '@sudobility/raidr_agent_lib/runner';
import { engineTools, siteToolsToAgentTools } from './tools';
import type { AgentTool, AgentToolExecutor } from './types';

const SEP = '__';
const SUMMARY_MAX = 1500;

/** A stable, name-safe slug for an apiHost (`api.reddit.com` → `api_reddit_com`). */
export function siteSlug(apiHost: string): string {
  return apiHost.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

export function namespacedName(slug: string, tool: string): string {
  return `${slug}${SEP}${tool}`;
}

/** Split a namespaced tool name back into its site slug and tool. */
export function splitName(name: string): { slug: string; tool: string } | null {
  const i = name.indexOf(SEP);
  if (i <= 0) {
    return null;
  }
  return { slug: name.slice(0, i), tool: name.slice(i + SEP.length) };
}

export interface SiteToolset {
  slug: string;
  apiHost: string;
  manifest: McpManifest;
}

/** Combined toolset: engine pseudo-tools + every site's tools, site-namespaced. */
export function buildMultiSiteToolset(sites: readonly SiteToolset[]): AgentTool[] {
  const tools: AgentTool[] = [...engineTools()];
  for (const site of sites) {
    for (const tool of siteToolsToAgentTools(site.manifest)) {
      tools.push({
        ...tool,
        name: namespacedName(site.slug, tool.name),
        description: `[${site.apiHost}] ${tool.description}`,
      });
    }
  }
  return tools;
}

export interface SiteAuth {
  slug: string;
  apiHost: string;
  token?: string;
}

export interface MultiSiteExecutor extends AgentToolExecutor {
  close(): Promise<void>;
}

/** A routing executor over several sites; opens each site's session on first use. */
export function createMultiSiteExecutor(
  connector: SiteConnector,
  sites: readonly SiteAuth[]
): MultiSiteExecutor {
  const bySlug = new Map(sites.map(s => [s.slug, s]));
  const sessions = new Map<string, Promise<ToolSession>>();

  const openFor = (slug: string): Promise<ToolSession> | null => {
    let pending = sessions.get(slug);
    if (!pending) {
      const site = bySlug.get(slug);
      if (!site) {
        return null;
      }
      pending = connector.open(site.apiHost, site.token);
      sessions.set(slug, pending);
    }
    return pending;
  };

  return {
    call: async (name, args) => {
      const parts = splitName(name);
      if (!parts) {
        return { ok: false, summary: `unroutable tool "${name}"` };
      }
      const pending = openFor(parts.slug);
      if (!pending) {
        return { ok: false, summary: `unknown site for "${name}"` };
      }
      try {
        const session = await pending;
        const result = await session.callTool(parts.tool, args);
        const text = (result.text ?? '').slice(0, SUMMARY_MAX);
        return {
          ok: result.ok,
          summary:
            text ||
            (result.ok ? 'ok' : `failed (HTTP ${result.httpStatus ?? '?'})`),
        };
      } catch (error) {
        return {
          ok: false,
          summary: error instanceof Error ? error.message : String(error),
        };
      }
    },
    close: async () => {
      for (const pending of sessions.values()) {
        try {
          await (await pending).close();
        } catch {
          // best effort
        }
      }
    },
  };
}
