# Hamghadam animated character

The runtime GLB is derived from the user-supplied `HamGhadam_Exact_Model_Animations.glb` in `drive-download-20261112T102645Z-1-001.zip`. The STL/3MF printing revisions are separate deliveries and are not used for animation.

`manifest.json` records the original and runtime SHA-256 hashes, sizes, geometry counts and all nine clips. The original animated source is 50,540,928 bytes, 500,000 triangles and 34 joints. The web derivative has 100,000 triangles and three embedded WebP textures (2048px base color; 1024px normal and metallic/roughness maps). Its geometry and texture resolution are optimized; its animation input/output keys, bind matrices and rig hierarchy are retained.

Rebuild from the original animated GLB using the pinned development dependencies:

```sh
npm run game:model:prepare -- /path/to/HamGhadam_Exact_Model_Animations.glb
npm run test:squirrel-game
```

The preparation command uses skin/UV/normal-aware mesh simplification, lossless WebP after resizing, and lossless Meshopt buffer compression. It verifies all animation channels against the original source before writing a content-addressed filename. Keep the source ZIP and authoring `.blend` outside the served `public` directory. Normal app builds use the checked-in web asset without requiring Blender or the original archive.

The application loads the full authored model and textures. It uses Walk for roaming, Run for entry/catching/escape and a one-shot Sit intro followed by its matching loop for catches. Both sitting variants and both sleep clips remain in the GLB. Animation locomotion is in place; the game's existing world-space path controls movement.
