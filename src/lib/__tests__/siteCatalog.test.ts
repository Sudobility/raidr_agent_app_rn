/**
 * The per-run site-context cache: loads each site's context once, serves its
 * manifest from the same load, and forgets a failed load so it can be retried.
 */
import { createSiteSource } from '../siteCatalog';

const getToken = async () => 'firebase-token';

describe('createSiteSource', () => {
  it('loads each context once and serves its manifest', async () => {
    const context = {
      manifest: { apiHost: 'api.a' },
      toolAuth: {},
      routes: [],
    };
    const client = {
      getSiteContext: jest.fn(async () => ({ success: true, data: context })),
    };
    const source = createSiteSource(client as never, getToken);
    await expect(source.context('api.a')).resolves.toBe(context);
    await expect(source.manifest('api.a')).resolves.toBe(context.manifest);
    expect(client.getSiteContext).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load', async () => {
    const client = {
      getSiteContext: jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'nope' })
        .mockResolvedValueOnce({ success: true, data: { manifest: {} } }),
    };
    const source = createSiteSource(client as never, getToken);
    await expect(source.context('api.a')).rejects.toThrow('nope');
    await expect(source.context('api.a')).resolves.toEqual({ manifest: {} });
  });
});
