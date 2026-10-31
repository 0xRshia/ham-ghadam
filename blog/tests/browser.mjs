import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

export async function runBrowser({origin,username,password,post,bytes}) {
  const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
  const context = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tehran'});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await mkdir('test-results',{recursive:true});
  async function shot(name) {
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:`test-results/${name}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: horizontal overflow`);
  }
  try {
    await page.goto(origin);
    await shot('home-desktop');
    await page.goto(origin+'/blog/'+post.slug);
    await page.getByRole('heading',{level:1,name:post.title}).waitFor();
    assert.equal(await page.evaluate(()=>window.injection),undefined);
    await shot('article-desktop');
    for (const width of [320,375,768]) {
      await page.setViewportSize({width,height:900});
      await page.goto(origin);
      await shot(`home-${width}`);
      await page.goto(origin+'/blog/'+post.slug);
      await shot(`article-${width}`);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/admin');
    await page.getByLabel('نام کاربری',{exact:true}).fill(username);
    await page.getByLabel('رمز عبور',{exact:true}).fill(password);
    await page.getByRole('button',{name:'ورود به پنل',exact:true}).click();
    await page.getByRole('heading',{name:'مدیریت محتوا',exact:true}).waitFor();
    await page.getByRole('button',{name:'نوشته تازه',exact:true}).click();
    await page.getByLabel('عنوان *',{exact:true}).fill('نوشتهٔ ساخته‌شده در مرورگر');
    await page.getByLabel('نشانی کوتاه (Slug) *',{exact:true}).fill('browser-created');
    await page.getByLabel('خلاصه',{exact:true}).fill('این نوشته فقط در پایگاه آزمون محلی ذخیره می‌شود.');
    const bodyInput = page.getByLabel('متن',{exact:true});
    await bodyInput.fill('## عنوان بخش\n\nاین متن در مرورگر نوشته و ذخیره شده است.');
    await page.getByRole('button',{name:'ذخیرهٔ پیش‌نویس',exact:true}).click();
    await page.getByRole('status').filter({hasText:'پیش‌نویس ذخیره شد.'}).waitFor();
    assert.equal((await page.request.get(origin+'/blog/browser-created')).status(),404);
    await page.getByLabel('بارگذاری تصویر شاخص',{exact:true}).setInputFiles({name:'test.png',mimeType:'image/png',buffer:bytes});
    await page.locator('.admin-image-preview').first().waitFor();
    await page.getByLabel('متن جایگزین تصویر *',{exact:true}).fill('تصویر آزمون رابط مدیریت');
    const disabledPreview = page.getByRole('button',{name:'پیش‌نمایش نسخهٔ ذخیره‌شده',exact:true});
    assert.equal(await disabledPreview.isDisabled(),true,'unsaved uploaded image cannot open an outdated saved preview');
    const previewHintId = await disabledPreview.getAttribute('aria-describedby');
    assert.ok(previewHintId,'disabled saved preview explains how to include recent changes');
    assert.match(await page.locator('[id="'+previewHintId+'"]').innerText(),/ذخیره/);
    await bodyInput.press('ControlOrMeta+End');
    await page.getByLabel('بارگذاری تصویر در متن',{exact:true}).setInputFiles({name:'inline.png',mimeType:'image/png',buffer:bytes});
    await page.waitForFunction(() => /!\[[^\]]*\]\(\/media\/[a-f0-9-]+\.webp\)/.test(document.querySelector('.admin-body-input')?.value || ''));
    const inlineUrl = (await bodyInput.inputValue()).match(/!\[[^\]]*\]\((\/media\/[a-f0-9-]+\.webp)\)/)?.[1];
    assert.ok(inlineUrl,'uploaded inline image is inserted into the draft body');
    const draftSaved = page.waitForResponse(response=>response.url().includes('/api/admin/posts/') && response.request().method()==='PUT');
    await page.getByRole('button',{name:'ذخیرهٔ پیش‌نویس',exact:true}).click();
    assert.equal((await draftSaved).status(),200);
    const savedPreviewLink = page.getByRole('link',{name:'پیش‌نمایش نسخهٔ ذخیره‌شده',exact:true});
    await savedPreviewLink.waitFor();
    assert.equal((await page.request.get(origin+'/blog/browser-created')).status(),404,'saving preview media does not publish the draft');
    const [draftPreview] = await Promise.all([context.waitForEvent('page'),savedPreviewLink.click()]);
    try {
      await draftPreview.waitForLoadState('domcontentloaded');
      await draftPreview.getByRole('heading',{level:1,name:'نوشتهٔ ساخته‌شده در مرورگر'}).waitFor();
      const cover = draftPreview.locator('.admin-preview-cover');
      assert.equal(await cover.getAttribute('alt'),'تصویر آزمون رابط مدیریت');
      assert.ok(await cover.evaluate(async image=>{await image.decode(); return image.naturalWidth > 0;}),'saved draft cover loads in the authenticated preview');
      const inline = draftPreview.locator('.admin-markdown img');
      assert.equal(await inline.getAttribute('src'),inlineUrl);
      assert.ok(await inline.evaluate(async image=>{await image.decode(); return image.naturalWidth > 0;}),'saved draft inline image loads in the authenticated preview');
      assert.ok((await draftPreview.locator('article').innerText()).includes('این متن در مرورگر نوشته و ذخیره شده است.'));
      await draftPreview.screenshot({path:'test-results/admin-saved-preview-images.png',fullPage:true});
    } finally {await draftPreview.close();}
    // A device ahead of the server must neither mislabel a schedule nor delay "publish now".
    await page.clock.setFixedTime(new Date(Date.now()+3*86400000));
    const future = new Date(Date.now()+86400000);
    future.setUTCSeconds(0,0);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(future).map(part=>[part.type,part.value]));
    await page.getByRole('combobox',{name:/^وضعیت/}).selectOption('published');
    await page.getByLabel('زمان انتشار',{exact:true}).fill(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
    await page.getByLabel('نویسنده *',{exact:true}).fill('مدیر آزمون');
    const scheduleSaved = page.waitForResponse(response=>response.url().includes('/api/admin/posts/') && response.request().method()==='PUT');
    await page.getByRole('button',{name:'ذخیره و انتشار',exact:true}).click();
    const scheduled = await (await scheduleSaved).json();
    assert.equal(scheduled.post.publishedAt,future.toISOString(),'Tehran input round-trips to the intended UTC publication time');
    await page.getByRole('status').filter({hasText:'زمان‌بندی شد'}).waitFor();
    await page.getByText('نسخهٔ ذخیره‌شده: زمان‌بندی‌شده',{exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'نشانی عمومی',exact:true}).count(),0,'scheduled content has no premature public link');
    assert.equal((await page.request.get(origin+'/blog/browser-created')).status(),404);
    await shot('admin-scheduled-desktop');
    await page.setViewportSize({width:375,height:900});
    await shot('admin-scheduled-mobile');
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'بازگشت به فهرست',exact:true}).click();
    await page.getByRole('combobox',{name:/^وضعیت/}).selectOption('scheduled');
    const scheduledRow = page.locator('.admin-post-row').filter({hasText:'نوشتهٔ ساخته‌شده در مرورگر'});
    await scheduledRow.getByText('زمان‌بندی‌شده',{exact:true}).waitFor();
    await scheduledRow.getByRole('button',{name:'ویرایش',exact:true}).click();
    await page.getByRole('button',{name:'تنظیم انتشار برای همین حالا',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'پیش‌نمایش نسخهٔ ذخیره‌شده',exact:true}).isDisabled(),true,'immediate publication intent is an unsaved change');
    const publishSaved = page.waitForResponse(response=>response.url().includes('/api/admin/posts/') && response.request().method()==='PUT');
    await page.getByRole('button',{name:'ذخیره و انتشار',exact:true}).click();
    const published = await (await publishSaved).json();
    assert.ok(Date.parse(published.post.publishedAt)<=Date.parse(published.serverTime),'publish now uses server time despite the advanced device clock');
    await page.getByRole('status').filter({hasText:'نوشته ذخیره شد'}).waitFor();
    await page.getByRole('link',{name:'نشانی عمومی',exact:true}).waitFor();
    assert.equal((await page.request.get(origin+'/blog/browser-created')).status(),200);
    await page.getByLabel('نشانی کوتاه (Slug) *',{exact:true}).fill('unsaved-slug');
    assert.equal(await page.getByRole('link',{name:'نشانی عمومی',exact:true}).count(),0,'unsaved slug does not create a broken public link');
    await page.getByLabel('نشانی کوتاه (Slug) *',{exact:true}).fill('browser-created');
    await page.getByRole('link',{name:'نشانی عمومی',exact:true}).waitFor();
    await shot('admin-editor-desktop');
    await page.setViewportSize({width:375,height:900});
    await shot('admin-editor-mobile');
    await page.getByRole('button',{name:'صفحهٔ اصلی و سئو',exact:true}).click();
    await page.getByLabel('عنوان اصلی صفحه *',{exact:true}).fill('خانهٔ ویرایش‌شده از پنل مدیریت');
    await page.getByRole('button',{name:'ذخیرهٔ صفحهٔ اصلی',exact:true}).click();
    await page.getByRole('status').filter({hasText:'صفحهٔ اصلی و تنظیمات سایت ذخیره شد.'}).waitFor();
    const publishedHome = await page.request.get(origin);
    assert.ok((await publishedHome.text()).includes('خانهٔ ویرایش‌شده از پنل مدیریت'));
    await shot('admin-home-mobile');
    await page.getByRole('button',{name:'خروج',exact:true}).click();
    await page.getByRole('button',{name:'ورود به پنل',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS browser: RTL/responsive 320/375/768/1440, login, draft save, unsaved-preview guard, cover/inline images in private saved preview, Tehran scheduling, scheduled status/filter, clock-skew-safe immediate publishing, saved public links, homepage editing, logout, no JS errors.');
  } catch(error) { await page.screenshot({path:'test-results/browser-failure.png',fullPage:true}); console.error(await page.locator('body').innerText()); throw error; }
  finally {await browser.close();}
}
