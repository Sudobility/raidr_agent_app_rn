# raidr agent (raidr_agent_app_rn)

> **Git policy — never auto-commit or auto-push.** Leave work in the working
> tree. Run git commit, git push, gh pr create or a release script only when the
> user explicitly asks in that turn.

Native agent app. The user types a request; the app turns it into an intent,
picks sites that can fulfil it, signs the user in to those sites through a web
view (the session token stays in the Keychain / Keystore, never in JS storage
or on a server), prepares a form, runs the sites and streams results back
through the Vercel AI SDK. Runs go to the cloud (`POST /runs`) or, with the
user's own LLM keys, run locally on the device.

Platforms: **iOS, iPadOS, Android (phone + tablet), macOS, Windows**.
Private package. Display name **raidr agent**, component/registry name
**`RaidrAgent`**, bundle/application ID **`com.sudobility.raidr.agent`** everywhere.

## Tech stack

- **Bare React Native 0.83 — Expo has been removed** (not Expo-managed, no
  Expo Router, no `expo` dependency). `react-native-macos` / `-windows` 0.83
  for the desktops.
- React Navigation 7 (bottom tabs on phone/tablet; custom sidebar on desktop)
- Zustand 5, TanStack Query 5, NativeWind 4 + Tailwind 3, i18next
- Auth: `@sudobility/auth_lib` (Firebase JS SDK on every platform; Google
  Sign-In via `auth_lib/signin`). No Apple sign-in (`APPLE_SIGN_IN_OFFERED` false).
- Agent feature: `react-native-webview`, `@react-native-cookies/cookies`,
  `react-native-keychain`, `ai` 7, `@ai-sdk/react` 4, `zod` 4, `viem`, `@scure/bip39`
- Jest (**not** Vitest).
- **Bun only.** Never npm/yarn/pnpm. `@sudobility/*` installs from GitHub
  Packages (`.npmrc`) and needs a `read:packages` token in `~/.npmrc`.

## Commands

```bash
bun install
bun run start          # Metro on port 8094
bun run ios            # run-ios     (scheme RaidrAgent)
bun run android        # run-android (com.sudobility.raidr.agent)
bun run macos          # run-macos   (scheme RaidrAgent-macOS)
bun run windows        # run-windows (windows/RaidrAgent.sln)
bun run typecheck      # tsc --noEmit
bun run lint           # eslint .
bun run test:unit      # jest --passWithNoTests   (what CI runs)
bun run verify         # typecheck + lint + test:unit
cd ios && pod install  # after adding a native dependency (same for macos/)
```

Each `start`/`ios`/`android`/`macos`/`windows` script has a `pre*` hook that
runs `scripts/generate-theme-css.js` and clears the Metro cache. There is **no
`build` script**, so CI (`.github/workflows/ci-cd.yml` →
`johnqh/workflows/.../unified-cicd.yml`, `skip-npm-publish: true`) skips the
build step and never publishes.

## Native project names

| Platform | Location | Names |
| --- | --- | --- |
| iOS | `ios/RaidrAgent.xcworkspace` | scheme + target `RaidrAgent` |
| macOS | `macos/RaidrAgent.xcworkspace` | target + scheme `RaidrAgent-macOS` |
| Android | `android/app` | `applicationId` `com.sudobility.raidr.agent`, Kotlin in `java/com/sudobility/raidr/agent/` |
| Windows | `windows/RaidrAgent.sln` | `RaidrAgent.vcxproj`, identity `com.sudobility.raidr.agent` |

The JS component registers as `RaidrAgent` (`app.json` `name`); each native host
(`SceneDelegate.swift`, macOS `AppDelegate.mm`, `MainActivity.kt`,
`RaidrAgent.cpp`) asks for that name. Rename all together.

## Architecture

- **Entry order matters.** `index.ts` imports `./src/polyfills/aiSdk` **first**
  (before anything imports `ai`), then registers the app. `App.tsx` imports
  `@/polyfills/localStorage` **first** (before any zustand store).
- **Agent flow** (`src/navigation/AskStack.tsx`): Ask → (Permission) → Sites →
  Prepare → Login web view → Results → Result sources / Result detail. Transient
  state in `src/stores/runFlowStore.ts`. `src/lib/agentFlow.ts` picks cloud vs
  local per call and is the only place the cloud path calls `RaidrAgentClient`.
  Per-step pure rules live in `src/lib/{sites,prepare,results,webAuth}.ts`.
- **Local agent mode** (`src/lib/localAgent.ts`): runs the `raidr_agent_lib`
  runner on-device using the user's own OpenAI/Anthropic/DeepSeek/OpenRouter
  keys (Settings → API Keys). The user's LLM key and site tokens stay on-device;
  step inputs still pass through `raidr_agent_api` + ShapeShyft. Parse provider
  replies with `parseProviderResponse` from
  `@sudobility/shapeshyft_engine/core` — never the engine root.
- **Secrets** live only in the Keychain/Keystore, never JS storage or a server:
  site session tokens (`siteSessions.ts`), LLM keys (`llmKeys.ts`), the agent
  email BIP-39 seed (`agentWalletStore.ts`), per-site passwords
  (`agentCredentialStore.ts`). The Keychain can't enumerate, so AsyncStorage
  "index" stores hold listable directories (no secrets) in parallel.
- **Navigation/layout:** iOS-style everywhere; each step is its own native-stack
  screen. Native headers off (`headerShown: false` — they don't render on
  macOS/Windows); every screen renders `Screen`
  (`src/components/layout/Screen.tsx`) with its own `NavBar`. `SplitView` gives
  master/detail at ≥ 700pt. `TileGrid` lays out list content (1 col < 700pt,
  else 2–4). A tile's root uses `grow`, never `flex-1` (basis 0 collapses it).
- **App sign-in** uses the shared `LoginView`/`LoginModal`/`LoginPage` from
  `@sudobility/components-rn` / `building_blocks_rn` via `useSignInForm()`,
  never a hand-built form. A screen whose job is signing in → `SignInPage`;
  sign-in mid-flow → `SignInModal`. `src/screens/LoginScreen.tsx` is **not**
  this — it is the agent's third-party *site* sign-in web view.

## AI SDK on React Native (no Expo)

`src/polyfills/aiSdk.ts` installs, only where missing: streams
(`web-streams-polyfill`), `TextDecoder` (`text-encoding`),
`TextEncoderStream`/`TextDecoderStream` (`@stardazed/streams-text-encoding`),
`structuredClone` (`@ungap/structured-clone`), `Symbol.asyncIterator`. Hermes
already has `TextEncoder`. These used to come from Expo's "winter" runtime;
Expo removal replaced them with the plain-JS packages above.

**Streaming fetch** (`src/lib/runTransport.ts`): RN's built-in `fetch` can't
expose a streaming response body, so iOS/Android POST with
`react-native-fetch-api`'s streaming `fetch` (replaced `expo/fetch`) and read
the SSE `data-*` chunks incrementally. macOS/Windows keep the built-in buffering
`fetch` and parse the completed stream.

**Locked version trio:** `react` 19.3.1, `react-native` 0.83.10 and
`react-native-macos` 0.83.0 (with `react-test-renderer` 19.3.1) must move
together — each renderer asserts one exact React version at load ("Incompatible
React versions" hangs macOS at "Loading… 100%" otherwise). Check
`Libraries/Renderer/implementations/*-dev.js` in both RN and RN-macos.

## Conventions

- All `process.env` reads go through `src/config/env.ts` and must be listed in
  `babel.config.js` `INLINED_ENV` (the allow-list of what reaches the bundle).
- Platform suffixes: unsuffixed `.ts` = **desktop**; `.ios.ts`/`.android.ts` =
  mobile. No `.macos.*`/`.windows.*` files.
- Prose goes in `assets/locales/en/translation.json` (only `en` registered).
- babel `module-resolver` aliases are first-match: specific aliases before `@`.
- `babel.config.js` keeps `@babel/plugin-transform-export-namespace-from`
  because zod 4 (via the runner) uses `export * as`.
- Honour the safe area on **every** screen via `useSafeAreaInsets()` — never a
  magic padding number. **Tab-bar trap:** inside a tab navigator `insets.bottom`
  already includes the tab-bar height, so pad a pinned bottom bar by
  `insets.bottom` and nothing more (don't add tab-bar height, don't reserve it
  on the root). Non-scroll screens pad top+bottom by the insets; scroll views go
  full-bleed with scroll insets equal to the safe area.

## Gotchas

- Metro port is **8094**.
- NativeWind's JSX transform is Metro-only; JSX behaves differently under Jest.
- `jest.config.js` maps only `^@/(.*)$`; `@sudobility/signic_sdk` is mapped to
  its `dist` entry (its `exports` has no CJS condition); tests mock it.
- `react-native.config.js` disables native Firebase and Google Sign-In on macOS;
  desktop auth is the Firebase JS SDK + WebAuth PKCE.
- **`react-native-svg` must be ≥ 15.15.5** — older versions draw nothing on
  macOS under Fabric. Three deps are patched (`patches/`): `react-native-svg`,
  `react-native-bottom-tabs`, `react-native-macos`.
- The `localize` script still posts to the template's Whisperly endpoint until a
  raidr agent endpoint exists.
- `i18n` is initialised in both `index.ts` and `App.tsx` (harmless, inherited).

## Sibling packages & origin

`@sudobility/raidr_agent_{types,client,lib}` and `raidr_types` are deps (repos
in `~/projects/raidr_agent_{types,client,lib}`); releases go through
`~/projects/raidr_app/scripts/push_all.sh` in dependency order. Backend is
`raidr_agent_api` (port 8038, the `VITE_API_URL` default). Scaffolded from
`mogulgame_app_rn`; `app_store/` came from `sudojo_app_rn`.
