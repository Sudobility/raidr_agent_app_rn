const fs = require('fs');
const path = require('path');

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
  const libraryConfig = path.join(
    __dirname,
    'node_modules',
    packageName,
    'react-native.config.js'
  );
  const library = fs.existsSync(libraryConfig) ? require(libraryConfig) : {};
  const platforms = { ...(library.dependency?.platforms ?? {}) };
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
