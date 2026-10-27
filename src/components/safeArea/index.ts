/**
 * safeArea - generic safe-area + scrolling-inset primitives.
 *
 * Use SafeAreaScrollView for a ScrollView, useScrollContentStyle for a
 * FlatList/FlashList, and SafeAreaContent for a non-scrolling box. All handle
 * the platform differences (bottom tab bar vs. sidebar) internally. In a
 * master-detail layout, apply them to the master and detail content separately.
 */

export { useSafeAreaInsets, useScrollingInsets, type Insets } from './insets';
export {
  SafeAreaScrollView,
  type SafeAreaScrollViewProps,
} from './SafeAreaScrollView';
export {
  SafeAreaContent,
  useScrollContentStyle,
  type SafeAreaContentProps,
} from './SafeAreaContent';
export { type Edges } from './applyInsets';
