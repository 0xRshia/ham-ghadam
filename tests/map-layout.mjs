import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/map-layout.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { mapHeaderBottom, mapDrawerHeights, clampMapPadding, mapFitPadding } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const epsilon = 1e-8;
const safeAreas = [{ top: 0, bottom: 0 }, { top: 44, bottom: 34 }, { top: 0, bottom: 21 }];
const heights = [320, 375, 420, 421, 500, 501, 667, 812, 932];

for (const height of heights) {
  for (const safe of safeAreas) {
    for (const selecting of [false, true]) {
      const snaps = mapDrawerHeights(height, selecting, safe.top, safe.bottom);
      assert.ok(0 <= snaps.collapsed && snaps.collapsed <= snaps.preview && snaps.preview <= snaps.expanded,
        `Drawer snaps remain ordered at height ${height}, selection ${selecting}, safe area ${JSON.stringify(safe)}`);
      for (const [snap, panelHeight] of Object.entries(snaps)) {
        const panelTop = height - panelHeight;
        if (selecting) {
          assert.ok(panelTop - height / 2 >= 24 - epsilon,
            `The center selection pin remains at least 24px above the ${snap} panel at height ${height}`);
        } else {
          assert.ok(panelTop - mapHeaderBottom(height, safe.top) >= 24 - epsilon,
            `The ${snap} browsing panel leaves the floating header accessible at height ${height}`);
        }
      }
      for (const width of [320, 375, 812]) {
        const padding = mapFitPadding(width, height, selecting, safe.top, safe.bottom);
        assert.ok(Object.values(padding).every(value => Number.isFinite(value) && value >= 0), "Padding stays finite and nonnegative");
        assert.ok(width - padding.left - padding.right >= 120 - epsilon,
          `Fitting bounds retains at least 120px of map width in a ${width}×${height} viewport`);
        assert.ok(height - padding.top - padding.bottom >= 64 - epsilon,
          `Fitting bounds retains at least 64px of map height in a ${width}×${height} viewport`);
      }
    }
  }
}

const shortLandscape = mapFitPadding(812, 320, true, 44, 34);
assert.ok(shortLandscape.top + shortLandscape.bottom <= 256 + epsilon,
  "A 320px landscape view with safe insets cannot consume the map with camera padding");
assert.equal(mapDrawerHeights(812, true, 44, 34).collapsed, 206,
  "A portrait selection sheet reserves the bottom safe area for its confirmation action");
assert.equal(mapDrawerHeights(812, false, 44, 34).collapsed, 78,
  "A collapsed browsing sheet includes the bottom safe area below its handle");
assert.equal(mapDrawerHeights(932, false).preview, 360, "Tall screens cap the initial browsing sheet at 360px");

for (const [height, expected] of [[320, 64], [420, 64], [421, 112], [500, 112], [501, 128]]) {
  assert.equal(mapHeaderBottom(height), expected, "Header bounds follow the compact/category-row breakpoints");
  assert.equal(mapHeaderBottom(height, 44), expected + 44, "The header clears the top safe area");
}
const ordinaryPadding = { top: 80, bottom: 112, left: 56, right: 56 };
assert.deepEqual(clampMapPadding(375, 812, ordinaryPadding), ordinaryPadding,
  "A roomy event-location preview keeps its existing camera composition");
const tinyPreview = clampMapPadding(80, 60, { top: 80, bottom: 120, left: 60, right: 60 });
assert.ok(80 - tinyPreview.left - tinyPreview.right >= 40 - epsilon);
assert.ok(60 - tinyPreview.top - tinyPreview.bottom >= 30 - epsilon,
  "An unusually small preview retains half its dimensions for map geometry");

console.log("PASS responsive map fit, landscape and safe-area clearance, ordered drawer snaps and visible selection pin");
