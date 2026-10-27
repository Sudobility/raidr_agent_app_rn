/**
 * AdaptiveTabbar (desktop implementation) - macOS / Windows.
 *
 * Desktop has no native tab bar, so it uses the JS bottom-tab navigator purely
 * as a router shell and draws a vertical TabSidebar on the left. Shared by
 * AdaptiveTabbar.macos.tsx and AdaptiveTabbar.windows.tsx.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';

import { TabSidebar } from './TabSidebar';
import type { AdaptiveTabbarProps } from './types';

const Tab = createBottomTabNavigator();

export function AdaptiveTabbar<ParamList extends object>({
  tabs,
  theme,
  direction,
  linking,
}: AdaptiveTabbarProps<ParamList>) {
  const renderSidebar = (props: BottomTabBarProps) => {
    const activeName = props.state.routeNames[props.state.index];
    return (
      <TabSidebar
        tabs={tabs}
        activeName={activeName}
        onTabPress={name => props.navigation.navigate(name)}
      />
    );
  };

  return (
    <NavigationContainer
      key={direction}
      linking={linking}
      theme={theme}
      direction={direction}
    >
      <Tab.Navigator
        tabBar={renderSidebar}
        screenOptions={{ headerShown: false, tabBarPosition: 'left' }}
      >
        {tabs.map(tab => (
          <Tab.Screen key={tab.name} name={tab.name} component={tab.component} />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
