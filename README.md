# raidr agent

A native agent app. You type what you want done; raidr agent works out the
intent, picks the sites that can do it, signs you in to them through a web view
(your session token stays in the device Keychain / Keystore, never in JS
storage or on a server), prepares a form, runs the sites, and streams the
results back through the Vercel AI SDK. Runs execute in the cloud or, with your
own LLM keys, locally on the device.

Runs on **iOS, iPadOS, Android (phone and tablet), macOS and Windows** from one
React Native 0.83 codebase — bare React Native (no Expo), with
`react-native-macos` and `react-native-windows` for the desktops.

## Getting started

Requires [Bun](https://bun.sh), Node 20+, Xcode + CocoaPods (iOS/macOS),
Android Studio (Android), Visual Studio 2022 (Windows).

The `@sudobility/*` dependencies come from **GitHub Packages**
(`.npmrc` maps the scope to `npm.pkg.github.com`). Before `bun install` you need
a GitHub token with `read:packages` available to the registry — set
`//npm.pkg.github.com/:_authToken=<token>` in your `~/.npmrc` (or export it the
way your shell/CI does). Without it, installing the private scope fails.

```bash
bun install
cp .env.example .env          # fill in the values you need
cd ios && pod install && cd ..   # also macos/ for the Mac app
bun run ios                   # or: android | macos | windows
```

Metro runs on **port 8094** (`bun run start`).

## Scripts

| Script | What it does |
| --- | --- |
| `bun run start` | Metro bundler on :8094 |
| `bun run ios` / `android` / `macos` / `windows` | Build and run on that platform |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run test:unit` | Jest (`--passWithNoTests`) — what CI runs |
| `bun run verify` | typecheck + lint + tests |
| `bun run localize` | Machine-translate `assets/locales` |
| `bun run store` | App-store build/screenshot/submit wrappers |

Every `start` / `ios` / `android` / `macos` / `windows` script has a `pre*` hook
that regenerates theme CSS (`scripts/generate-theme-css.js`) and clears the
Metro cache. After adding a native dependency, re-run `pod install` in `ios/`
(and `macos/`).

There is no `build` script; CI
(`.github/workflows/ci-cd.yml` → `johnqh/workflows` unified CI/CD) runs
`bun install`, `typecheck`, `lint` and `test:unit`, and skips npm publishing.

## Configuration

Firebase / Google sign-in need real values before sign-in works:

- `ios/RaidrAgent/GoogleService-Info.plist` and `android/app/google-services.json`
  are the real Firebase configs (project `raidr-agent`) for
  `com.sudobility.raidr.agent`; the Google URL scheme in both `Info.plist`s is
  that plist's `REVERSED_CLIENT_ID`.
- `.env` (copy `.env.example`) holds the desktop Firebase web-app values,
  desktop Google OAuth clients, `VITE_API_URL` (backend, default
  `http://localhost:8038`) and the Signic agent-email endpoints. `.env.example`
  documents each one and which platforms read it. Every name must also be in
  `babel.config.js` `INLINED_ENV` to reach the bundle.
- `app_store/.env` and `app_store/.keys/` — store API credentials (gitignored).

## Project layout

```
index.ts                  # entry: AI SDK polyfills first, then AppRegistry
App.tsx                   # provider stack + splash gates
src/
  components/             # shared UI + layout/ (Screen, NavBar, SplitView, TileGrid)
  config/                 # constants, env (the only process.env reader), theme
  context/                # AuthContext (app account), ApiContext
  di/                     # initializeServices{,.ios,.android}.ts
  hooks/                  # useSignInForm, useSiteBadges, usePermissionGate, ...
  lib/                    # agent flow logic, site/credential/keychain stores
  navigation/             # AppNavigator, DesktopSidebar, Ask/History/Settings stacks
  polyfills/              # localStorage.ts, aiSdk.ts
  screens/                # Ask, Sites, Prepare, Results, Settings, Login web view, ...
  stores/                 # zustand stores (settings, run flow, credentials)
app_store/                # store metadata + build/screenshot/submit wrappers
ios/ android/ macos/ windows/   # native projects (component name RaidrAgent)
```

The agent flow is implemented: **Ask** (Ask → Sites → Prepare → Login web view
→ Results → Result detail), **History**, and **Settings** (Account, Appearance,
Credentials, Passwords, Agent Email, API Keys). Platform suffixes: the
unsuffixed `.ts` is the desktop implementation; `.ios.ts` / `.android.ts` are
the mobile variants (no `.macos.*` / `.windows.*` files).

See `CLAUDE.md` for architecture notes and gotchas.

## Related

- `@sudobility/raidr_agent_types`, `raidr_agent_client`, `raidr_agent_lib` — shared packages
- `raidr_agent_api` — backend

## License

BUSL-1.1
