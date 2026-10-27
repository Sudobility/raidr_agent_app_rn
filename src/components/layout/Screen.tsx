/**
 * Screen — every screen's frame: the {@link NavBar} on top, then the content
 * laid out by what it is.
 *
 * - `center` (default) — not a list (a form, a detail, a question): one
 *   column of readable width in the middle of the window. With
 *   `valign='center'` (a single question or call to action: Ask, a permission)
 *   it is also vertically centred while shorter than the window; `top` (long
 *   pages: settings, forms, details) starts under the bar like iOS.
 * - `list` — list content: the full width, for a {@link TileGrid} (a list
 *   when narrow, tiles when wide); other blocks inside stay readable width.
 * - `fill` — the content takes the whole area and handles its own scrolling
 *   (a web view, a map).
 *
 * `footer` sits fixed under the content (a Next / Run bar). The scroller and
 * the footer clear the native tab bar / home indicator through the scrolling
 * insets rather than a measured tab-bar height, so the native bottom tab bar
 * (and the desktop sidebar, where the bottom inset is 0) are both handled.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaScrollView, useSafeAreaInsets } from '@/components/safeArea';
import NavBar from './NavBar';

/** Widest a `center` column gets. */
export const READABLE_WIDTH = 640;

export interface ScreenProps {
  title: string;
  layout?: 'center' | 'list' | 'fill';
  /** Control on the right of the nav bar. */
  headerRight?: React.ReactNode;
  hideBack?: boolean;
  /** Fixed bar under the content. */
  footer?: React.ReactNode;
  /** `center` layout only: vertical placement while the content is short. */
  valign?: 'center' | 'top';
  /** Turn scrolling off for a moment (e.g. while dragging a row). */
  scrollEnabled?: boolean;
  children: React.ReactNode;
  testID?: string;
}

export default function Screen({
  title,
  layout = 'center',
  headerRight,
  hideBack,
  footer,
  valign = 'top',
  scrollEnabled = true,
  children,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className='flex-1 bg-background' testID={testID}>
      <NavBar
        title={title}
        {...(headerRight ? { right: headerRight } : {})}
        {...(hideBack ? { hideBack } : {})}
      />
      {layout === 'fill' ? (
        <View className='flex-1'>{children}</View>
      ) : (
        <SafeAreaScrollView
          className='flex-1'
          scrollEnabled={scrollEnabled}
          // The NavBar owns the top; a footer owns the bottom (it insets
          // itself), so the scroller only insets the bottom when there is none.
          edges={footer ? { top: false, bottom: false } : undefined}
          contentContainerStyle={[
            layout === 'center' ? styles.center : styles.list,
            layout === 'center' && valign === 'top' ? styles.top : null,
          ]}
          keyboardShouldPersistTaps='handled'
        >
          {layout === 'center' ? (
            <View style={styles.column}>{children}</View>
          ) : (
            children
          )}
        </SafeAreaScrollView>
      )}
      {footer ? (
        <View
          className='px-4 pt-3 bg-background border-t border-foreground/10 items-center'
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  top: { justifyContent: 'flex-start' },
  list: { padding: 16, paddingBottom: 24 },
  column: { width: '100%', maxWidth: READABLE_WIDTH },
});
