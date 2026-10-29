/**
 * Web-platform globals the Vercel AI SDK (`ai`, `@ai-sdk/react`) needs on
 * React Native.
 *
 * Hermes ships `TextEncoder` but not the rest of what the SDK's streaming code
 * touches: `ReadableStream` / `TransformStream` / `WritableStream`,
 * `TextDecoder`, `TextEncoderStream` / `TextDecoderStream`, `structuredClone`,
 * and `Symbol.asyncIterator`. Expo installs these itself (its "winter"
 * runtime) only when the app is bundled through `expo/metro-config` and
 * registered through `expo`; this app uses the bare `@react-native/metro-config`
 * on four platforms, so it installs them here, in the same order Expo does.
 *
 * Sources, all pure JS so they run on iOS, Android, macOS and Windows alike:
 *   - streams:            `web-streams-polyfill` (ponyfill entry, installed below)
 *   - TextDecoder:        `text-encoding`
 *   - TextEncoderStream,
 *     TextDecoderStream:  `@stardazed/streams-text-encoding` (wraps the
 *                         TransformStream + TextDecoder/TextEncoder globals
 *                         above — the same approach Expo's `winter` used, now
 *                         without the `expo` dependency)
 *   - structuredClone:    `@ungap/structured-clone` (what Expo uses too)
 *
 * Each global is installed only when missing, so a runtime that already has
 * one (a future Hermes, the Jest/Node environment) keeps its native version.
 *
 * Streaming fetch is handled separately: React Native's built-in `fetch` does
 * not expose `response.body` as a stream, so iOS/Android use
 * `react-native-fetch-api`'s streaming `fetch` (see `src/lib/runTransport.ts`),
 * which relies on the `ReadableStream`/`TextDecoder` globals installed here.
 * macOS and Windows keep the built-in buffering `fetch`.
 *
 * **Import this from the app entry before anything that imports `ai`.**
 *
 * @module polyfills/aiSdk
 */

import {
  ReadableStream as PolyReadableStream,
  TransformStream as PolyTransformStream,
  WritableStream as PolyWritableStream,
  ByteLengthQueuingStrategy as PolyByteLengthQueuingStrategy,
  CountQueuingStrategy as PolyCountQueuingStrategy,
} from 'web-streams-polyfill';
import structuredCloneImpl from '@ungap/structured-clone';

const g = globalThis as Record<string, unknown>;

/** Define `name` on the global object when it is absent. */
function installIfMissing(name: string, factory: () => unknown): void {
  if (typeof g[name] !== 'undefined') {
    return;
  }
  Object.defineProperty(globalThis, name, {
    value: factory(),
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// Streams first: Expo's TextDecoderStream extends TransformStream when loaded.
installIfMissing('ReadableStream', () => PolyReadableStream);
installIfMissing('TransformStream', () => PolyTransformStream);
installIfMissing('WritableStream', () => PolyWritableStream);
installIfMissing(
  'ByteLengthQueuingStrategy',
  () => PolyByteLengthQueuingStrategy
);
installIfMissing('CountQueuingStrategy', () => PolyCountQueuingStrategy);

// Required lazily (and as untyped `require`) so the class definitions only
// evaluate after the stream globals above exist. TextDecoder must be installed
// before the stream wrappers, which construct one from the global.
installIfMissing('TextDecoder', () => require('text-encoding').TextDecoder);
installIfMissing(
  'TextDecoderStream',
  () => require('@stardazed/streams-text-encoding').TextDecoderStream
);
installIfMissing(
  'TextEncoderStream',
  () => require('@stardazed/streams-text-encoding').TextEncoderStream
);

installIfMissing('structuredClone', () => structuredCloneImpl);

// Hermes has no well-known Symbol.asyncIterator; `for await` over a
// ReadableStream (which the AI SDK does) needs it.
if (typeof Symbol.asyncIterator === 'undefined') {
  (Symbol as unknown as Record<string, symbol>).asyncIterator = Symbol.for(
    'Symbol.asyncIterator'
  );
}

export {};
