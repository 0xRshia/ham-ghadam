export type MapPadding = { top: number; bottom: number; left: number; right: number };

export function mapHeaderBottom(height: number, safeTop = 0) {
  return safeTop + (height <= 500 ? 8 : 16) + 56 + (height <= 420 ? 0 : height <= 500 ? 48 : 56);
}

export function mapDrawerHeights(height: number, selecting: boolean, safeTop = 0, safeBottom = 0) {
  // A location may only be confirmed while its center pin remains above the sheet.
  const maximum = Math.max(0, selecting ? height / 2 - 24 : height - mapHeaderBottom(height, safeTop) - 24);
  const collapsed = Math.min(maximum, (selecting ? 172 : 44) + safeBottom);
  return {
    collapsed,
    preview: Math.max(collapsed, Math.min(maximum, 360, height * .44)),
    expanded: maximum,
  };
}

export function clampMapPadding(width: number, height: number, desired: MapPadding): MapPadding {
  const horizontal = Math.max(0, width - Math.min(120, width / 2));
  const vertical = Math.max(0, height - Math.min(64, height / 2));
  const x = Math.min(1, horizontal / Math.max(1, desired.left + desired.right));
  const y = Math.min(1, vertical / Math.max(1, desired.top + desired.bottom));
  return { left: desired.left * x, right: desired.right * x, top: desired.top * y, bottom: desired.bottom * y };
}

export function mapFitPadding(width: number, height: number, selecting: boolean, safeTop = 0, safeBottom = 0) {
  return clampMapPadding(width, height, {
    top: mapHeaderBottom(height, safeTop) + 20,
    bottom: mapDrawerHeights(height, selecting, safeTop, safeBottom).preview + 32,
    left: 64, right: 64,
  });
}
