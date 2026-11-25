import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { get } from "node:http";

export async function testGameEntryHosts(base) {
  const request = (host, path) => new Promise((resolve, reject) => {
    get(new URL(path, base), { headers: { host }, signal: AbortSignal.timeout(10000) }, response => {
      response.resume();
      resolve([response.statusCode, response.headers.location]);
    }).on("error", reject);
  });
  const query = "?ref=one&code=%2Fa%2Bb&ref=two&blank=";
  const game = "https://game.hmghadam.com/game";
  for (const host of ["app.hmghadam.com", "stage.hmghadam.com"]) {
    for (const path of ["/game", "/play/squirrel"]) {
      assert.deepEqual(await request(host, path + query), [307, game + query]);
      assert.deepEqual(await request(host, path + "/" + query), [308, path + query]);
    }
    assert.deepEqual(await request(host, "/game/reward/receive"), [200, undefined]);
    assert.deepEqual(await request(host, "/game/squirrel.webmanifest"), [200, undefined]);
  }
  for (const host of ["game.hmghadam.com", "localhost", "example.org"]) {
    assert.deepEqual(await request(host, "/game" + query), [200, undefined]);
  }
  console.log("PASS game entry hosts, duplicate query parameters and account routes");
}

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
