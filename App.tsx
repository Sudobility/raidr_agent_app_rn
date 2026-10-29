// Configure the Firebase China proxy before anything initializes Firebase.
// Blank/unset means standard Firebase (the library holds no default).
// NOTE: covers the Firebase JS SDK — which is now auth on every platform —
// but not the @react-native-firebase native modules (analytics, crashlytics,
// messaging), which still reach Google directly.
import { setFirebaseProxy } from '@sudobility/di';
import { env } from '@/config/env';
setFirebaseProxy(env.FIREBASE_PROXY || null);

import '@/polyfills/localStorage'; // Must be first — before any Zustand store import
import './global.css'; // NativeWind: Tailwind directives for className styling
import '@/config/designTheme'; // Activate the design-system theme (before any variants render)
import 'react-native-gesture-handler';
import '@/i18n'; // Initialize i18n
import React, { useState, useEffect } from 'react';
import { NativeModules, StatusBar, StyleSheet, useColorScheme } from 'react-native';
NativeModules.DevLoadingView?.hide();
import { loadStoredLanguagePreference } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ApiProvider } from '@/context/ApiContext';
import { useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@sudobility/building_blocks_rn';
import { PortalHost } from '@sudobility/components-rn';
import { ThemeVarsProvider } from '@/components/ThemeVarsProvider';
import { AppNavigator } from '@/navigation';
import SplashScreen from '@/screens/SplashScreen';
import { initializeAllServices } from '@/di/initializeServices';

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

function AppContent() {
  const { isReady } = useAuth();
  // Replaces expo-status-bar's `style='auto'`: resolve the active theme the
  // same way AppNavigator does and pick the bar content colour to match.
  const systemColorScheme = useColorScheme();
  const { theme: userTheme } = useSettingsStore();
  const isDark =
    userTheme === 'system'
      ? systemColorScheme === 'dark'
      : userTheme === 'dark';

  if (!isReady) {
    return <SplashScreen />;
  }

  return (
    <>
      <AppNavigator />
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    </>
  );
}

export default function App() {
  const [servicesReady, setServicesReady] = useState(false);

  useEffect(() => {
    initializeAllServices()
      .then(() => setServicesReady(true))
      .catch(error => {
        console.error('[App] Failed to initialize services:', error);
        // Still allow app to render even if some services fail
        setServicesReady(true);
      });
    loadStoredLanguagePreference();
  }, []);

  if (!servicesReady) {
    return <SplashScreen />;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeVarsProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <ApiProvider>
                <QueryClientProvider client={queryClient}>
                  {/*
                    Where portal-based overlays draw: on macOS and Windows the
                    shared modals (SignInModal / LoginModal, FormModal) have no
                    native Modal and render here. Without it they are invisible.
                  */}
                  <PortalHost>
                    <AppContent />
                  </PortalHost>
                </QueryClientProvider>
              </ApiProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ThemeVarsProvider>
    </GestureHandlerRootView>
  );
}
