import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { csv, storeCsvRow } from '../dist/output.js';
import { normalizeStore, photoRows, httpUrl, uniquePhotos } from '../dist/normalize.js';
import { parseOptions } from '../dist/cli.js';
import { Observer, parseFilterDefinitions, robotsAllowsPublicPath } from '../dist/browser.js';
import { bounded, crawlIsStalled } from '../dist/runtime.js';

test('CSV preserves Persian, embedded quotes/newlines, nested data, and neutralizes formulas', () => {
  const result = csv([{ name: 'کافه "الف"\r\nطبقه دوم', tags: ['cafe', 'food'], body: ' =SUM(1,2)', numeric: -2 }]);
  assert.ok(result.startsWith('\uFEFF'));
  assert.ok(result.includes('کافه ""الف""\r\nطبقه دوم'));
  assert.ok(result.includes('"[""cafe"",""food""]"'));
  assert.ok(result.includes('"\' =SUM(1,2)"'));
  assert.ok(result.includes('"-2"'));
});

test('normalization retains unknown source fields, raw precision, categories, photo variants, and review provenance', () => {
  const detail = {
    place_id: 'id1', name: 'کافه ۱', address: 'تهران', latitude: '35.12345678901234', longitude: '51.2',
    categories: ['cafe', 'food'], tags: [{ code: 'cozy', label: 'فضای دنج' }],
    photos: [{ url: 'https://example.com/a.webp', thumbnail_url: 'https://example.com/a_thumb.webp', caption: 'عکس' }],
    unknown_future_field: { note: 'preserve me' }, price_level: 0,
  };
  const store = normalizeStore({
    id: 'id1', origin: 'https://invara.top', detail, listing: {},
    page: { title: 'test', name: '', text: '', links: [], photos: [], meta: {} },
    reviews: [{ id: 12, body: '=1+1', dish_tags: ['pizza'], images: [{ url: 'https://example.com/review.webp' }] }],
    reviewPages: 1, reviewsComplete: true, warnings: [],
  });
  assert.equal(store.raw_place.latitude, detail.latitude);
  assert.deepEqual(store.raw_place.unknown_future_field, detail.unknown_future_field);
  assert.equal(store.price_level, 0);
  assert.equal(store.photos.length, 3);
  assert.equal(store.photos.find(photo => photo.kind === 'review').review_id, '12');
  assert.equal(store.reviews[0].body, '=1+1');
  assert.equal(store.reviews[0].place_id, 'id1');
  assert.deepEqual(storeCsvRow(store).raw_place, detail);
  assert.throws(() => normalizeStore({ id: 'different', origin: 'https://invara.top', detail }), /does not match/);
});

test('photo extraction accepts full HTTP URLs and rejects non-media schemes', () => {
  assert.equal(httpUrl('javascript:alert(1)'), null);
  assert.equal(photoRows('id', ['data:image/png;base64,x', 'https://example.com/a.webp'], 'venue').length, 1);
  const sourcePhoto = photoRows('id', ['https://example.com/a.webp'], 'venue')[0];
  const merged = uniquePhotos([sourcePhoto, { ...sourcePhoto, role: 'rendered', position: -1 }]);
  assert.equal(merged[0].position, 0);
  assert.equal(merged[0].role, 'original');
});

test('robots public-page checks honor the longest matching rule and allow tie precedence', () => {
  const robots = 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /places/private\nAllow: /places/private/public\n';
  assert.equal(robotsAllowsPublicPath(robots, '/explore'), true);
  assert.equal(robotsAllowsPublicPath(robots, '/api/v1/places/search'), false);
  assert.equal(robotsAllowsPublicPath(robots, '/places/private'), false);
  assert.equal(robotsAllowsPublicPath(robots, '/places/private/public'), true);
  assert.equal(robotsAllowsPublicPath('User-agent: *\nDisallow: /\nAllow: /explore$', '/explore'), true);
  assert.equal(robotsAllowsPublicPath('User-agent: *\nDisallow: /\nAllow: /explore$', '/explore-more'), false);
});

test('CLI rejects invalid limits and cross-origin discovery', () => {
  assert.equal(parseOptions(['--limit', '50']).options.limit, 50);
  assert.throws(() => parseOptions(['--limit', '0']), /limit/);
  assert.throws(() => parseOptions(['--limit', '1.5']), /limit/);
  assert.throws(() => parseOptions(['--seed-url', 'https://other.example/explore']), /origin/);
  assert.equal(parseOptions(['--all', '--workers', '4']).options.all, true);
  assert.throws(() => parseOptions(['--all', '--limit', '50']), /Choose/);
  assert.throws(() => parseOptions(['--workers', '9']), /workers/);
});

test('filter extraction handles literal arrays and minified references without executing scripts', () => {
  const source = 'let _=[{code:"cozy",label:"بیرون آروم"},{code:"good_for_groups",label:"مناسب گروه‌ها"}];e.s(["FILTER_TAGS",0,_]);e.s(["FOOD_FILTERS",0,[{code:"pizza",label:"پیتزا"}]]);throw new Error("must never execute");';
  const definitions = parseFilterDefinitions(source, 'https://invara.top/_next/catalog.js');
  assert.equal(definitions.length, 3);
  assert.equal(definitions.find(item => item.code === 'cozy').filterable, true);
  assert.equal(definitions.find(item => item.code === 'pizza').kind, 'food');
});

test('watchdog recovers inactivity but preserves server backoff and active long review crawls', () => {
  const now = 2000000;
  const runtime = { pid: 12, last_activity_at: new Date(now - 700000).toISOString(), pause_until: 0 };
  assert.equal(crawlIsStalled(runtime, 12, now - 700000, null, now), true);
  assert.equal(crawlIsStalled({ ...runtime, last_activity_at: new Date(now - 1000).toISOString() }, 12, 0, null, now), false);
  assert.equal(crawlIsStalled({ ...runtime, pause_until: now + 3600000 }, 12, 0, null, now), false);
  assert.equal(crawlIsStalled(null, 13, now - 700000, { pause_until: now + 3600000 }, now), false);
  assert.equal(crawlIsStalled(runtime, 13, now - 1000, null, now), false);
  assert.equal(crawlIsStalled({ ...runtime, pause_until: now - 30000 }, 12, 0, null, now), false);
});

test('an unfinished response body times out without blocking later work', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 30, 'reading a stalled body'), /Timed out reading a stalled body/);
  assert.equal(await bounded(Promise.resolve('next body'), 100, 'reading the next body'), 'next body');
});

test('shared observer flush releases stalled script bodies and saves Retry-After before reading a stalled error body', async () => {
  const page = new EventEmitter();
  let persisted = null;
  const observer = new Observer(page, 'https://example.com', '/tmp/invara-unused-journal', 30, async () => {
    persisted = observer.rateLimitState();
  });
  page.emit('response', {
    url: () => 'https://example.com/_next/unfinished.js',
    request: () => ({ method: () => 'GET', resourceType: () => 'script' }),
    ok: () => true,
    text: () => new Promise(() => {}),
  });
  page.emit('response', {
    url: () => 'https://example.com/api/v1/places/id',
    request: () => ({ method: () => 'GET', resourceType: () => 'fetch' }),
    headers: () => ({ 'content-type': 'application/json', 'retry-after': '3600' }),
    status: () => 429,
    json: () => new Promise(() => {}),
  });
  await bounded(observer.flush(), 1000, 'flushing the shared observer');
  assert.equal(observer.pending.size, 0);
  assert.equal(observer.errors.length, 2);
  assert.ok(observer.errors.every(error => error.message.includes('Timed out reading response body:')));
  assert.ok(persisted.pause_until > Date.now() + 3590000);
  assert.equal(persisted.adaptive_delay_ms, 1000);
  const resumed = new Observer(new EventEmitter(), 'https://example.com', '/tmp/invara-unused-journal');
  resumed.restoreRateLimit(persisted);
  assert.equal(resumed.pauseUntil, persisted.pause_until);
  assert.equal(resumed.adaptiveDelayMs, 1000);
});
