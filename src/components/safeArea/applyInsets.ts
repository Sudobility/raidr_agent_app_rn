/**
 * addInsets - add per-edge insets on top of whatever padding a base style
 * already declares, expanding the padding shorthands so nothing is lost.
 */

import { StyleSheet, type ViewStyle } from 'react-native';

export interface Edges {
  top?: boolean;
  left?: boolean;
  right?: boolean;
  bottom?: boolean;
}

interface EdgeInset {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export function addInsets(
  base: ViewStyle | undefined,
  inset: EdgeInset,
  edges: Required<Edges>
): ViewStyle {
  const flat = (StyleSheet.flatten(base) ?? {}) as ViewStyle;
  const all = num(flat.padding);
  const h = flat.paddingHorizontal != null ? num(flat.paddingHorizontal) : all;
  const v = flat.paddingVertical != null ? num(flat.paddingVertical) : all;
  const baseLeft = flat.paddingLeft != null ? num(flat.paddingLeft) : h;
  const baseRight = flat.paddingRight != null ? num(flat.paddingRight) : h;
  const baseTop = flat.paddingTop != null ? num(flat.paddingTop) : v;
  const baseBottom = flat.paddingBottom != null ? num(flat.paddingBottom) : v;
  return {
    ...flat,
    // Shorthands are expanded into the explicit edges below.
    padding: undefined,
    paddingHorizontal: undefined,
    paddingVertical: undefined,
    paddingLeft: edges.left ? baseLeft + inset.left : baseLeft,
    paddingRight: edges.right ? baseRight + inset.right : baseRight,
    paddingTop: edges.top ? baseTop + inset.top : baseTop,
    paddingBottom: edges.bottom ? baseBottom + inset.bottom : baseBottom,
  };
}
