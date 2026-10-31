import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseOptions, run } from '../dist/cli.js';
import { snapshot } from '../dist/snapshot.js';

test('localhost crawl paginates, deduplicates, retries a failed detail, preserves all review pages, resumes, and exports offline', { timeout: 90000 }, async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'invara-crawler-test-'));
  const requests = [];
  let failedOnce = false;
  const venue = id => ({ place_id: id, name: `مکان ${id}`, address: 'تهران، "آدرس"\nطبقه دوم', latitude: '35.7', longitude: '51.4', categories: ['cafe', 'food'], price_level: 2, cover_image_url: 'https://example.com/a_thumb.webp', photos: ['https://example.com/a.webp'], tags: [{ code: 'cozy', label: 'فضای دنج' }], unknown_field: 'kept' });
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push({ path: url.pathname, search: url.search, referer: request.headers.referer });
    const json = (data, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (url.pathname === '/robots.txt') { response.end('User-agent: *\nAllow: /\nDisallow: /api/\n'); return; }
    if (url.pathname === '/_next/catalog.js') { response.setHeader('content-type', 'application/javascript'); response.end('const food=["FOOD_FILTERS",0,[{code:"pizza",label:"پیتزا"}]]; const tags=["FILTER_TAGS",0,[{code:"cozy",label:"فضای دنج"}]];'); return; }
    if (url.pathname === '/api/v1/places/map-points') {
      if (url.searchParams.get('lat') === '35.59') { json({ detail: 'Outside supported city' }, 409); return; }
      json({ items: ['one', 'two', 'three', 'four', 'map-only'].map(venue) }); return;
    }
    if (url.pathname === '/api/v1/places/search') {
      json({ items: (url.searchParams.get('page') === '2' ? ['two', 'three', 'four'] : ['one', 'two']).map(venue), next_page: url.searchParams.get('page') === '2' ? null : 2 }); return;
    }
    const api = url.pathname.match(/^\/api\/v1\/places\/([^/]+)(\/comments)?$/);
    if (api) {
      const id = api[1];
      if (!api[2]) {
        if (id === 'three' && !failedOnce) { failedOnce = true; json({ detail: 'temporary failure' }, 503); return; }
        json(venue(id)); return;
      }
      const current = Number(url.searchParams.get('page'));
      json({ items: id === 'one' ? [{ id: current, body: current === 1 ? '=1+1' : 'متن کامل\nسطر دوم', reaction: 'liked', dish_tags: ['pizza'], images: current === 2 ? [{ url: 'https://example.com/review.webp', thumbnail_url: 'https://example.com/review_thumb.webp' }] : [] }] : [], next_page: id === 'one' && current === 1 ? 2 : null }); return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (url.pathname === '/explore') {
      if (url.searchParams.get('view') === 'map') {
        response.end('<html><head><script src="/_next/catalog.js"></script></head><body><h1>نقشه</h1><script>fetch("/api/v1/places/map-points"+location.search).then(r=>r.json()).then(data=>document.body.dataset.count=data.items?.length??0);</script></body></html>'); return;
      }
      response.end(`<html lang="fa" dir="rtl"><head><script src="/_next/catalog.js"></script></head><body><div id="list"></div><button id="more">نمایش مکان‌های بیشتر</button><script>
        let page=0;async function load(){const data=await(await fetch('/api/v1/places/search?page='+ ++page)).json();for(const item of data.items){const a=document.createElement('a');a.href='/places/'+item.place_id;a.textContent=item.name;document.querySelector('#list').append(a);}document.querySelector('#more').hidden=!data.next_page;}document.querySelector('#more').onclick=load;load();
      </script></body></html>`); return;
    }
    const id = url.pathname.split('/').at(-1);
    response.end(`<html lang="fa" dir="rtl"><head><script src="/_next/catalog.js"></script></head><body><main></main><script>
      const id=${JSON.stringify(id)};let page=0;
      async function comments(){const data=await(await fetch('/api/v1/places/'+id+'/comments?page='+ ++page+'&scope=all')).json();const section=document.querySelector('#all');let more=section.querySelector(':scope > button');if(more)more.remove();for(const item of data.items){const li=document.createElement('li');li.textContent=item.body;section.querySelector('ul').append(li);}if(data.next_page){more=document.createElement('button');more.textContent='نمایش بیشتر';more.onclick=comments;section.append(more);}}
      (async()=>{const data=await(await fetch('/api/v1/places/'+id)).json();if(!data.place_id)return;document.querySelector('main').innerHTML='<h1>'+data.name+'</h1><div id="place-comments-panel"><section id="all"><h3>همه نظرها</h3><ul></ul></section></div>';comments();})();
    </script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const options = parseOptions(['--origin', origin, '--limit', '3', '--out', out, '--delay-ms', '0', '--timeout-ms', '5000', '--retries', '1']).options;
  try {
    await run(options);
    const bundle = JSON.parse(await readFile(path.join(out, 'invara.json'), 'utf8'));
    assert.equal(bundle.stores.length, 3);
    assert.equal(bundle.report.unique_store_count, 3);
    assert.equal(bundle.report.failed_store_count, 0);
    assert.equal(bundle.stores.find(store => store.place_id === 'one').reviews.length, 2);
    assert.equal(bundle.stores.every(store => store.reviews_complete), true);
    assert.equal(bundle.stores.every(store => store.raw_place.unknown_field === 'kept'), true);
    assert.equal(bundle.stores.flatMap(store => store.photos).filter(photo => photo.kind === 'review').length, 2);
    assert.equal(bundle.taxonomy.some(item => item.kind === 'food' && item.code === 'pizza' && item.filterable), true);
    assert.equal(requests.filter(request => request.path === '/api/v1/places/three').length, 2);
    assert.equal(requests.filter(request => request.path.startsWith('/api/')).every(request => request.referer?.startsWith(origin)), true);
    assert.ok((await readFile(path.join(out, 'reviews.csv'), 'utf8')).includes("'=1+1"));
    const beforeResume = requests.filter(request => request.path.startsWith('/api/')).length;
    await run(options);
    assert.equal(requests.filter(request => request.path.startsWith('/api/')).length, beforeResume);
    const beforeExport = requests.length;
    await run(options, 'export');
    assert.equal(requests.length, beforeExport);
    await assert.rejects(() => run({ ...options, channel: 'not-an-installed-browser' }));
    assert.equal(JSON.parse(await readFile(path.join(out, 'stores.json'), 'utf8')).length, 3);
    for (const name of ['stores', 'photos', 'reviews', 'classifications', 'taxonomy', 'run-report', 'source-responses']) {
      assert.ok((await readFile(path.join(out, name + '.json'), 'utf8')).length > 2);
      assert.ok((await readFile(path.join(out, name + '.csv'), 'utf8')).startsWith('\uFEFF'));
    }
    const fullOut = path.join(out, 'full');
    const fullOptions = parseOptions(['--all', '--workers', '2', '--origin', origin, '--out', fullOut, '--delay-ms', '0', '--timeout-ms', '5000', '--retries', '1']).options;
    await run(fullOptions);
    const full = JSON.parse(await readFile(path.join(fullOut, 'invara.json'), 'utf8'));
    assert.equal(full.stores.length, 5);
    assert.equal(full.report.scope, 'all_public');
    assert.equal(full.report.discovery_complete, true);
    assert.equal(full.report.failed_store_count, 0);
    assert.ok(full.stores.some(store => store.place_id === 'map-only'));
    assert.ok(full.report.discovery_searches.every(search => search.exhausted && !search.error));
    assert.ok(full.report.discovery_searches.length >= 10);
    assert.ok(full.report.discovery_searches.some(search => search.unavailable_reason?.startsWith('HTTP 409:')));
    await snapshot(fullOut);
    const catalog = JSON.parse(await readFile(path.join(fullOut, 'catalog.json'), 'utf8'));
    assert.equal(catalog.length, 5);
    assert.ok(catalog.every(row => row.enrichment_status === 'complete'));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(out, { recursive: true, force: true });
  }
});
