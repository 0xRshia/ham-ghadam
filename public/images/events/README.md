# Local preview event covers

`halloween.webp`, `painting.webp` and `music.webp` were generated on 25 October 2026 with the built-in ImageGen tool. They depict a realistic Halloween café table, a painting workshop and live music respectively. The source images remain in the tool's generated-image directory; these WebP copies are the project assets.

The covers follow the existing full-bleed editorial photographs in `../books.jpg`, `../games.jpg`, `../pottery.jpg` and `../cafe.jpg`: natural lighting, real textures, an opaque canvas, and no baked text, rounded frame or border. Important subjects stay near the center so the same image works in the landscape detail hero and narrow list thumbnail. Category banners are separate 3D illustrations with space for category labels and must not double as event covers.

These assignments belong only to the five existing `change-qa-*` local preview events. They are not server-wide category fallbacks and do not replace organizer-uploaded covers. Books and games preview events reuse the existing `../books.jpg` and `../games.jpg` photographs.

Run from the repository root to refresh the isolated preview database:

```sh
VISUAL_DATABASE_PATH=/tmp/hamghadam-change-qa/site.sqlite node scripts/prepare-preview-covers.mjs
```

The helper requires an existing database resolving inside the system temporary directory's `hamghadam-change-qa` folder, verifies all five event IDs, categories and image files, and changes only those events' `image` fields in one transaction. It does not create events or users.
