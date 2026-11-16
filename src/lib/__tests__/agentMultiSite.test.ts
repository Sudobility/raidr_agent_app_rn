/**
 * Tests for multi-site tooling: slug/namespacing round-trips, the combined
 * toolset, and the routing executor that sends each call to the right site.
 */

import type { McpManifest } from '@sudobility/raidr_types';
import type { SiteConnector } from '@sudobility/raidr_agent_lib/runner';
import {
  buildMultiSiteToolset,
  createMultiSiteExecutor,
  namespacedName,
  siteSlug,
  splitName,
} from '../agentEngine/multiSite';
import { engineTools } from '../agentEngine/tools';

function manifest(tools: { name: string; method: 'GET' | 'POST' }[]): McpManifest {
  return {
    tools: tools.map(t => ({
      name: t.name,
      description: `${t.name} desc`,
      inputSchema: { type: 'object', properties: {} },
      request: { method: t.method, pathTemplate: `/${t.name}` },
    })),
  } as unknown as McpManifest;
}

describe('slug + namespacing', () => {
  it('slugs an apiHost safely', () => {
    expect(siteSlug('api.reddit.com')).toBe('api_reddit_com');
  });
  it('round-trips name ↔ {slug, tool}', () => {
    const name = namespacedName('api_reddit_com', 'send_message');
    expect(splitName(name)).toEqual({ slug: 'api_reddit_com', tool: 'send_message' });
  });
  it('returns null for an un-namespaced name', () => {
    expect(splitName('plain')).toBeNull();
  });
});

describe('buildMultiSiteToolset', () => {
  it('includes engine tools plus every site tool, namespaced and classed', () => {
    const tools = buildMultiSiteToolset([
      { slug: 'a', apiHost: 'a.com', manifest: manifest([{ name: 'search', method: 'GET' }]) },
      { slug: 'b', apiHost: 'b.com', manifest: manifest([{ name: 'post', method: 'POST' }]) },
    ]);
    expect(tools).toHaveLength(engineTools().length + 2);
    const a = tools.find(t => t.name === 'a__search');
    const b = tools.find(t => t.name === 'b__post');
    expect(a?.kind).toBe('read');
    expect(b?.kind).toBe('write');
    expect(a?.description).toContain('a.com');
  });
});

describe('createMultiSiteExecutor', () => {
  function connector(): SiteConnector & { opened: string[] } {
    const opened: string[] = [];
    return {
      opened,
      open: async (apiHost: string) => {
        opened.push(apiHost);
        return {
          callTool: async (name: string) => ({ ok: true, text: `${apiHost}:${name}` }),
          close: async () => {},
        };
      },
    };
  }

  it('routes a namespaced call to the right site and opens it once', async () => {
    const conn = connector();
    const exec = createMultiSiteExecutor(conn, [
      { slug: 'a', apiHost: 'a.com' },
      { slug: 'b', apiHost: 'b.com' },
    ]);
    const r1 = await exec.call('a__search', {});
    const r2 = await exec.call('a__detail', {});
    const r3 = await exec.call('b__post', {});
    expect(r1.summary).toBe('a.com:search');
    expect(r3.summary).toBe('b.com:post');
    expect(conn.opened).toEqual(['a.com', 'b.com']); // 'a' opened once, reused
    await exec.close();
    void r2;
  });

  it('fails cleanly for an unknown site', async () => {
    const exec = createMultiSiteExecutor(connector(), [{ slug: 'a', apiHost: 'a.com' }]);
    const r = await exec.call('zzz__tool', {});
    expect(r.ok).toBe(false);
  });
});
