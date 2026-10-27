/**
 * useTabBarHeight (iOS / Android).
 *
 * Height of the native bottom tab bar (react-native-bottom-tabs), or 0 when
 * none is mounted — e.g. the iPad sidebar. Reads the context directly and
 * defaults to 0, so it never throws the way @react-navigation/bottom-tabs'
 * useBottomTabBarHeight() does when no bottom bar is present.
 */

import { useContext } from 'react';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';

export function useTabBarHeight(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
