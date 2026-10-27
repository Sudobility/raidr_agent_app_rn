/**
 * SafeAreaContent - a non-scrolling box that keeps its content within the safe
 * area on every requested edge (rules 2 + 3). `edges` defaults to
 * left/right/bottom (a stack header handles the top).
 *
 * useScrollContentStyle - contentContainerStyle for a FlatList/FlashList (or any
 * scroller not using SafeAreaScrollView): the scroll-axis edges get the
 * scrolling insets, the cross-axis edges get the safe area.
 */

import React, { useMemo } from 'react';
import { Platform, View, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets, useScrollingInsets } from './insets';
import { addInsets, type Edges } from './applyInsets';

const DEFAULT_EDGES: Required<Edges> = {
  top: false,
  left: true,
  right: true,
  bottom: true,
};

// Desktop has a side sidebar, no bottom tab bar and no content safe area, so
// the inset treatment is a no-op; pass styles through unchanged.
const isDesktop = Platform.OS === 'macos' || Platform.OS === 'windows';

export interface SafeAreaContentProps extends ViewProps {
  edges?: Edges;
}

export function SafeAreaContent({
  style,
  edges,
  ...rest
}: SafeAreaContentProps) {
  const safe = useSafeAreaInsets();
  const resolved = { ...DEFAULT_EDGES, ...edges };
  return (
    <View style={addInsets(style as ViewStyle, safe, resolved)} {...rest} />
  );
}

/** contentContainerStyle inset for a list scroller (vertical by default). */
export function useScrollContentStyle(
  base?: ViewStyle,
  options?: { horizontal?: boolean; edges?: Edges }
): ViewStyle {
  const safe = useSafeAreaInsets();
  const scrolling = useScrollingInsets();
  const horizontal = options?.horizontal ?? false;
  const edges = options?.edges;
  const top = edges?.top ?? DEFAULT_EDGES.top;
  const left = edges?.left ?? DEFAULT_EDGES.left;
  const right = edges?.right ?? DEFAULT_EDGES.right;
  const bottom = edges?.bottom ?? DEFAULT_EDGES.bottom;
  // Memoized so the style keeps a stable identity across renders when the
  // inset values don't change — react-native-macos's scroll view can blank and
  // re-lay-out its content if contentContainerStyle changes identity each render.
  return useMemo(() => {
    if (isDesktop) return base ?? {};
    const resolved = { top, left, right, bottom };
    const inset = horizontal
      ? {
          left: scrolling.left,
          right: scrolling.right,
          top: safe.top,
          bottom: safe.bottom,
        }
      : {
          top: scrolling.top,
          bottom: scrolling.bottom,
          left: safe.left,
          right: safe.right,
        };
    return addInsets(base, inset, resolved);
  }, [base, safe, scrolling, horizontal, top, left, right, bottom]);
}
