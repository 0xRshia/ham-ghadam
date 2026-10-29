import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import sharp from 'sharp';
import { hashPassword } from '../lib/passwords.ts';

const origin = 'http://localhost:9090';
const directory = await mkdtemp(join(tmpdir(), 'hg-blog-integration-'));
const password = randomBytes(24).toString('base64url');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '9090', '--hostname', '127.0.0.1'], {
  cwd: resolve('.'), env: { ...process.env, NODE_ENV: 'production', BLOG_ORIGIN: origin, BLOG_DATA_DIR: directory, BLOG_ADMIN_USERNAME: 'test-admin', BLOG_ADMIN_PASSWORD_HASH: await hashPassword(password) }, stdio: ['ignore','pipe','pipe'],
});
let output = '';
server.stdout.on('data', value => { output += value; });
server.stderr.on('data', value => { output += value; });
let cookie = '';
async function call(path, { method = 'GET', body, auth = true, source = origin, raw, type } = {}) {
  const headers = { ...(auth && cookie ? { cookie } : {}), ...(source ? { origin: source } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(type ? { 'content-type': type } : {}) };
  return fetch(origin + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual' });
}
async function ok(path, options) {
  const response = await call(path, options);
  assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
  return response.json();
}
const base = { kind: 'article', slug: 'integration-article', title: 'آزمون واقعی انتشار مقاله', excerpt: 'خلاصهٔ مقاله برای آزمون سئوی فارسی', body: '## بخش اصلی\n\nمتن مقاله از سرور دریافت می‌شود. **آزمون یکپارچگی**\n\n<script>window.injection=true</script>', author: 'نویسندهٔ آزمون', category: 'آزمون', coverImage: '', coverAlt: '', seoTitle: 'عنوان سئوی اختصاصی آزمون', seoDescription: 'توضیح اختصاصی سئوی این مقاله برای آزمون', canonicalUrl: '', ogTitle: 'عنوان اجتماعی', ogDescription: 'توضیح اجتماعی', ogImage: '', noIndex: false, featured: true, status: 'draft', publishedAt: '' };

try {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch {}
    if (attempt === 149) throw new Error(`Server readiness timeout: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal((await call('/api/admin/content', { auth: false })).status, 401);
  assert.equal((await call('/api/admin/posts', { method: 'POST', body: {post:base}, auth: false })).status, 401);
  for (const source of ['', 'https://foreign.invalid']) assert.equal((await call('/api/admin/session', { method:'POST',body:{username:'test-admin',password},source })).status, 403);
  assert.equal((await call('/api/admin/session', { method:'POST',body:{username:'test-admin',password:'wrong'} })).status, 401);
  const login = await call('/api/admin/session', { method:'POST',body:{username:'test-admin',password} });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.doesNotMatch(login.headers.get('set-cookie'), /Domain=/i);
  const thirdLogin = await call('/api/admin/session', { method:'POST',body:{username:'test-admin',password:'wrong'} });
  assert.equal(thirdLogin.status, 401);
  const blockedLogin = await call('/api/admin/session', { method:'POST',body:{username:'test-admin',password} });
  assert.equal(blockedLogin.status, 429);
  assert.equal(blockedLogin.headers.get('set-cookie'), null);
  assert.match((await blockedLogin.json()).error, /یک‌ساعته/);
  // The optional browser check also signs in; give that independent test a fresh window.
  if (process.argv.includes('--browser')) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(directory, 'blog.sqlite'));
    try { db.exec('DELETE FROM login_limits'); } finally { db.close(); }
  }
  let { post } = await ok('/api/admin/posts', {method:'POST',body:{post:base}});
  assert.equal((await call('/blog/' + post.slug, {auth:false})).status,404);
  assert.equal((await call('/admin/preview/' + post.id, {auth:false})).status,307);
  const preview = await call('/admin/preview/' + post.id);
  assert.equal(preview.status,200);
  assert.match(preview.headers.get('x-robots-tag'),/noindex/);
  assert.ok(!(await (await call('/sitemap.xml', {auth:false})).text()).includes(post.slug));
  const bytes = await sharp({create:{width:1200,height:750,channels:3,background:'#f07f46'}}).png().toBuffer();
  const media = await ok('/api/admin/media', {method:'POST',raw:bytes,type:'image/png'});
  assert.equal((await call(media.url,{auth:false})).status,404);
  assert.equal((await call(media.url)).status,200);
  assert.equal((await call('/api/admin/media',{method:'POST',raw:Buffer.from('<svg/>'),type:'image/svg+xml'})).status,415);
  const inlineMedia = await ok('/api/admin/media', {method:'POST',raw:bytes,type:'image/png'});
  post = (await ok('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,coverImage:media.url,coverAlt:'تصویر نارنجی آزمون',body:post.body+'\n\n![تصویر داخل متن آزمون]('+inlineMedia.url+')'}}})).post;
  assert.equal(post.status,'draft');
  const savedPreview = await call('/admin/preview/'+post.id);
  assert.equal(savedPreview.status,200);
  assert.match(savedPreview.headers.get('x-robots-tag'),/noindex/);
  const savedPreviewHtml = await savedPreview.text();
  assert.ok(savedPreviewHtml.includes('src="'+media.url+'"'), 'saved draft preview includes its uploaded cover');
  assert.ok(savedPreviewHtml.includes('src="'+inlineMedia.url+'"'), 'saved draft preview includes its uploaded Markdown image');
  assert.ok(savedPreviewHtml.includes('متن مقاله از سرور دریافت می‌شود.'));
  for (const image of [media,inlineMedia]) {
    const authorizedImage = await call(image.url);
    assert.equal(authorizedImage.status,200);
    assert.equal(authorizedImage.headers.get('content-type'),'image/webp');
    assert.equal((await call(image.url,{auth:false})).status,404);
  }
  assert.equal((await call('/admin/preview/'+post.id,{auth:false})).status,307);
  assert.equal((await call('/blog/'+post.slug,{auth:false})).status,404);
  post = (await ok('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,status:'published'}}})).post;
  const publicResponse = await call('/blog/'+post.slug,{auth:false});
  assert.equal(publicResponse.status,200);
  const html = await publicResponse.text();
  assert.ok(html.includes('<h1>'+post.title+'</h1>'));
  assert.ok(html.includes('متن مقاله از سرور دریافت می‌شود.'));
  assert.ok(html.includes('<title>'+post.seoTitle+'</title>'));
  assert.ok(html.includes('name="description" content="'+post.seoDescription+'"'));
  assert.ok(html.includes('rel="canonical" href="'+origin+'/blog/'+post.slug+'"'));
  assert.ok(html.includes('lang="fa" dir="rtl"'));
  assert.ok(!html.includes('<script>window.injection=true</script>'));
  assert.ok(html.includes('src="'+inlineMedia.url+'"'), 'published article retains the inline image from its saved draft');
  const structured = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match=>JSON.parse(match[1]));
  assert.ok(structured.some(item => item['@graph']?.some(node => node['@type']==='BlogPosting' && node.headline === post.title)));
  assert.equal((await call(media.url,{auth:false})).status,200);
  assert.equal((await call(inlineMedia.url,{auth:false})).status,200);
  assert.equal((await call('/_next/image?url='+encodeURIComponent(media.url)+'&w=640&q=75',{auth:false})).status,404);
  assert.ok((await (await call('/sitemap.xml',{auth:false})).text()).includes(post.slug));
  assert.equal((await call('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,version:1}}})).status,409);
  assert.equal((await call('/api/admin/posts/'+post.id,{method:'PUT',body:{post},source:'https://foreign.invalid'})).status,403);
  const oldSlug = post.slug;
  post = (await ok('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,slug:'renamed-article'}}})).post;
  const moved = await call('/blog/'+oldSlug,{auth:false});
  assert.equal(moved.status,308);
  assert.equal(moved.headers.get('location'),'/blog/renamed-article');
  post = (await ok('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,noIndex:true}}})).post;
  assert.ok(!(await (await call('/sitemap.xml',{auth:false})).text()).includes(post.slug));
  assert.match(await (await call('/blog/'+post.slug,{auth:false})).text(),/name="robots" content="noindex/);
  post = (await ok('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,noIndex:false,status:'draft'}}})).post;
  assert.equal((await call('/blog/'+post.slug,{auth:false})).status,404);
  assert.equal((await call('/blog/'+oldSlug,{auth:false})).status,404);
  assert.equal((await call(media.url,{auth:false})).status,404);
  assert.equal((await call(inlineMedia.url,{auth:false})).status,404);
  assert.equal((await call('/_next/image?url='+encodeURIComponent(media.url)+'&w=640&q=75',{auth:false})).status,404);
  const scheduled = (await ok('/api/admin/posts',{method:'POST',body:{post:{...base,slug:'future-article',status:'published',publishedAt:new Date(Date.now()+86400000).toISOString()}}})).post;
  assert.equal((await call('/blog/'+scheduled.slug,{auth:false})).status,404);
  const pagePost = (await ok('/api/admin/posts',{method:'POST',body:{post:{...base,kind:'page',slug:'about-test',title:'دربارهٔ آزمون',status:'published'}}})).post;
  assert.equal((await call('/pages/'+pagePost.slug,{auth:false})).status,200);
  let {settings} = await ok('/api/admin/content');
  const settingsBefore = settings;
  settings = (await ok('/api/admin/settings',{method:'PUT',body:{settings:{...settings,heroTitle:'عنوان جدید صفحهٔ اصلی',seoTitle:'سئوی جدید خانه',googleVerification:'example-verification-token'}}})).settings;
  const home = await (await call('/',{auth:false})).text();
  assert.ok(home.includes('<h1>عنوان جدید صفحهٔ اصلی</h1>'));
  assert.ok(home.includes('<title>سئوی جدید خانه</title>'));
  assert.ok(home.includes('name="google-site-verification" content="example-verification-token"'));
  assert.equal((await call('/api/admin/settings',{method:'PUT',body:{settings:settingsBefore}})).status,409);
  await ok('/api/admin/settings',{method:'PUT',body:{settings:{...settingsBefore,version:settings.version}}});
  const search = await (await call('/blog?q=hello',{auth:false})).text();
  assert.match(search,/name="robots" content="noindex/);
  assert.equal((await call('/blog?page=9999',{auth:false})).status,404);
  assert.match(await (await call('/robots.txt',{auth:false})).text(),/Sitemap: http:\/\/localhost:9090\/sitemap.xml/);
  assert.equal((await call('/this-page-does-not-exist',{auth:false})).status,404);
  post = (await ok('/api/admin/posts/'+post.id,{method:'PUT',body:{post:{...post,status:'published'}}})).post;
  console.log('PASS HTTP: username/password, CSRF, CRUD, conflicts, SSR, SEO, redirects, draft/scheduled privacy, images, pages, homepage and sitemap.');
  if (process.argv.includes('--browser')) {
    const {runBrowser} = await import('./browser.mjs');
    await runBrowser({origin,username:'test-admin',password,post,bytes});
  }
  for (const item of [post,scheduled,pagePost]) {
    const latest = (await ok('/api/admin/content')).posts.find(p=>p.id===item.id);
    if (latest) await ok('/api/admin/posts/'+item.id,{method:'DELETE',body:{version:latest.version}});
  }
  await ok('/api/admin/session',{method:'DELETE'});
  assert.equal((await call('/api/admin/content')).status,401);
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/integration.json',JSON.stringify({passed:true,browser:process.argv.includes('--browser'),time:new Date().toISOString()},null,2));
} catch (error) { console.error(output); throw error; }
finally {
  server.kill('SIGTERM');
  if (server.exitCode===null) await once(server,'exit');
  await rm(directory,{recursive:true,force:true});
}
