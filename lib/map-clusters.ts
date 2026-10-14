type Point = { lat: number; lng: number };
type Pixel = { x: number; y: number };
export type MapCluster<T> = Point & { items: T[] };

// Group nearby screen positions, so the same locations separate naturally as users zoom.
export function clusterMapEvents<T extends Point>(events: T[], project: (event: T) => Pixel, radius = 48): MapCluster<T>[] {
  const groups: { anchor: Pixel; items: T[] }[] = [];
  const cells = new Map<string, number[]>();
  for (const event of events) {
    const pixel = project(event);
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
    groups[groupIndex].items.push(event);
  }
  return groups.map(({ items }) => ({ items,
    lat: items.reduce((sum, point) => sum + point.lat, 0) / items.length,
    lng: items.reduce((sum, point) => sum + point.lng, 0) / items.length,
  }));
}
