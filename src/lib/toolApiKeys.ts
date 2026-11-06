/** User-supplied API keys for MCP tools. Secret values live in Keychain only. */
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INDEX = 'raidr-agent-tool-api-key-hosts';
const memory = new Map<string, string>();
const memoryHosts = new Set<string>();

export function normalizeApiHost(input: string): string | null {
  const host = input.trim().toLowerCase();
  return /^(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::\d{1,5})?$/.test(host)
    ? host : null;
}

function service(host: string): string { return `raidr-agent-tool-api-key:${host}`; }

export async function listToolApiKeyHosts(): Promise<string[]> {
  try {
    const value: unknown = JSON.parse((await AsyncStorage.getItem(INDEX)) ?? '[]');
    const persisted = Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string' && normalizeApiHost(v) === v)
      : [];
    return [...new Set([...persisted, ...memoryHosts])].sort();
  } catch { return [...memoryHosts].sort(); }
}

async function updateIndex(host: string, add: boolean): Promise<void> {
  const hosts = await listToolApiKeyHosts();
  const next = add ? [...new Set([...hosts, host])].sort() : hosts.filter(h => h !== host);
  if (add) memoryHosts.add(host); else memoryHosts.delete(host);
  try { await AsyncStorage.setItem(INDEX, JSON.stringify(next)); }
  catch { /* Host list remains available in memory for this session. */ }
}

export async function saveToolApiKey(apiHost: string, key: string): Promise<void> {
  const host = normalizeApiHost(apiHost);
  if (!host || !key.trim()) throw new Error('Enter a valid API host and key');
  const value = key.trim();
  try { await Keychain.setGenericPassword('api-key', value, { service: service(host) }); }
  catch { /* In-memory fallback for environments without Keychain. */ }
  memory.set(host, value);
  await updateIndex(host, true);
}

export async function getToolApiKey(apiHost: string): Promise<string | null> {
  const host = normalizeApiHost(apiHost);
  if (!host) return null;
  try {
    const value = await Keychain.getGenericPassword({ service: service(host) });
    if (value && value.password) return value.password;
  } catch { /* In-memory fallback. */ }
  return memory.get(host) ?? null;
}

export async function deleteToolApiKey(apiHost: string): Promise<void> {
  const host = normalizeApiHost(apiHost);
  if (!host) return;
  memory.delete(host);
  try { await Keychain.resetGenericPassword({ service: service(host) }); }
  catch { /* No persisted key on this platform. */ }
  await updateIndex(host, false);
}
