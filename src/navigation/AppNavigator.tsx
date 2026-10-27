/**
 * AppNavigator - Root navigation.
 *
 * Builds the shared tab config and hands it to AdaptiveTabbar, which renders the
 * right chrome per OS: a Liquid Glass UITabBar on iOS (compact bottom bar on
 * iPad), a native Material bar on Android, and a JS sidebar on macOS / Windows.
 */

import React, { useEffect } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LinkingOptions } from '@react-navigation/native';
import {
  ChatBubbleLeftRightIcon,
  ClockIcon,
  Cog6ToothIcon,
} from 'react-native-heroicons/outline';
import {
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  ClockIcon as ClockIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
} from 'react-native-heroicons/solid';
import type { SvgProps } from 'react-native-svg';

import {
  lightTheme,
  darkTheme,
  lightAppColors,
  darkAppColors,
} from '@/config/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import type { RootTabParamList } from './types';

import { AskStack } from './AskStack';
import { HistoryStack } from './HistoryStack';
import { SettingsStack } from './SettingsStack';
import { AdaptiveTabbar, type AdaptiveTab } from './AdaptiveTabbar';

// Android native tab icons (iOS uses SF Symbols, desktop uses the heroicons).
const askPng = require('../../assets/tabicons/ask.png') as ImageSourcePropType;
const historyPng =
  require('../../assets/tabicons/history.png') as ImageSourcePropType;
const settingsPng =
  require('../../assets/tabicons/settings.png') as ImageSourcePropType;

type HeroIcon = React.ComponentType<SvgProps & { size?: number }>;

// Desktop sidebar icon: outline when idle, solid when focused.
const sidebarIcon =
  (Outline: HeroIcon, Solid: HeroIcon) =>
  ({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: string;
    size: number;
  }) =>
    focused ? (
      <Solid color={color} size={size} />
    ) : (
      <Outline color={color} size={size} />
    );

const linking: LinkingOptions<RootTabParamList> = {
  prefixes: ['com.sudobility.raidr.agent://'],
  config: {
    screens: {
      AskTab: 'ask',
      HistoryTab: 'history',
      SettingsTab: 'settings',
    },
  },
};

export function AppNavigator() {
  const { t } = useTranslation();
  const systemColorScheme = useColorScheme();
  const { theme: userTheme } = useSettingsStore();
  const isDark =
    userTheme === 'system'
      ? systemColorScheme === 'dark'
      : userTheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const appColors = isDark ? darkAppColors : lightAppColors;

  // Keep NativeWind's color scheme (used by @sudobility/components-rn's `dark:`
  // classes) in lockstep with the app's resolved theme, so library components
  // match the navigation chrome even when the user overrides the system setting.
  useEffect(() => {
    nativewindColorScheme.set(isDark ? 'dark' : 'light');
  }, [isDark]);

  const tabs: AdaptiveTab[] = React.useMemo(
    () => [
      {
        name: 'AskTab',
        component: AskStack,
        label: t('ask.title'),
        sfSymbol: 'bubble.left.and.bubble.right',
        image: askPng,
        renderIcon: sidebarIcon(
          ChatBubbleLeftRightIcon,
          ChatBubbleLeftRightIconSolid
        ),
      },
      {
        name: 'HistoryTab',
        component: HistoryStack,
        label: t('history.title'),
        sfSymbol: 'clock',
        image: historyPng,
        renderIcon: sidebarIcon(ClockIcon, ClockIconSolid),
      },
      {
        name: 'SettingsTab',
        component: SettingsStack,
        label: t('settings.title'),
        sfSymbol: 'gearshape',
        image: settingsPng,
        renderIcon: sidebarIcon(Cog6ToothIcon, Cog6ToothIconSolid),
      },
    ],
    [t]
  );

  return (
    <AdaptiveTabbar
      tabs={tabs}
      theme={theme}
      direction='ltr'
      linking={linking}
      activeTintColor={theme.colors.primary}
      inactiveTintColor={appColors.textMuted}
    />
  );
}
