# Hamghadam animated character

The runtime GLB is derived from the user-supplied `HamGhadam_Exact_Model_Animations.glb` in `drive-download-20261112T102645Z-1-001.zip`. The STL/3MF printing revisions are separate deliveries and are not used for animation.

`manifest.json` records the original and runtime SHA-256 hashes, sizes, geometry counts and all nine clips. The original animated source is 50,540,928 bytes, 500,000 triangles and 34 joints. The web derivative has 100,000 triangles and three embedded WebP textures (2048px base color; 1024px normal and metallic/roughness maps). Its geometry and texture resolution are optimized; its animation input/output keys, bind matrices and rig hierarchy are retained.

Rebuild from the original animated GLB using the pinned development dependencies:

```sh
npm run game:model:prepare -- /path/to/HamGhadam_Exact_Model_Animations.glb
npm run test:squirrel-game
```

The preparation command uses skin/UV/normal-aware mesh simplification, lossless WebP after resizing, and lossless Meshopt buffer compression. It verifies all animation channels against the original source before writing a content-addressed filename. Keep the source ZIP and authoring `.blend` outside the served `public` directory. Normal app builds use the checked-in web asset without requiring Blender or the original archive.

All nine clips have visible gameplay states. Each encounter walks for three seconds, idles, then rests for five seconds: Sit intro/loop, LegsOut intro/loop, Sleep Curled and Sleep Flat rotate across four visits. The path stops during idle/rest and resumes afterward; tapping any pose immediately starts Run. Catches alternate the two sitting sequences. Reduced motion slows looping clips to 75% while retaining live skeletal animation; tracking loss or a paused session stops playback. Animation locomotion is in place; the game's world-space path controls travel.

The delivered Walk/Run are restrained scurries: paw lifts measure only about 1.3/2.5 pixels at the game's 180px character height. `lib/squirrel-ar-gait.ts` bakes stronger game derivatives in memory, with two-bone leg IK, planted support paws, body bounce/lean/sway and arm counter-motion. Paw lifts become about 7/10px. These derivatives retain the source durations and sampling times; the delivered GLB, source tracks, bind matrices and other seven clips remain unchanged. Only ordinary AnimationMixer playback runs each frame.
