/**
 * AdaptiveTabbar (iOS / Android) - native tab bar.
 *
 * Wraps a real UITabBarController via @bottom-tabs/react-navigation. Built
 * against the iOS 26+ SDK the system renders it with Liquid Glass automatically
 * (translucent, no opaque fill); `sidebarAdaptable` turns it into a native
 * sidebar on iPad. Icons are SF Symbols on iOS and PNGs on Android.
 *
 * macOS / Windows never bundle this file — see AdaptiveTabbar.macos.tsx /
 * .windows.tsx — so react-native-bottom-tabs' native module stays off desktop.
 */

import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';

import type { AdaptiveTab, AdaptiveTabbarProps } from './types';

const Tab = createNativeBottomTabNavigator();

type Scene = AdaptiveTab['component'];
const sceneCache = new WeakMap<Scene, Scene>();

/**
 * Wrap a tab's screen in its own SafeAreaProvider so useSafeAreaInsets reports
 * the SCENE's native safe area — which the tab controller has already adjusted
 * for the bottom bar / sidebar — rather than the window insets. Cached per
 * component so the identity is stable (no remounts).
 */
function withSceneSafeArea(Component: Scene): Scene {
  const cached = sceneCache.get(Component);
  if (cached) return cached;
  const Wrapped: Scene = props => (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <Component {...props} />
    </SafeAreaProvider>
  );
  sceneCache.set(Component, Wrapped);
  return Wrapped;
}

export function AdaptiveTabbar<ParamList extends object>({
  tabs,
  theme,
  direction,
  linking,
  activeTintColor,
  inactiveTintColor,
}: AdaptiveTabbarProps<ParamList>) {
  return (
    <NavigationContainer
      key={direction}
      linking={linking}
      theme={theme}
      direction={direction}
    >
      <Tab.Navigator
        // Liquid Glass: translucent, no opaque background fill.
        translucent
        // Keep the tab bar at the bottom everywhere, including iPad. The
        // sidebar-adaptable style moves it to the top (and a trailing strip in
        // compact-wide, e.g. iPhone Duo), which collides with the nav bar and
        // overlaps content. The app provides its own master-detail split view.
        sidebarAdaptable={false}
        tabBarActiveTintColor={activeTintColor}
        tabBarInactiveTintColor={inactiveTintColor}
      >
        {tabs.map(tab => (
          <Tab.Screen
            key={tab.name}
            name={tab.name}
            component={withSceneSafeArea(tab.component)}
            options={{
              tabBarLabel: tab.label,
              tabBarIcon: () =>
                Platform.OS === 'ios' ? { sfSymbol: tab.sfSymbol } : tab.image,
            }}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
