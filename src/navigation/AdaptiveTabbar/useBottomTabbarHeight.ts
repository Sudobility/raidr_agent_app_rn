/**
 * useBottomTabbarHeight (iOS / Android).
 *
 * Height of the native bottom tab bar, or 0 when there is none — e.g. the iPad
 * sidebar, where the glass bar is on the side, not the bottom. Reads the context
 * directly and defaults to 0, so it never throws the way the library's own
 * useBottomTabBarHeight() does when no bottom bar is mounted.
 *
 * macOS / Windows get the 0 stub (.macos.ts / .windows.ts), so this file — and
 * react-native-bottom-tabs' native module — never enters the desktop bundle.
 */

import { useContext } from 'react';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';

export function useBottomTabbarHeight(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
