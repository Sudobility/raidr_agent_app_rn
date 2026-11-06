const mockSecrets = new Map<string, string>();
const mockIndex = new Map<string, string>();

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(async (_user: string, password: string, options: { service: string }) => {
    mockSecrets.set(options.service, password);
    return true;
  }),
  getGenericPassword: jest.fn(async (options: { service: string }) => {
    const password = mockSecrets.get(options.service);
    return password ? { username: 'api-key', password } : false;
  }),
  resetGenericPassword: jest.fn(async (options: { service: string }) => {
    mockSecrets.delete(options.service);
    return true;
  }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockIndex.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockIndex.set(key, value); }),
}));

import { deleteToolApiKey, getToolApiKey, listToolApiKeyHosts, saveToolApiKey } from '../toolApiKeys';

it('stores a provider key in Keychain and only its host in the listable index', async () => {
  mockSecrets.clear();
  mockIndex.clear();
  await saveToolApiKey(' Places.GoogleAPIs.com ', '  test-secret  ');
  expect(mockSecrets.get('raidr-agent-tool-api-key:places.googleapis.com')).toBe('test-secret');
  expect([...mockIndex.values()].join('')).not.toContain('test-secret');
  expect(await listToolApiKeyHosts()).toEqual(['places.googleapis.com']);
  expect(await getToolApiKey('places.googleapis.com')).toBe('test-secret');
  await deleteToolApiKey('places.googleapis.com');
  expect(await getToolApiKey('places.googleapis.com')).toBeNull();
  expect(await listToolApiKeyHosts()).toEqual([]);
});
