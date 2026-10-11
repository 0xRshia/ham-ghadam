import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function testDocumentation({ base }) {
  const request = pathname => fetch(new URL(pathname, base), { signal: AbortSignal.timeout(10000) });
  const page = await request("/docs");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /مستندات API هم‌قدم/);
  assert(!html.includes("site-header"), "Swagger must be isolated from the application shell");
  const response = await request("/docs/openapi.json");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), JSON.parse(await readFile("docs/openapi.json", "utf8")), "Published schema must match the checked-in contract");
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/docs\/[^" ]+\.(?:js|css))"/g)) {
    const result = await request(asset);
    assert.equal(result.status, 200, `Documentation asset missing: ${asset}`);
    assert.match(result.headers.get("content-type"), asset.endsWith(".css") ? /text\/css/ : /(?:javascript|ecmascript)/);
    assert.equal(await result.text(), await readFile(`public${asset}`, "utf8"));
  }
  assert.equal((await request("/docs/swagger/LICENSE")).status, 200);
  assert.equal((await request("/docs/swagger/NOTICE")).status, 200);
  const home = await request("/");
  assert.equal(home.status, 200, "Application root must still be served");
  await home.text();
  console.log("PASS Persian /docs, OpenAPI, self-hosted Swagger assets and application root");
}
