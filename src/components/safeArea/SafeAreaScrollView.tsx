/**
 * SafeAreaScrollView - a ScrollView that implements the scroll rules:
 *   - On the scroll axis it renders to both edges and insets its content by the
 *     scrolling insets, so content shows through the translucent tab bar yet
 *     scrolls clear of it.
 *   - On the cross (non-scrolling) axis it stays within the safe area.
 *
 * Vertical by default; pass `horizontal` to swap the axes. `edges` defaults to
 * left/right/bottom (a stack header handles the top; opt in for headerless
 * screens). For FlatList/FlashList, use `useScrollContentStyle` instead.
 */

import React, { useMemo } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets, useScrollingInsets } from './insets';
import { addInsets, type Edges } from './applyInsets';

const DEFAULT_EDGES: Required<Edges> = {
  top: false,
  left: true,
  right: true,
  bottom: true,
};

// The scroll-indicator props are an iOS concern (the iPhone Duo fix); passing
// them to react-native-macos / windows is pointless and risks glitches.
const isIOS = Platform.OS === 'ios';
// Desktop has a side sidebar, no bottom tab bar and no content safe area, so
// the inset treatment is a no-op. Pass the style through unchanged rather than
// re-shaping it — react-native-macos's scroll view blanks when its
// contentContainerStyle is transformed/reshaped.
const isDesktop = Platform.OS === 'macos' || Platform.OS === 'windows';

export interface SafeAreaScrollViewProps extends ScrollViewProps {
  edges?: Edges;
}

export const SafeAreaScrollView = React.forwardRef<
  ScrollView,
  SafeAreaScrollViewProps
>(function SafeAreaScrollViewInner(
  { contentContainerStyle, edges, horizontal, ...rest },
  ref
) {
  const safe = useSafeAreaInsets();
  const scrolling = useScrollingInsets();
  const hz = horizontal ?? false;
  const top = edges?.top ?? DEFAULT_EDGES.top;
  const left = edges?.left ?? DEFAULT_EDGES.left;
  const right = edges?.right ?? DEFAULT_EDGES.right;
  const bottom = edges?.bottom ?? DEFAULT_EDGES.bottom;
  // Memoized so contentContainerStyle keeps a stable identity across renders
  // when the inset values don't change — react-native-macos's scroll view can
  // blank and re-lay-out its content when that style changes identity.
  const mergedContentStyle = useMemo(() => {
    if (isDesktop) return contentContainerStyle as ViewStyle;
    // Scroll axis → scrolling insets; cross axis → safe area.
    const inset = hz
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
    return addInsets(contentContainerStyle as ViewStyle, inset, {
      top,
      left,
      right,
      bottom,
    });
  }, [contentContainerStyle, safe, scrolling, hz, top, left, right, bottom]);

  return (
    <ScrollView
      ref={ref}
      horizontal={horizontal}
      contentContainerStyle={mergedContentStyle}
      // We inset content ourselves, so stop iOS from also shifting the scroll
      // indicator by the native safe area (which pushed it toward the middle on
      // wide devices like the iPhone Duo). Keep the indicator off the bar only.
      automaticallyAdjustsScrollIndicatorInsets={isIOS ? false : undefined}
      scrollIndicatorInsets={
        isIOS
          ? hz
            ? { right: scrolling.right }
            : { bottom: scrolling.bottom }
          : undefined
      }
      {...rest}
    />
  );
});
