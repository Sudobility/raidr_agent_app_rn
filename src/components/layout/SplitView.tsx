/**
 * SplitView — master/detail over the shared `MasterDetailLayout`.
 *
 * At iOS's regular width ({@link REGULAR_WIDTH}, which `MasterDetailLayout`
 * measures on the view itself, so the desktop sidebar counts) a fixed-width
 * list on the left, a hairline, and the chosen item's detail on the right under
 * its own heading, held to the readable width. Narrower, the list alone:
 * choosing an entry is the screen's to handle (push a detail screen), so this
 * never asks the layout to drill in — `MasterDetailLayout` shows the master
 * and the screen pushes its own route.
 *
 * Use inside `Screen layout='fill'`.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  /** The list; `split` says whether a detail is beside it. */
  renderMaster: (split: boolean) => React.ReactNode;
  /** The chosen entry's title and content, shown only when split. */
  detailTitle: string;
  detail: React.ReactNode;
  /**
   * The detail brings its own scrolling and heading (a `LoginPage`): show it
   * filling the pane, without the pane's scroll view and title.
   */
  detailScrolls?: boolean;
}

export default function SplitView({
  renderMaster,
  detailTitle,
  detail,
  detailScrolls = false,
}: SplitViewProps) {
  return (
    <MasterDetailLayout
      masterWidth={MASTER_WIDTH}
      breakpoint={REGULAR_WIDTH}
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
  renderMaster: (split: boolean) => React.ReactNode;
}) {
  const { isWide } = useMasterDetail();
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
        renderMaster(true)
      ) : (
        <View style={styles.column}>{renderMaster(false)}</View>
      )}
    </ScrollView>
  );
}

/** The chosen entry's detail, under its heading and held to the readable width. */
function DetailPane({
  detailTitle,
  detail,
  detailScrolls,
}: {
  detailTitle: string;
  detail: React.ReactNode;
  detailScrolls: boolean;
}) {
  const bottom = useTabBarHeight() + 24;
  if (detailScrolls) {
    return (
      <View style={styles.full} testID='split-detail'>
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
});
