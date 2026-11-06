/**
 * SplitView — master/detail over the shared `MasterDetailLayout`.
 *
 * At iOS's regular width ({@link REGULAR_WIDTH}, which `MasterDetailLayout`
 * measures on the view itself, so the desktop sidebar counts) a fixed-width
 * list on the left, a hairline, and the chosen item's detail on the right under
 * its own heading, held to the readable width. Narrower, it drills in: choosing
 * an entry pushes the detail over the list on the layout's own native stack
 * (`showDetail`), and the detail carries a back control (`showMaster`). This is
 * the family's one master/detail, so {@link detailFocused} keeps the reader on
 * the drilled-in detail across a rotation that collapses and reopens the split.
 *
 * Use inside `Screen layout='fill'`.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  MasterDetailLayout,
  Text,
  useMasterDetail,
} from '@sudobility/components-rn';
import { useTabBarHeight } from '@/hooks/useTabBarHeight';
import { READABLE_WIDTH } from './Screen';
import { REGULAR_WIDTH } from './TileGrid';

/** The list's width beside a detail, in pt. */
export const MASTER_WIDTH = 300;

/** Whether `width` has room for list and detail side by side. */
export function isSplitWidth(width: number): boolean {
  return width >= REGULAR_WIDTH;
}

export interface SplitViewProps {
  /**
   * The list. `split` says whether a detail is beside it; `showDetail` drills
   * into the detail (inert when `split`, a push on a narrow screen), so a row
   * press can mark the selection and reveal it in one call.
   */
  renderMaster: (split: boolean, showDetail: () => void) => React.ReactNode;
  /** The chosen entry's title and content, shown beside the list or drilled into. */
  detailTitle: string;
  detail: React.ReactNode;
  /**
   * The detail brings its own scrolling and heading (a `LoginPage`): show it
   * filling the pane, without the pane's scroll view and title.
   */
  detailScrolls?: boolean;
  /**
   * Whether the detail is the focused column — controlled, honoured only when
   * drilled in. A collapse after a rotation reopens on the detail (with Back to
   * the list) rather than on the list. Pair with {@link onDetailFocusedChange}.
   */
  detailFocused?: boolean;
  /** The focused column changed: `true` on drill-in, `false` on the way back. */
  onDetailFocusedChange?: (focused: boolean) => void;
}

export default function SplitView({
  renderMaster,
  detailTitle,
  detail,
  detailScrolls = false,
  detailFocused,
  onDetailFocusedChange,
}: SplitViewProps) {
  return (
    <MasterDetailLayout
      masterWidth={MASTER_WIDTH}
      breakpoint={REGULAR_WIDTH}
      detailFocused={detailFocused}
      onDetailFocusedChange={onDetailFocusedChange}
      master={<MasterPane renderMaster={renderMaster} />}
      detail={
        <DetailPane
          detailTitle={detailTitle}
          detail={detail}
          detailScrolls={detailScrolls}
        />
      }
    />
  );
}

/** The list, in its scroll chrome, told by the layout whether a detail is beside it. */
function MasterPane({
  renderMaster,
}: {
  renderMaster: (split: boolean, showDetail: () => void) => React.ReactNode;
}) {
  const { isWide, showDetail } = useMasterDetail();
  const bottom = useTabBarHeight() + 24;
  return (
    <ScrollView
      style={styles.full}
      contentContainerStyle={[
        isWide ? styles.masterContent : styles.listContent,
        { paddingBottom: bottom },
      ]}
    >
      {isWide ? (
        renderMaster(true, showDetail)
      ) : (
        <View style={styles.column}>{renderMaster(false, showDetail)}</View>
      )}
    </ScrollView>
  );
}

/**
 * The chosen entry's detail, under its heading and held to the readable width.
 * Drilled in (narrow) it carries a back control to the list — the layout's
 * stack draws no header of its own.
 */
function DetailPane({
  detailTitle,
  detail,
  detailScrolls,
}: {
  detailTitle: string;
  detail: React.ReactNode;
  detailScrolls: boolean;
}) {
  const { isWide, showMaster } = useMasterDetail();
  const { t } = useTranslation();
  const bottom = useTabBarHeight() + 24;
  const back = !isWide ? (
    <Pressable
      onPress={showMaster}
      onAccessibilityTap={showMaster}
      accessibilityRole='button'
      accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
      testID='split-back'
      style={styles.back}
    >
      <Text size='2xl' color='muted'>
        {'‹'}
      </Text>
    </Pressable>
  ) : null;
  if (detailScrolls) {
    return (
      <View style={styles.full} testID='split-detail'>
        {back ? <View style={styles.backRow}>{back}</View> : null}
        {detail}
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.full}
      contentContainerStyle={[styles.detail, { paddingBottom: bottom }]}
      keyboardShouldPersistTaps='handled'
      testID='split-detail'
    >
      <View style={styles.column}>
        {back}
        <Text size='2xl' weight='bold' className='mb-4 px-1'>
          {detailTitle}
        </Text>
        {detail}
      </View>
    </ScrollView>
  );
}

export interface SplitMenuEntry {
  id: string;
  label: string;
  /** Muted text on the right (the entry's current value). */
  value?: string;
}

/**
 * The master's entries on one card. When split the chosen entry is marked;
 * otherwise each row is a link to its own screen (chevron).
 */
export function SplitMenuList({
  entries,
  selected,
  onSelect,
}: {
  entries: readonly SplitMenuEntry[];
  /** The chosen entry; null when nothing is shown beside the list. */
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View className='rounded-lg overflow-hidden bg-card'>
      {entries.map((entry, i) => {
        const isSelected = entry.id === selected;
        return (
          <React.Fragment key={entry.id}>
            {i > 0 ? <View className='h-px ml-4 bg-border' /> : null}
            <Pressable
              onPress={() => onSelect(entry.id)}
              accessibilityRole='button'
              accessibilityLabel={entry.label}
              accessibilityState={{ selected: isSelected }}
              testID={`split-entry-${entry.id}`}
              className={
                isSelected
                  ? 'flex-row items-center py-3 px-4 min-h-[48px] bg-primary/10'
                  : 'flex-row items-center py-3 px-4 min-h-[48px]'
              }
            >
              <Text
                size='base'
                weight={isSelected ? 'semibold' : 'normal'}
                className='flex-1'
              >
                {entry.label}
              </Text>
              {entry.value ? (
                <Text size='sm' color='muted' className='ml-2'>
                  {entry.value}
                </Text>
              ) : null}
              <Text size='xl' color='muted' className='ml-2'>
                {'›'}
              </Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  masterContent: { padding: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 24, alignItems: 'center' },
  column: { width: '100%', maxWidth: READABLE_WIDTH },
  detail: { paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' },
  back: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 4 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
});
