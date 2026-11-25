type Point = { lat: number; lng: number };
type Pixel = { x: number; y: number };
export type MapCluster<T> = Point & { items: T[] };
type ClusterViewport<T> = {
  width: number;
  height: number;
  shouldCull: (item: T) => boolean;
  margin?: number;
};

// Group nearby screen positions, so the same locations separate naturally as users zoom.
export function clusterMapEvents<T extends Point>(items: T[], project: (item: T) => Pixel, radius = 48, viewport?: ClusterViewport<T>): MapCluster<T>[] {
  const groups: { anchor: Pixel; items: T[] }[] = [];
  const cells = new Map<string, number[]>();
  // Keep one cluster radius beyond the canvas so locations near its edge can still group.
  const margin = viewport?.margin ?? radius;
  for (const item of items) {
    const pixel = project(item);
    if (viewport?.shouldCull(item) && !(
      pixel.x >= -margin && pixel.x <= viewport.width + margin
      && pixel.y >= -margin && pixel.y <= viewport.height + margin
    )) continue;
    const x = Math.floor(pixel.x / radius), y = Math.floor(pixel.y / radius);
    let groupIndex: number | undefined;
    for (let dx = -1; dx <= 1 && groupIndex === undefined; dx++) {
      for (let dy = -1; dy <= 1 && groupIndex === undefined; dy++) {
        groupIndex = cells.get(`${x + dx}:${y + dy}`)?.find(index =>
          Math.hypot(groups[index].anchor.x - pixel.x, groups[index].anchor.y - pixel.y) < radius);
      }
    }
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      groups.push({ anchor: pixel, items: [] });
      const key = `${x}:${y}`;
      const bucket = cells.get(key) ?? [];
      bucket.push(groupIndex);
      cells.set(key, bucket);
    }
    groups[groupIndex].items.push(item);
  }
  return groups.map(({ items }) => ({ items,
    lat: items.reduce((sum, point) => sum + point.lat, 0) / items.length,
    lng: items.reduce((sum, point) => sum + point.lng, 0) / items.length,
  }));
}
