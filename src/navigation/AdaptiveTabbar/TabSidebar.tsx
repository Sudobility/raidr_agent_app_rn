/**
 * TabSidebar - generic vertical sidebar for macOS / Windows.
 *
 * Config-driven (reads AdaptiveTab.renderIcon + label), so it is app-agnostic.
 * Desktop-only: it is imported solely by AdaptiveTabbarDesktop, which the native
 * platforms never bundle.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAppColors } from '@/hooks/useAppColors';
import type { AdaptiveTab } from './types';

const ICON_SIZE = 22;

interface TabSidebarProps {
  tabs: AdaptiveTab[];
  activeName: string;
  onTabPress: (name: string) => void;
}

export function TabSidebar({ tabs, activeName, onTabPress }: TabSidebarProps) {
  const appColors = useAppColors();

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: appColors.card, borderRightColor: appColors.border },
      ]}
    >
      <View style={styles.logoSpacer} />
      {tabs.map(tab => {
        const focused = activeName === tab.name;
        const color = focused ? appColors.primary : appColors.textMuted;
        return (
          <Pressable
            key={tab.name}
            style={styles.tabItem}
            onPress={() => onTabPress(tab.name)}
          >
            {/*
              The highlight is a sibling behind the icon, not the row's own
              background: on Windows an SVG whose parent view has a background
              or a corner radius is not drawn, so the selected tab's icon
              vanished.
            */}
            {focused ? (
              <View
                pointerEvents='none'
                style={[
                  styles.tabHighlight,
                  { backgroundColor: appColors.border },
                ]}
              />
            ) : null}
            {tab.renderIcon({ focused, color, size: ICON_SIZE })}
            <Text
              style={[styles.tabLabel, { color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 80,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    alignItems: 'center',
  },
  logoSpacer: {
    height: 8,
  },
  tabItem: {
    width: 64,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  tabHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
});
