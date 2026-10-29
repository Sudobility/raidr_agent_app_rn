/**
 * `react-native-fetch-api` (react-native-community/fetch) ships no types. It is
 * a drop-in `fetch` whose `Response.body` is a real `ReadableStream`, fed by
 * React Native's native networking progress events — the streaming `fetch` that
 * replaced `expo/fetch` when Expo was removed. Streaming is text-only (SSE here
 * is text), enabled by the non-standard `reactNative: { textStreaming: true }`
 * request option.
 */
declare module 'react-native-fetch-api' {
  export const fetch: typeof globalThis.fetch;
  export const Headers: typeof globalThis.Headers;
  export const Request: typeof globalThis.Request;
  export const Response: typeof globalThis.Response;
}
