jest.mock(
  '@react-native-firebase/crashlytics',
  () => ({
    __esModule: true,
    default: jest.fn(() => ({
      log: jest.fn(),
      recordError: jest.fn(),
      setCrashlyticsCollectionEnabled: jest.fn(),
      setUserId: jest.fn(),
      setAttribute: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock(
  '@react-native-firebase/messaging',
  () => ({
    __esModule: true,
    default: jest.fn(() => ({
      getToken: jest.fn(() => Promise.resolve('mock-token')),
      requestPermission: jest.fn(() => Promise.resolve(1)),
      onMessage: jest.fn(() => jest.fn()),
      onNotificationOpenedApp: jest.fn(() => jest.fn()),
      getInitialNotification: jest.fn(() => Promise.resolve(null)),
    })),
  }),
  { virtual: true }
);

jest.mock(
  '@react-native-firebase/perf',
  () => ({
    __esModule: true,
    default: jest.fn(() => ({
      setPerformanceCollectionEnabled: jest.fn(),
      newTrace: jest.fn(() => ({
        start: jest.fn(() => Promise.resolve()),
        stop: jest.fn(() => Promise.resolve()),
        putAttribute: jest.fn(),
        putMetric: jest.fn(),
      })),
      newHttpMetric: jest.fn(() => ({
        start: jest.fn(() => Promise.resolve()),
        stop: jest.fn(() => Promise.resolve()),
        setHttpResponseCode: jest.fn(),
        setRequestPayloadSize: jest.fn(),
        setResponsePayloadSize: jest.fn(),
      })),
    })),
  }),
  { virtual: true }
);

// Safe-area insets for components outside a SafeAreaProvider (every screen's
// NavBar reads the top inset): the library's own Jest mock.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default
);

// Geolocation (replacing expo-location); no suite uses the device location,
// but mock it so resolving the native module never touches the real bridge.
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
    requestAuthorization: jest.fn(),
    setRNConfiguration: jest.fn(),
  },
}));
