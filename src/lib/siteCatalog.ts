/**
 * Site context + manifest access through raidr_agent_api, cached per run.
 *
 * The agent loop (assistant + autonomous) uses this to load a site's tools and
 * context on demand. The device supplies the Keychain token at call time, so
 * nothing secret is stored here; the cache only de-duplicates in-flight loads
 * within a single run and forgets a failed one so it can be retried.
 */

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import type { SiteContext } from '@sudobility/raidr_agent_types';
import type { BaseResponse } from '@sudobility/types';
import type { McpManifest } from '@sudobility/raidr_types';
import type {
  SiteCatalog,
  SiteContextSource,
} from '@sudobility/raidr_agent_lib/runner';

/** Unwrap a `BaseResponse`, turning a failure into an `Error`. */
function unwrap<T>(response: BaseResponse<T>, what: string): T {
  if (!response.success || response.data == null) {
    throw new Error(response.error || `${what} failed`);
  }
  return response.data as T;
}

/** A site-context source that also serves the bare manifest. */
export type SiteSource = SiteContextSource & SiteCatalog;

export function createSiteSource(
  client: RaidrAgentClient,
  getToken: TokenGetter
): SiteSource {
  const cache = new Map<string, Promise<SiteContext>>();
  const context = (apiHost: string): Promise<SiteContext> => {
    let pending = cache.get(apiHost);
    if (!pending) {
      pending = (async () => {
        const token = await getToken();
        return unwrap(
          await client.getSiteContext(apiHost, token ?? ''),
          `Loading ${apiHost}`
        );
      })();
      pending.catch(() => cache.delete(apiHost));
      cache.set(apiHost, pending);
    }
    return pending;
  };
  return {
    context,
    manifest: async (apiHost: string): Promise<McpManifest> =>
      (await context(apiHost)).manifest,
  };
}
