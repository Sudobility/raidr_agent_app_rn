/**
 * Starting and reading an agent run.
 *
 * The run is a Vercel-AI-SDK UI message stream served from `POST /runs`
 * ({@link RaidrAgentClient.runsUrl}). React Native's built-in `fetch` cannot
 * expose a streaming response body, so we POST with Expo's streaming `fetch`
 * (`expo/fetch`) and read the Server-Sent-Events stream ourselves, turning each
 * `data-*` chunk into a typed {@link RunStreamPart} for the screen.
 *
 * ## Why a plain reader instead of `DefaultChatTransport` / `useChat`
 *
 * `DefaultChatTransport` + `useChat` are built around an assistant *message*
 * whose `parts` you re-render. This run carries only custom data parts
 * (`data-run`, `data-site-status`, `data-call`, `data-result`, `data-best`,
 * `data-groups`) and no assistant
 * text, and the screen wants them as growing lists keyed by id — not as one
 * message to diff. Reading the stream directly is both simpler and fully typed
 * here: there is no `prepareSendMessagesRequest` generic to satisfy and no
 * message assembly to undo. The chunk shape we parse is exactly the AI SDK UI
 * message stream (`{ type: 'data-<key>', id?, data }`), so the server contract
 * is unchanged.
 *
 * React Native's built-in `fetch` buffers the response body (it exposes no
 * streaming `response.body`), so on iOS and Android we POST with
 * `react-native-fetch-api`'s streaming `fetch` — its `Response.body` is a real
 * `ReadableStream` fed by RN's native networking progress events — and read
 * each SSE `data-*` chunk as it arrives. That is the incremental, part-by-part
 * rendering `expo/fetch` provided before Expo was removed. macOS and Windows
 * keep the built-in `fetch`, which buffers, so there the same UI-message stream
 * is parsed after the run completes. The reader below handles both, branching
 * on `response.body?.getReader`.
 */

import { Platform } from 'react-native';
// Streaming `fetch` whose `Response.body` is a ReadableStream (text streaming),
// backed by RN's native networking. The ReadableStream/TextDecoder globals it
// needs are installed by `src/polyfills/aiSdk.ts` at app entry.
import { fetch as streamingFetch } from 'react-native-fetch-api';

import type {
  RaidrAgentClient,
  TokenGetter,
} from '@sudobility/raidr_agent_client';
import type {
  BestData,
  CallData,
  GroupsData,
  ResultItem,
  RunData,
  RunRequest,
  SiteStatusData,
} from '@sudobility/raidr_agent_types';

/** One decoded data part of the run stream, discriminated by `type`. */
export type RunStreamPart =
  | { type: 'run'; data: RunData }
  | { type: 'site-status'; data: SiteStatusData }
  | { type: 'call'; data: CallData }
  | { type: 'result'; data: ResultItem }
  | { type: 'best'; data: BestData }
  | { type: 'groups'; data: GroupsData };

/** Callbacks the run reader invokes as the stream progresses. */
export interface RunCallbacks {
  /** A typed data part arrived. */
  onPart: (part: RunStreamPart) => void;
  /** The stream errored, the request failed, or the server returned non-2xx. */
  onError?: (error: Error) => void;
  /** The stream ended (whether or not any parts arrived). */
  onFinish?: () => void;
}

/** A started run; `abort()` cancels the request and stops the reader. */
export interface RunHandle {
  abort: () => void;
}

/** `RequestInit` plus react-native-fetch-api's non-standard streaming flag. */
type StreamingRequestInit = RequestInit & {
  reactNative?: { textStreaming?: boolean };
};

/** The raw shape of a UI-message-stream chunk we care about. */
interface RawChunk {
  type?: string;
  id?: string;
  data?: unknown;
  errorText?: string;
}

/** Map a raw `data-*` chunk to a typed {@link RunStreamPart}, or `null`. */
function toRunPart(chunk: RawChunk): RunStreamPart | null {
  switch (chunk.type) {
    case 'data-run':
      return { type: 'run', data: chunk.data as RunData };
    case 'data-site-status':
      return { type: 'site-status', data: chunk.data as SiteStatusData };
    case 'data-call':
      return { type: 'call', data: chunk.data as CallData };
    case 'data-result':
      return { type: 'result', data: chunk.data as ResultItem };
    case 'data-best':
      return { type: 'best', data: chunk.data as BestData };
    case 'data-groups':
      return { type: 'groups', data: chunk.data as GroupsData };
    default:
      return null;
  }
}

/**
 * POST the run and stream its parts. Returns a handle for cancellation; the
 * actual network work runs in the background and reports through `callbacks`.
 */
export function startRun(
  client: RaidrAgentClient,
  getToken: TokenGetter,
  runRequest: RunRequest,
  callbacks: RunCallbacks
): RunHandle {
  const controller = new AbortController();

  const run = async (): Promise<void> => {
    try {
      const token = await getToken();
      const url = client.runsUrl();
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const requestBody = JSON.stringify(runRequest);
      // iOS/Android stream the body incrementally; macOS/Windows fall back to
      // the built-in fetch, which buffers (the reader below handles both).
      const response =
        Platform.OS === 'ios' || Platform.OS === 'android'
          ? await streamingFetch(url, {
              method: 'POST',
              headers,
              body: requestBody,
              signal: controller.signal,
              reactNative: { textStreaming: true },
            } as StreamingRequestInit)
          : await globalThis.fetch(url, {
              method: 'POST',
              headers,
              body: requestBody,
              signal: controller.signal,
            });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          detail || `Run request failed (HTTP ${response.status})`
        );
      }
      const handleLine = (line: string): void => {
        const trimmed = line.trim();
        if (
          !trimmed ||
          trimmed.startsWith(':') ||
          !trimmed.startsWith('data:')
        ) {
          return;
        }
        const payload = trimmed.slice('data:'.length).trim();
        if (!payload || payload === '[DONE]') {
          return;
        }
        let chunk: RawChunk;
        try {
          chunk = JSON.parse(payload) as RawChunk;
        } catch {
          return; // Ignore a malformed/partial line.
        }
        if (chunk.type === 'error') {
          callbacks.onError?.(new Error(chunk.errorText ?? 'Run stream error'));
          return;
        }
        const part = toRunPart(chunk);
        if (part) {
          callbacks.onPart(part);
        }
      };

      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            handleLine(buffer.slice(0, newlineIndex));
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');
          }
        }
        buffer += decoder.decode();
        if (buffer.length > 0) handleLine(buffer);
      } else {
        const body = await response.text();
        for (const line of body.split(/\r?\n/)) {
          handleLine(line);
        }
      }
      callbacks.onFinish?.();
    } catch (error) {
      if (controller.signal.aborted) {
        return; // Cancelled by the caller; not an error to report.
      }
      callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };

  // Fire and forget: `run` reports progress and errors through `callbacks` and
  // never rejects, so there is no promise to await here.
  run();

  return { abort: () => controller.abort() };
}
