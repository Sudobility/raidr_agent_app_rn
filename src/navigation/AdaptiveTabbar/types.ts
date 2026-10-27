/**
 * AdaptiveTabbar - shared config types.
 *
 * One tab list drives every platform. AdaptiveTabbar picks the right chrome
 * per OS (see index.ts): a native Liquid Glass UITabBar on iOS (sidebar on
 * iPad), a native Material tab bar on Android, and a JS sidebar on macOS /
 * Windows. Each platform reads the icon field it needs:
 *   - iOS / iPadOS .... `sfSymbol`
 *   - Android ......... `image` (PNG)
 *   - macOS / Windows . `renderIcon` (a React/vector icon)
 */

import type { ComponentType, ReactNode } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import type {
  LinkingOptions,
  ParamListBase,
  Theme,
} from '@react-navigation/native';

export interface AdaptiveTab {
  /** Stable route name / key. */
  name: string;
  /** Screen component rendered for this tab. */
  component: ComponentType<Record<string, never>>;
  /** Visible, already-localized label. */
  label: string;
  /** iOS / iPadOS native tab icon (SF Symbol). */
  sfSymbol: SFSymbol;
  /** Android native tab icon (PNG asset via `require`). */
  image: ImageSourcePropType;
  /** macOS / Windows sidebar icon; gets the resolved tint and focus state. */
  renderIcon: (props: {
    focused: boolean;
    color: string;
    size: number;
  }) => ReactNode;
}

export interface AdaptiveTabbarProps<ParamList extends object = ParamListBase> {
  /** Tab definitions, in display order. */
  tabs: AdaptiveTab[];
  /** React Navigation theme; also the container's theme. */
  theme: Theme;
  /** Layout direction; doubles as the NavigationContainer remount key. */
  direction: 'ltr' | 'rtl';
  /** Deep-linking config (same shape NavigationContainer expects). */
  linking: LinkingOptions<ParamList>;
  /** Active tab/icon tint. */
  activeTintColor: string;
  /** Inactive tab/icon tint. */
  inactiveTintColor: string;
}
