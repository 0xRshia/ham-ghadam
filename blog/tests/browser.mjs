import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

export async function runBrowser({origin,username,password,post,bytes}) {
  const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
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
    await page.getByLabel('متن',{exact:true}).fill('## عنوان بخش\n\nاین متن در مرورگر نوشته و ذخیره شده است.');
    await page.getByRole('button',{name:'ذخیرهٔ پیش‌نویس',exact:true}).click();
    await page.getByRole('status').filter({hasText:'پیش‌نویس ذخیره شد.'}).waitFor();
    assert.equal((await page.request.get(origin+'/blog/browser-created')).status(),404);
    await page.getByLabel('بارگذاری تصویر شاخص',{exact:true}).setInputFiles({name:'test.png',mimeType:'image/png',buffer:bytes});
    await page.locator('.admin-image-preview').first().waitFor();
    await page.getByLabel('متن جایگزین تصویر *',{exact:true}).fill('تصویر آزمون رابط مدیریت');
    await page.getByRole('button',{name:'تنظیم انتشار برای همین حالا',exact:true}).click();
    await page.getByLabel('نویسنده *',{exact:true}).fill('مدیر آزمون');
    await page.getByRole('button',{name:'ذخیره و انتشار',exact:true}).click();
    await page.getByRole('status').filter({hasText:'نوشته ذخیره شد'}).waitFor();
    assert.equal((await page.request.get(origin+'/blog/browser-created')).status(),200);
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
    console.log('PASS browser: RTL/responsive 320/375/768/1440, login, draft save, image upload, publish, homepage editing, logout, no JS errors.');
  } catch(error) { await page.screenshot({path:'test-results/browser-failure.png',fullPage:true}); console.error(await page.locator('body').innerText()); throw error; }
  finally {await browser.close();}
}
