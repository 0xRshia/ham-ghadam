import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function moduleUrl(file, imports = {}) {
  let source = fs.readFileSync(file, "utf8");
  for (const [specifier, url] of Object.entries(imports)) source = source.replace(`"${specifier}"`, JSON.stringify(url));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}
const { loginDestination } = await import(moduleUrl("lib/login-destination.ts", {
  "./organizer-navigation": moduleUrl("lib/organizer-navigation.ts"),
}));
for (const value of [null, "", "/host", "//evil.example", "https://evil.example", "/account/../host", "/account#host", "/account\\evil", "/events/a?quantity=7", "/events/a?quantity=0"]) {
  assert.equal(loginDestination(value), "/account", `Reject invalid return destination ${value}`);
}
for (const value of ["/account", "/reservations", "/reservations?payment=success&reservation=real-id", "/reservations?booked=real-id", "/events/event-id", "/events/event-id?quantity=6"]) {
  assert.equal(loginDestination(value), value, `Preserve authorized return destination ${value}`);
  assert.equal(loginDestination(value, true), "/host", "Explicit host login opens host tools");
}
const { MAX_ORDER_TOMAN } = await import(moduleUrl("lib/payment-limits.ts"));
const { maxTicketQuantity, requestedTicketQuantity, eventTicketTiers, ticketSelection } = await import(moduleUrl("lib/ticket-selection.ts", {
  "./payment-limits": moduleUrl("lib/payment-limits.ts"),
}));
const free = { remaining: null, price: 0 };
assert.equal(maxTicketQuantity(free), 6);
assert.equal(maxTicketQuantity({ remaining: 2, price: 0 }), 2);
assert.equal(maxTicketQuantity({ remaining: 0, price: 1000 }), 0);
assert.equal(maxTicketQuantity({ remaining: 10, price: MAX_ORDER_TOMAN / 2 }), 2);
assert.equal(maxTicketQuantity({ remaining: null, price: MAX_ORDER_TOMAN + 1 }), 0);
for (const value of [null, "", "0", "7", "-1", "1.5", "NaN", "Infinity", "2abc", "01"]) {
  assert.equal(requestedTicketQuantity(value, free), 0, "No valid login quantity means no selection");
}
for (let quantity = 1; quantity <= 6; quantity++) {
  assert.equal(requestedTicketQuantity(String(quantity), free), quantity);
}
assert.equal(requestedTicketQuantity("6", { remaining: 2, price: 0 }), 2, "Clamp restored quantity to remaining seats");
assert.equal(requestedTicketQuantity("6", { remaining: null, price: MAX_ORDER_TOMAN }), 1, "Clamp restored quantity to payment limit");
assert.equal(requestedTicketQuantity("1", { remaining: 0, price: 0 }), 0, "Sold-out events cannot restore a selection");
const tiers = [{ id: "regular", price: 1000, remaining: 2, active: 1 }, { id: "vip", price: 2000, remaining: 4, active: 1 }];
assert.equal(ticketSelection(tiers, { regular: 1, vip: 2 }, 4).total, 5000);
assert.equal(ticketSelection(tiers, { regular: 1, vip: 2 }, 4).valid, true);
assert.equal(ticketSelection(tiers, { regular: 1, vip: 2 }, 2).valid, false, "Changed event capacity invalidates draft");
assert.equal(ticketSelection(tiers, { regular: 3 }, null).valid, false, "Tier capacity is checked independently");
assert.equal(ticketSelection(tiers, { deleted: 1 }, null).valid, false, "Removed tiers cannot enter checkout");
assert.equal(ticketSelection(tiers, { regular: 0.5 }, null).valid, false);
assert.equal(ticketSelection(tiers, {}, null).valid, false);
assert.equal(ticketSelection([{ ...tiers[0], price: MAX_ORDER_TOMAN }], { regular: 1 }, null).canAdd(tiers[0]), false);
assert.equal(eventTicketTiers({ ticketTiers: [{ ...tiers[0], active: 0 }] }, "عادی").length, 0, "Inactive tiers never become standard tickets");
console.log("PASS account/host login destinations, payment-result returns and checkout quantity limits");
