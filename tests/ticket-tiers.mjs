import { localeModuleUrl } from "./locale-module.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const source = fs.readFileSync('lib/ticket-tiers.ts', 'utf8').replace(/^import .*;$/gm, '') + `\nimport { faContent } from ${JSON.stringify(localeModuleUrl)};` + '\nclass ApiError extends Error { constructor(status,message) { super(message); this.status=status; } }';
const { reserveTiersSql, insertReservationItemsSql, readTicketSelection } = await import(compile(source));
const { confirmSql, reserveSql } = await import(compile(fs.readFileSync('lib/booking-sql.ts', 'utf8')));
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const { tag } of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries) db.exec(fs.readFileSync(`drizzle/${tag}.sql`, 'utf8'));
const now = Date.now();
db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('buyer','09121111111','Buyer',now);
db.prepare("INSERT INTO events(id,host_id,title,description,category,venue,address,city,starts_at,ends_at,registration_ends_at,price,capacity,published) VALUES ('event','host','Event','Description','art','Venue','Address','City',?,?,?,1000,6,1)").run(now+3600000,now+7200000,now+1800000);
db.prepare("INSERT INTO event_ticket_tiers VALUES ('regular','event','Regular','',1000,4,1,0),('premium','event','Premium','',3000,2,1,1)").run();
function sql(query, values) {
  const keys = [...new Set(query.match(/\?\d+/g))];
  return db.prepare(query).all(Object.fromEntries(keys.map(key => [key,values[Number(key.slice(1))-1]])));
}
function reserve(id, items, { quantity=items.reduce((sum,item)=>sum+item.quantity,0), total=items.reduce((sum,item)=>sum+item.quantity*(item.tierId==='premium'?3000:1000),0), time=now, expires=now+900000, key=id }={}) {
  const encoded=JSON.stringify(items);
  db.exec('BEGIN');
  try {
    const rows=sql(reserveTiersSql,[id,'buyer','event',quantity,key,time,expires,'Buyer',0,encoded,total]);
    sql(insertReservationItemsSql,[id,encoded]);
    db.exec('COMMIT');return rows[0];
  } catch (error) { db.exec('ROLLBACK');throw error; }
}
assert.throws(()=>reserve('rollback',[{tierId:'regular',quantity:1},{tierId:'regular',quantity:1}]));
assert.equal(db.prepare("SELECT COUNT(*) count FROM reservations WHERE id='rollback'").get().count,0,'A failed item insert rolls back the order');
assert.equal(sql(reserveSql,['legacy-race','buyer','event',1,'legacy-race',now,now+900000,'Buyer',0]).length,0,'Legacy reservation cannot bypass tiers added concurrently');
const selected=[{tierId:'regular',quantity:2},{tierId:'premium',quantity:1}];
const first=reserve('first',selected);
assert.equal(first.total,5000);assert.equal(first.amount_rial,50000);assert.equal(first.quantity,3);
assert.equal(db.prepare("SELECT COUNT(*) count FROM reservation_items WHERE reservation_id='first'").get().count,2);
assert.equal(reserve('retry',selected,{key:'first'}),undefined,'Idempotent retry does not create another order');
assert.equal(db.prepare("SELECT COUNT(*) count FROM reservation_items WHERE reservation_id='retry'").get().count,0);
assert.equal(reserve('wrong-price',selected,{total:1}),undefined,'Stale or tampered quoted total fails closed');
assert.equal(reserve('wrong-quantity',selected,{quantity:1}),undefined);
assert.equal(reserve('unknown',[{tierId:'missing',quantity:1}]),undefined);
assert.equal(reserve('tier-full',[{tierId:'premium',quantity:2}]),undefined,'Tier capacity checked independently');
assert.ok(reserve('second',[{tierId:'regular',quantity:2},{tierId:'premium',quantity:1}]));
assert.equal(reserve('event-full',[{tierId:'regular',quantity:1}]),undefined,'Event capacity checked');
assert.ok(sql(confirmSql,['second','reference',now])[0]);
// Expire the first hold, then sell its seats. A late callback must not oversell either tier.
db.prepare("UPDATE reservations SET expires_at=? WHERE id='first'").run(now-1);
assert.ok(reserve('replacement',selected));
assert.equal(sql(confirmSql,['first','late',now]).length,0,'Late callback cannot reclaim sold tier capacity');
db.prepare("UPDATE reservations SET status='cancelled' WHERE id='replacement'").run();
assert.ok(sql(confirmSql,['first','late',now])[0]);
assert.equal(sql(confirmSql,['first','duplicate',now]).length,0,'Confirmed payment cannot confirm twice');
assert.equal(reserve('closed',[{tierId:'regular',quantity:1}],{time:now+1800001}),undefined);
assert.deepEqual(readTicketSelection([{tierId:'b',quantity:1},{tierId:'a',quantity:2}]),[{tierId:'a',quantity:2},{tierId:'b',quantity:1}]);
for(const items of [[],{},[{tierId:'a',quantity:0}],[{tierId:'a',quantity:1.5}],[{tierId:'a',quantity:7}],[{tierId:'a',quantity:1},{tierId:'a',quantity:1}],[{tierId:'a',quantity:4},{tierId:'b',quantity:3}]]) assert.throws(()=>readTicketSelection(items));
assert.equal(readTicketSelection(undefined),null);
db.close();
console.log('PASS multi-tier price snapshots, total/event/tier capacity, idempotency, rollback, expiry, late payment callbacks, selection validation');
