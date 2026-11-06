/**
 * AdaptiveTabbar (desktop implementation) - macOS / Windows.
 *
 * Desktop has no native tab bar, so it uses the JS bottom-tab navigator purely
 * as a router shell and draws a vertical sidebar on the left. Shared by
 * AdaptiveTabbar.macos.tsx and AdaptiveTabbar.windows.tsx.
 *
 * The sidebar is the family's shared `TabSidebar` from `@sudobility/components-rn`
 * (it draws the column, the icon-over-label items and the selected highlight in
 * the design theme's colours and font). This app's `AdaptiveTab[]` maps onto the
 * component's `TabSidebarItem[]`; the only coercion is the icon colour, which the
 * shared component resolves from the theme (so it can be absent) while this app's
 * `renderIcon` wants a concrete string.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { TabSidebar, type TabSidebarItem } from '@sudobility/components-rn';

import { useAppColors } from '@/hooks/useAppColors';
import type { AdaptiveTabbarProps } from './types';

const Tab = createBottomTabNavigator();

export function AdaptiveTabbar<ParamList extends object>({
  tabs,
  theme,
  direction,
  linking,
}: AdaptiveTabbarProps<ParamList>) {
  const appColors = useAppColors();
  const sidebarTabs: TabSidebarItem[] = tabs.map(tab => ({
    name: tab.name,
    label: tab.label,
    renderIcon: ({ focused, color, size }) =>
      tab.renderIcon({ focused, color: color ?? appColors.textMuted, size }),
  }));

  const renderSidebar = (props: BottomTabBarProps) => {
    const activeName = props.state.routeNames[props.state.index];
    return (
      <TabSidebar
        tabs={sidebarTabs}
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
