import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { chromium } from 'playwright';
import { buildCatalogue, galleryImages, normalizeSearch, searchCatalogue } from '../dist/viewer-data.js';
import { createViewerServer } from '../dist/viewer.js';

function venue(id, name, categories = ['restaurant']) {
  return { place_id: id, name, address: 'تهران، میدان ولیعصر', categories, tags: [], latitude: 35.7, longitude: 51.4,
    source_url: `https://invara.top/places/${id}`, fetched_at: '2026-10-25T12:00:00.000Z', price_level: null,
    cover_image_url: null, menu_url: null, nearest_metro: null, photos: [], reviews: [], review_pages: 1,
    reviews_complete: true, raw_place: { place_id: id, unknown_field: 'preserve me' }, raw_listing: {},
    page: { title: name, name, text: '', links: [], photos: [], meta: {} }, warnings: [] };
}

test('viewer search normalizes Persian/Arabic letters, diacritics and digits, combines filters, and bounds pagination', () => {
  assert.equal(normalizeSearch('  كافِه يَک ۱۲٣  '), 'کافه یک 123');
  const catalogue = buildCatalogue([venue('cafe', 'کافه‌یک', ['cafe']), venue('meal', 'رستوران', ['restaurant'])]);
  const result = searchCatalogue(catalogue, new URLSearchParams({ q: 'كافه يك', category: 'cafe' }));
  assert.equal(result.total, 1);
  assert.equal(result.items[0].place_id, 'cafe');
  assert.equal(searchCatalogue(catalogue, new URLSearchParams({ q: 'کافهیک' })).total, 1);
  assert.equal(searchCatalogue(catalogue, new URLSearchParams({ category: 'restaurant', q: 'کافه' })).total, 0);
  assert.equal(searchCatalogue(catalogue, new URLSearchParams({ limit: '1', page: '99' })).page, 2);
  assert.throws(() => searchCatalogue(catalogue, new URLSearchParams({ limit: '500' })), /معتبر/);
  assert.throws(() => searchCatalogue(catalogue, new URLSearchParams({ category: 'missing' })), /پیدا نشد/);
});

test('viewer gallery groups original/thumbnail variants, retains distinct query images, and ignores unsafe URLs', () => {
  const make = (url, role = 'original') => ({ url, role, kind: 'venue', review_id: null, place_id: 'cafe', position: 0, raw: url });
  const gallery = galleryImages([make('https://images.example.test/a_thumb.webp', 'cover'), make('https://images.example.test/a.webp'),
    make('https://images.example.test/b.webp?id=1'), make('https://images.example.test/b.webp?id=2'), make('javascript:alert(1)')]);
  assert.equal(gallery.length, 3);
  assert.equal(gallery[0].url, 'https://images.example.test/a.webp');
  assert.equal(gallery[0].thumbnail_url, 'https://images.example.test/a_thumb.webp');
});

test('local viewer serves real data, searches/filters/pages, opens details and galleries, handles empty results, and fits mobile', { timeout: 90000 }, async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'invara-viewer-test-'));
  const cafe = venue('cafe-one', 'کافه یک', ['cafe', 'food']);
  cafe.cover_image_url = 'https://images.example.test/a_thumb.webp';
  cafe.photos = ['a.webp', 'a_thumb.webp', 'b.webp'].map((file, position) => ({ place_id: cafe.place_id, review_id: null, kind: 'venue', role: file.includes('_thumb') ? 'cover' : 'original', position, url: `https://images.example.test/${file}`, raw: file }));
  cafe.tags = [{ kind: 'tag', code: 'cozy', label_fa: 'فضای دنج' }];
  cafe.reviews = [{ id: 1, body: '<script>window.pwned=1</script> نظر کامل', reaction: 'liked', author: { first_name: 'کاربر آزمایشی' }, created_at: cafe.fetched_at, images: [] }];
  const stores = [cafe, ...Array.from({ length: 42 }, (_, index) => venue(`restaurant-${index}`, `رستوران ${index}`)), venue('html-name', '<img src=x onerror="window.pwned=1">', ['store'])];
  await writeFile(path.join(out, 'stores.json'), JSON.stringify(stores));
  await writeFile(path.join(out, 'stores.csv'), '\uFEFF"name"\r\n"کافه یک"\r\n');
  await writeFile(path.join(out, 'run-report.json'), JSON.stringify({ exported_at: cafe.fetched_at }));
  const server = await createViewerServer(out);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const meta = await (await fetch(origin + '/api/meta')).json();
    assert.equal(meta.total, 44);
    assert.equal(meta.categories.find(category => category.code === 'restaurant').count, 42);
    const list = await (await fetch(origin + '/api/stores?q=' + encodeURIComponent('كافه يك') + '&category=cafe')).json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].photo_count, 2);
    assert.ok(!('raw_place' in list.items[0]));
    assert.equal((await fetch(origin + '/api/stores/missing')).status, 404);
    assert.equal((await fetch(origin + '/download/%2e%2e%2fpackage.json')).status, 404);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(origin + '/api/meta', { headers: { Host: 'unrelated.example' } }, response => {
        response.resume(); resolve(response.statusCode);
      });
      request.on('error', reject); request.end();
    });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await fetch(origin + '/api/stores', { method: 'POST' })).status, 405);
    const download = await fetch(origin + '/api/stores/cafe-one?download=1');
    assert.match(download.headers.get('content-disposition'), /attachment/);
    assert.deepEqual((await download.json()).raw_place, cafe.raw_place);
    assert.ok((await (await fetch(origin + '/download/stores.csv')).text()).includes('کافه یک'));

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://images.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#9ba987"/></svg>' }));
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('#results').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.store-card').count(), 36);
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    await page.getByRole('button', { name: 'صفحه بعدی', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2' && document.querySelector('#results').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.store-card').count(), 8);
    assert.equal(await page.locator('.store-card img[src="x"]').count(), 0);
    await page.getByRole('button', { name: /^کافه/ }).click();
    await page.getByRole('link', { name: 'مشاهده جزئیات کافه یک', exact: true }).waitFor();
    assert.equal(await page.locator('.store-card').count(), 1);
    assert.equal(new URL(page.url()).searchParams.get('page'), null);
    await page.getByRole('searchbox').fill('كافه يك');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'كافه يك' && document.querySelector('#results').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.store-card').count(), 1);
    await page.getByRole('link', { name: 'مشاهده جزئیات کافه یک', exact: true }).click();
    await page.locator('#store-dialog').getByRole('heading', { name: 'کافه یک', exact: true }).waitFor();
    assert.ok(await page.locator('#store-dialog').evaluate(dialog => dialog.open));
    assert.equal(await page.locator('.gallery-thumb').count(), 2);
    assert.ok((await page.locator('.review-body').textContent()).includes('<script>'));
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await page.getByRole('button', { name: 'نمایش بزرگ عکس', exact: true }).click();
    assert.ok(await page.locator('#photo-dialog').evaluate(dialog => dialog.open));
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.locator('#lightbox-image img').getAttribute('src'), /b\.webp$/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#photo-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator('#store-dialog').evaluate(dialog => dialog.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#store-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(new URL(page.url()).searchParams.get('store'), null);

    await page.getByRole('link', { name: 'مشاهده جزئیات کافه یک', exact: true }).click();
    await page.locator('#store-dialog').getByRole('heading', { name: 'کافه یک', exact: true }).waitFor();
    await page.getByRole('button', { name: 'بستن جزئیات', exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#results').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#store-dialog').evaluate(dialog => dialog.open), false);
    assert.equal(new URL(page.url()).searchParams.get('store'), null);

    await page.getByRole('searchbox').fill('این مکان وجود ندارد');
    await page.getByRole('heading', { name: 'مکانی پیدا نشد', exact: true }).waitFor();
    await page.getByRole('button', { name: 'پاک کردن فیلترها', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.store-card').length === 36 && document.querySelector('#results').getAttribute('aria-busy') === 'false');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('combobox', { name: 'دسته‌بندی', exact: true }).selectOption('cafe');
    await page.getByRole('link', { name: 'مشاهده جزئیات کافه یک', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('link', { name: 'مشاهده جزئیات کافه یک', exact: true }).click();
    await page.locator('#store-dialog').getByRole('heading', { name: 'کافه یک', exact: true }).waitFor();
    assert.equal(await page.locator('#store-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
    await page.getByText('تمام داده‌های این مکان', { exact: true }).click();
    assert.ok((await page.locator('.raw-details pre').textContent()).includes('preserve me'));
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(out, { recursive: true, force: true });
  }
});
