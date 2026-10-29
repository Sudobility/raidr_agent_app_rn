const fs = require('fs');
const path = require('path');

/**
 * When the app's react-native.config.js supplies a library's `platforms.android`
 * (to also switch the library off on desktop), the CLI takes the android block
 * verbatim. A library's own `cmakeListsPath` / `cxxModuleCMakeListsPath` are
 * RELATIVE to its `android/` source dir, and the CLI absolutizes them only when
 * it owns the whole android block. On **RN 0.83** a path supplied here is NOT
 * re-joined, so a relative one lands in Android-autolinking.cmake as a relative
 * `add_subdirectory(...)` and CMake fails with "not an existing directory"
 * (react-native-firebase ships a relative path). So pre-resolve those paths to
 * absolute, matching what the CLI produces for libraries it auto-detects. NOTE:
 * this is the opposite of what RN 0.81's CLI needed — the behaviour flipped
 * between 0.81 and 0.83.
 */
function resolveAndroidCmakePaths(packageDir, platforms) {
  const android = platforms.android;
  if (!android) return platforms;
  const androidDir = path.join(packageDir, 'android');
  const resolved = { ...android };
  for (const key of ['cmakeListsPath', 'cxxModuleCMakeListsPath']) {
    if (android[key] && !path.isAbsolute(android[key])) {
      resolved[key] = path.join(androidDir, android[key]);
    }
  }
  return { ...platforms, android: resolved };
}

/**
 * Disable a native Firebase package on the given desktop platforms (native
 * Firebase — analytics, crashlytics, messaging — is mobile
 * only; auth is the Firebase JS SDK everywhere) while keeping the package's
 * own iOS and Android settings.
 *
 * Autolinking merges this file over the library's config shallowly: a bare
 * `platforms: { macos: null }` REPLACES the library's `platforms`, which drops
 * settings the library declares for Android. Since react-native-firebase 26
 * that includes `cmakeListsPath`, the location of its pre-generated TurboModule
 * code, and without it the Android build fails in CMake with "not an existing
 * directory".
 */
function nativeFirebaseWithout(packageName, disabledPlatforms) {
  // Loaded by file path: the package's `exports` map does not expose this file.
  const packageDir = path.join(__dirname, 'node_modules', packageName);
  const libraryConfig = path.join(packageDir, 'react-native.config.js');
  const library = fs.existsSync(libraryConfig) ? require(libraryConfig) : {};
  const platforms = resolveAndroidCmakePaths(packageDir, {
    ...(library.dependency?.platforms ?? {}),
  });
  for (const platform of disabledPlatforms) {
    platforms[platform] = null;
  }
  return { platforms };
}

const config = {
  dependencies: {
    // Disable native Firebase packages on macOS — there is no native Firebase
    // on desktop, and auth is the Firebase JS SDK on every platform
    '@react-native-firebase/app': nativeFirebaseWithout('@react-native-firebase/app', ['macos']),
    '@react-native-firebase/analytics': nativeFirebaseWithout('@react-native-firebase/analytics', ['macos']),
    '@react-native-firebase/crashlytics': nativeFirebaseWithout('@react-native-firebase/crashlytics', ['macos']),
    '@react-native-firebase/messaging': nativeFirebaseWithout('@react-native-firebase/messaging', ['macos']),
    '@react-native-firebase/perf': nativeFirebaseWithout('@react-native-firebase/perf', ['macos']),
    // Google Sign-In native module doesn't support macOS — desktop uses WebAuth PKCE flow
    '@react-native-google-signin/google-signin': {
      platforms: { macos: null },
    },
    // Geolocation (replacing expo-location) is iOS/Android only; macOS and
    // Windows read location through the native DeviceLocationModule bridge
    // (see src/lib/deviceLocation.macos.ts / .windows.ts).
    '@react-native-community/geolocation': {
      platforms: { macos: null, windows: null },
    },
    // Native tab bar (Liquid Glass) is iOS/Android only; desktop uses the JS
    // bottom-tab shell with TabSidebar.
    'react-native-bottom-tabs': {
      platforms: { macos: null, windows: null },
    },
  },
  project: {
    macos: {
      sourceDir: 'macos',
    },
  },
};

/*
  A macOS build: every package switched off for macOS is switched off for iOS
  too, because a macOS build reads the iOS settings.

  react-native-macos autolinks pods from each package's `platforms.ios`, and
  codegen skips a library only when its config for the platform it generates,
  `ios`, is `null`. So `macos: null` alone reaches neither: the Podfile filters
  the pods, but codegen still listed react-native-firebase's TurboModules in
  `RCTModuleProviders` with no class behind them — a red "Module provider
  RNFBAnalyticsModule cannot be found in the runtime" on a Debug launch.

  `RN_MACOS_BUILD=1` is set by `macos/Podfile` (for `pod install`) and
  `macos/.xcode.env` (for the codegen build phase, which re-runs on builds).
  iOS and Android builds never set it, and keep `ios` untouched. The same as
  music_app_rn's.
*/
if (process.env.RN_MACOS_BUILD === '1') {
  for (const dependency of Object.values(config.dependencies)) {
    if (dependency.platforms && dependency.platforms.macos === null) {
      dependency.platforms = { ...dependency.platforms, ios: null };
    }
  }
}

module.exports = config;
