/**
 * Safe-area insets and the derived scrolling insets.
 *
 * Two concepts, applied by axis (see SafeAreaScrollView / SafeAreaContent):
 *   - safe-area insets  → how far NON-scrollable content stays from an edge.
 *   - scrolling insets   → how far a SCROLLER insets its content from an edge it
 *                          renders all the way to.
 *
 * `scrollingInsets` is derived, read-only, and currently equal to the safe-area
 * insets. It is a separate concept on purpose: scroll clearance may need to
 * diverge from static padding per-OS / per-OS-version later, and callers already
 * ask for the right one, so that change won't touch every screen.
 *
 * The values come straight from the native safe area — read from the context
 * fed by a per-scene SafeAreaProvider (see AdaptiveTabbar), so the bottom tab
 * bar, side sidebar, notch and home indicator are all already accounted for by
 * the OS. Nothing here computes insets from a bar's dimensions.
 */

import { useContext, useMemo } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

export interface Insets {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

const ZERO: Insets = { top: 0, left: 0, right: 0, bottom: 0 };

/** Native safe-area insets for the current screen. */
export function useSafeAreaInsets(): Insets {
  const insets = useContext(SafeAreaInsetsContext) ?? ZERO;
  return useMemo(
    () => ({
      top: insets.top,
      left: insets.left,
      right: insets.right,
      bottom: insets.bottom,
    }),
    [insets.top, insets.left, insets.right, insets.bottom]
  );
}

/** Scrolling insets — derived, read-only. Equal to the safe area today. */
export function useScrollingInsets(): Insets {
  return useSafeAreaInsets();
}
