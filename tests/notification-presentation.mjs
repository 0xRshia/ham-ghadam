import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = file => ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const navigation = dataModule(compile("lib/mansha-navigation.ts"));
const source = compile("lib/notification-presentation.ts").replace('"./mansha-navigation"', JSON.stringify(navigation));
const { notificationGroup, notificationDestination } = await import(dataModule(source));

for (const [kind, group] of Object.entries({ booking: "tickets", reminder: "tickets", organizer: "organizer", collection: "collection", favorite: "favorite", newsletter: "events", future_kind: "other" })) {
  assert.equal(notificationGroup(kind), group);
}
const destination = (kind, href) => notificationDestination({ kind, href });
assert.equal(destination("booking", "/reservations?booked=reservation-1"), "/reservations/reservation-1");
assert.equal(destination("booking", "/reservations?booked=a%2Fb"), "/reservations/a%2Fb");
assert.equal(destination("reminder", "/reservations/reservation-1"), "/reservations/reservation-1");
assert.equal(destination("organizer", "/events/event-1"), "/events/event-1", "Organizer event alerts open the event, not an unrelated profile");
assert.equal(destination("collection", "/collections/collection-1"), "/collections/collection-1");
assert.equal(destination("newsletter", "/events?view=all"), "/events?view=all");
assert.equal(destination("future_kind", "/organizers/person-1"), "/organizers/person-1");
const sellerOrderPath = "/menu/mansha/seller/0f6c7de0-9ea3-4972-a879-20a7e2ed1242";
assert.equal(destination("mansha_order", sellerOrderPath), sellerOrderPath);
assert.equal(destination("booking", sellerOrderPath), null);
for (const href of ["/menu/mansha", "/events/event-1", "/menu/mansha/seller/42", `${sellerOrderPath}?x=1`, `${sellerOrderPath}#print`, `${sellerOrderPath}\n`, `${sellerOrderPath}/`, `https://hmghadam.local${sellerOrderPath}`]) {
  assert.equal(destination("mansha_order", href), null, "Seller order notifications accept only an exact UUID slip path");
}
for (const href of ["https://example.com/events/1", "//example.com/events/1", "/\\example.com/events/1", "javascript:alert(1)", "", "/api/profile", "/events/../../api/profile"]) {
  assert.equal(destination("organizer", href), null, `Reject unsupported destination: ${href}`);
}
console.log("PASS notification categories, related destinations, purchased-ticket links and unsupported URLs");
