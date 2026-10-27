/**
 * AdaptiveTabbar - OS-adaptive tab navigation, driven by one tab config.
 *
 * Metro resolves AdaptiveTabbar.{ios,android,macos,windows}.tsx; the base file
 * (AdaptiveTabbar.tsx) is the native iOS/Android implementation and the one tsc
 * type-checks. Reusable across apps: pass your own `tabs` (see AdaptiveTab).
 */

export { AdaptiveTabbar } from './AdaptiveTabbar';
export { useBottomTabbarHeight } from './useBottomTabbarHeight';
export type { AdaptiveTab, AdaptiveTabbarProps } from './types';
