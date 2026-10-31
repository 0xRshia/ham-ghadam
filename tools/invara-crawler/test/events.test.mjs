import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { parseDavvvat, parseJabama, eventIdentity } from '../dist/events/adapters.js';
import { decodeFlight } from '../dist/events/html.js';
import { robotsAllowed, robotsRules, retryAfterMs, PublicHtmlClient } from '../dist/events/http.js';
import { categorizeEvent } from '../dist/events/model.js';
import { crawlSource } from '../dist/events/cli.js';
import { buildEventCatalogue, searchEvents } from '../dist/events/viewer.js';
import { createViewerServer } from '../dist/viewer.js';

const scriptString = value => JSON.stringify(value).replaceAll('<', '\\u003c');
function routerHtml(data) {
  const pool = [];
  function pack(value) {
    const index = pool.length; pool.push(null);
    if (Array.isArray(value)) pool[index] = value.map(pack);
    else if (value && typeof value === 'object') pool[index] = Object.fromEntries(Object.entries(value).map(([key, item]) => [`_${pack(key)}`, pack(item)]));
    else pool[index] = value;
    return index;
  }
  pack(data);
  return `<html lang="fa"><head><title>رویداد آزمایشی</title><script>window.__reactRouterContext.streamController.enqueue(${scriptString(JSON.stringify(pool) + '\n')})</script></head><body><main><h1>رویداد</h1>۱۰۰ تومان</main></body></html>`;
}
function jabama(id = '42', city = 'tehran') {
  return { id, title: 'کارگاه ساخت ماگ', description: '<p>خط اول</p><p>خط دوم &amp; کامل</p>', category: { slug: 'pottery', label: 'سفالگری' },
    location: { city: { slug: city, label: city === 'tehran' ? 'تهران' : 'شیراز' }, address: 'تهران، ولیعصر', approximate: { centerLat: 35.7, centerLng: 51.4 } },
    pricePerPerson: 100, active: true, organizer: { id: 'host', name: 'برگزارکننده' },
    media: { official: [{ type: 'image', url: 'https://images.example.test/a.webp' }, { type: 'video', url: 'https://images.example.test/video.mp4' }] },
    reviews: [{ id: 1, text: 'نظر کامل' }], termsAndConditions: '<p>قانون کامل</p>', future_unknown: { keep: 'همهٔ فیلدها' } };
}
function jabamaPage(id = '42', city = 'tehran') {
  return routerHtml({ loaderData: { 'routes/events.$id': { event: jabama(id, city), sessions: [{ id: 's1', startIso: '2026-11-01T22:00:00.000Z', enabled: true }] } } });
}
function davvvatPage(overrides = {}) {
  const value = { id: 'database-id', slug: 'public-id/نام-رویداد', name: 'نمایشگاه هنر', description: '$2',
    categories: ['gallery-mixed-media'], type: 'gallery', mode: 'physical', status: 'published', isPrivate: false,
    city: 'تهران', address: 'خیابان کارگر', startDate: '2026-11-01T00:00:00.000Z', startTime: '18:00', endDate: '2026-11-02T00:00:00.000Z', endTime: null,
    ticketPrice: { isFree: false, priceText: 'از ۲۵۰ هزار تومان' }, organizations: [{ name: 'گالری', slug: 'gallery-one' }],
    cover: 'https://images.example.test/a.webp', galleryImgs: ['https://images.example.test/b.webp'], future_unknown: 'preserved', ...overrides };
  const description = 'متن کامل فارسی\n\nسطر دوم با «جزئیات» و نشانه :';
  const wire = `1:${JSON.stringify(['$', '$L9', null, { event: value }])}\n2:T${Buffer.byteLength(description).toString(16)},${description}3:{"other":true}\n`;
  return `<html><head><title>دعوت</title><script type="application/ld+json">{"@type":"Event","startDate":"2026-10-31T20:30:00.000Z","description":"خلاصه"}</script><script>self.__next_f.push([1,${scriptString(wire)}])</script></head><body><main><h1>نمایشگاه هنر</h1></main></body></html>`;
}
const davvvatUrl = 'https://davvvat.ir/event/public-id/نام-رویداد';

test('public hydration preserves full event data, UTF-8 text references, calendar semantics and unconverted currency', () => {
  const event = parseJabama(jabamaPage(), 'https://jabama.events/events/42');
  assert.equal(event.event_id, 'jabama:42');
  assert.match(event.description, /خط اول\n\n?خط دوم & کامل/);
  assert.equal(event.start_date, '2026-11-02'); // Session crosses midnight in Tehran.
  assert.equal(event.start_time, '01:30');
  assert.equal(event.location_precision, 'approximate');
  assert.equal(event.price.currency, 'IRT'); assert.equal(event.price.amount, 100);
  assert.equal(event.photos.length, 1); assert.equal(event.videos.length, 1);
  assert.equal(event.reviews[0].text, 'نظر کامل');
  assert.deepEqual(JSON.parse(JSON.stringify(event.raw_event.future_unknown)), { keep: 'همهٔ فیلدها' });
  const multiple = parseJabama(routerHtml({ loaderData: { 'routes/events.$id': { event: jabama(), sessions: [
    { id: 'one', startIso: '2026-11-01T22:00:00.000Z', durationHours: 1.5, enabled: true },
    { id: 'two', startIso: '2026-11-05T22:00:00.000Z', durationHours: 1.5, enabled: true },
  ] } } }), 'https://jabama.events/events/42');
  assert.equal(multiple.end_date, '2026-11-06');
  assert.equal(multiple.end_at, '2026-11-05T23:30:00.000Z');
  assert.throws(() => parseJabama(jabamaPage(), 'https://jabama.events/events/different'), /mismatch/);
  const invitation = parseDavvvat(davvvatPage(), davvvatUrl);
  assert.match(invitation.description, /متن کامل فارسی\n\nسطر دوم/);
  assert.equal(invitation.source_id, 'public-id'); assert.equal(invitation.raw_event.id, 'database-id');
  assert.equal(invitation.start_date, '2026-11-01'); assert.equal(invitation.start_time, '18:00');
  assert.equal(invitation.start_at, null); assert.equal(invitation.price.amount, null);
  assert.equal(invitation.price.text, 'از ۲۵۰ هزار تومان'); assert.equal(invitation.photos.length, 2);
  assert.equal(invitation.raw_event.future_unknown, 'preserved'); assert.equal(invitation.warnings.length, 0);
  assert.equal(parseDavvvat(davvvatPage({ startDate: '2026-11-02T00:00:00.000Z' }), davvvatUrl).warnings.length, 1);
  assert.throws(() => parseDavvvat(davvvatPage({ isPrivate: true }), davvvatUrl), /Private/);
  assert.equal(eventIdentity('davvvat', 'https://other.test/event/public-id/x'), null);
  assert.equal(eventIdentity('jabama', 'https://jabama.events/checkout/42'), null);
  assert.deepEqual(decodeFlight('1:T4,🙂2:{"text":"$1"}\n'), [{ text: '🙂' }]);
});

test('robots honors agent groups, wildcards and longest allow; client refuses private paths and preserves Retry-After', async () => {
  const rules = robotsRules('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /business/*/edit\nAllow: /api/public/\n\nUser-agent: GatherRadar\nDisallow: /\n');
  assert.equal(robotsAllowed('https://davvvat.ir/event/a/b', rules), true);
  assert.equal(robotsAllowed('https://davvvat.ir/api/x', rules), false);
  assert.equal(robotsAllowed('https://davvvat.ir/api/public/x', rules), true);
  assert.equal(robotsAllowed('https://davvvat.ir/business/id/edit', rules), false);
  assert.equal(retryAfterMs('120'), 120000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('2015-10-21T07:27:00Z')), 60000);
  const client = new PublicHtmlClient('davvvat', '/tmp/unused-event-cache', 1500, true);
  await assert.rejects(client.get('https://davvvat.ir/api/events'), /disallowed/);
  await assert.rejects(client.get('https://other.test/event/a/b'), /Cross-origin/);
  assert.deepEqual(categorizeEvent([{ code: 'event-and-workshop', label: 'ایونت و ورکشاپ' }], 'استندآپ کمدی').map(x => x.code), ['comedy']);
  assert.deepEqual(categorizeEvent([{ code: 'gallery', label: null }], 'نمایش انفرادی آثار هنرمند').map(x => x.code), ['exhibition']);
});

test('offline crawl discovers/deduplicates public inventory, excludes other cities, resumes and exports raw JSON/CSV', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'events-crawl-test-'));
  async function cache(url, text) {
    const folder = path.join(out, 'jabama/pages'); await mkdir(folder, { recursive: true });
    const key = createHash('sha256').update(url).digest('hex');
    await writeFile(path.join(folder, key + '.html'), text);
    await writeFile(path.join(folder, key + '.json'), JSON.stringify({ url, fetched_at: '2026-10-31T12:00:00.000Z', status: 200 }));
  }
  try {
    await cache('https://jabama.events/robots.txt', 'User-agent: *\nAllow: /\nDisallow: /checkout/');
    await cache('https://jabama.events/sitemap.xml', '<urlset><url><loc>https://jabama.events/events/42</loc></url><url><loc>https://jabama.events/events/43</loc></url><url><loc>https://jabama.events/events/42</loc></url><url><loc>https://jabama.events/profile/private</loc></url></urlset>');
    await cache('https://jabama.events/all?city=tehran', routerHtml({ loaderData: { 'routes/all': { total: 1, events: [] } } }));
    await cache('https://jabama.events/events/42', jabamaPage());
    await cache('https://jabama.events/events/43', jabamaPage('43', 'shiraz'));
    const options = { out, source: 'jabama', delayMs: 1500, limit: 0, refresh: false, offline: true, city: 'tehran' };
    const result = await crawlSource(options);
    assert.equal(result.complete, true); assert.equal(result.target_public_url_count, 2);
    assert.equal(result.exported_event_count, 1); assert.equal(result.excluded_count, 1);
    const before = await readFile(path.join(out, 'jabama/checkpoint.json'), 'utf8');
    const again = await crawlSource(options); assert.equal(again.complete, true);
    const after = await readFile(path.join(out, 'jabama/checkpoint.json'), 'utf8');
    assert.deepEqual(JSON.parse(before).pages, JSON.parse(after).pages);
    const records = JSON.parse(await readFile(path.join(out, 'jabama/events.json'), 'utf8'));
    assert.equal(records[0].raw_event.future_unknown.keep, 'همهٔ فیلدها');
    assert.match(await readFile(path.join(out, 'jabama/events.csv'), 'utf8'), /future_unknown/);
    const allCities = await crawlSource({ ...options, city: 'all' }); assert.equal(allCities.exported_event_count, 2);
    assert.equal(allCities.excluded_count, 0);
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('event catalogue combines source/category/free/online filters and validates pagination without conflating source IDs', () => {
  const a = parseJabama(jabamaPage(), 'https://jabama.events/events/42');
  const b = parseDavvvat(davvvatPage({ mode: 'online', ticketPrice: { isFree: true } }), davvvatUrl);
  const catalogue = buildEventCatalogue([a, b]);
  assert.equal(searchEvents(catalogue, new URLSearchParams({ q: 'كارگاه', source: 'jabama', category: 'workshop' })).total, 1);
  assert.equal(searchEvents(catalogue, new URLSearchParams({ online: '1', free: '1' })).items[0].event_id, b.event_id);
  assert.equal(searchEvents(catalogue, new URLSearchParams({ category: 'workshop', source: 'davvvat' })).total, 0);
  assert.equal(searchEvents(catalogue, new URLSearchParams({ limit: '1', page: '99' })).page, 2);
  assert.throws(() => searchEvents(catalogue, new URLSearchParams({ source: 'invara' })), /معتبر/);
  assert.throws(() => searchEvents(catalogue, new URLSearchParams({ limit: '1000' })), /معتبر/);
});

test('events panel filters, opens full details/photos, keeps places available, escapes scraped text and fits mobile', { timeout: 90000 }, async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'events-viewer-test-'));
  const eventsOut = path.join(out, 'events'); await mkdir(eventsOut);
  const a = parseJabama(jabamaPage(), 'https://jabama.events/events/42');
  const b = parseDavvvat(davvvatPage({ ticketPrice: { isFree: true }, description: 'ignored' }), davvvatUrl);
  b.description = 'توضیح کامل\n\nخط دوم <script>window.pwned=1</script>';
  const stores = [{ place_id: 'one', name: 'کافه یک', address: 'تهران', categories: ['cafe'], tags: [], photos: [], reviews: [] }];
  await writeFile(path.join(out, 'stores.json'), JSON.stringify(stores));
  await writeFile(path.join(eventsOut, 'events.json'), JSON.stringify([a, b]));
  await writeFile(path.join(eventsOut, 'events.csv'), '\uFEFF"event_id"\r\n"jabama:42"\r\n');
  const server = await createViewerServer(out, eventsOut);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; let browser;
  try {
    assert.equal((await (await fetch(origin + '/api/events/meta')).json()).total, 2);
    assert.equal((await fetch(origin + '/api/events/missing')).status, 404);
    assert.equal((await fetch(origin + '/download/events/../package.json')).status, 404);
    assert.equal((await (await fetch(origin + '/api/events/' + encodeURIComponent(b.event_id))).json()).raw_event.future_unknown, 'preserved');
    assert.match(await (await fetch(origin + '/download/events/events.csv')).text(), /jabama:42/);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://images.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#61865f"/></svg>' }));
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelectorAll('.event-card').length === 2);
    await page.getByRole('combobox', { name: 'منبع', exact: true }).selectOption('davvvat');
    await page.waitForFunction(() => document.querySelectorAll('.event-card').length === 1);
    await page.getByRole('checkbox', { name: 'رایگان', exact: true }).check();
    await page.getByRole('link', { name: 'مشاهده جزئیات نمایشگاه هنر', exact: true }).click();
    await page.locator('#store-dialog').getByRole('heading', { name: 'نمایشگاه هنر', exact: true }).waitFor();
    assert.equal(await page.locator('.gallery-thumb').count(), 2);
    assert.match(await page.locator('.event-description').textContent(), /<script>/);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await page.getByRole('button', { name: 'نمایش بزرگ عکس', exact: true }).click();
    await page.keyboard.press('ArrowLeft'); assert.match(await page.locator('#lightbox-image img').getAttribute('src'), /b\.webp$/);
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'بستن جزئیات', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('event'), null);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('combobox', { name: 'دسته‌بندی', exact: true }).selectOption('exhibition');
    await page.getByRole('link', { name: 'مشاهده جزئیات نمایشگاه هنر', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('link', { name: 'مشاهده جزئیات نمایشگاه هنر', exact: true }).click();
    await page.locator('#store-dialog').getByRole('heading', { name: 'نمایشگاه هنر', exact: true }).waitFor();
    assert.equal(await page.locator('#store-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
    await page.getByText('تمام داده‌های این رویداد', { exact: true }).click();
    assert.match(await page.locator('.raw-details pre').textContent(), /future_unknown/);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'مکان‌ها', exact: true }).click();
    await page.getByRole('link', { name: 'مشاهده جزئیات کافه یک', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await writeFile(path.join(eventsOut, 'events.json'), JSON.stringify([a, b, { ...b, event_id: 'davvvat:new', source_id: 'new' }]));
    assert.equal((await (await fetch(origin + '/api/events/meta')).json()).total, 3);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(out, { recursive: true, force: true });
  }
});
