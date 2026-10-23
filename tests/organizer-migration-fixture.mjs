import assert from "node:assert/strict";

export const organizerMigrationSeed = `
INSERT OR IGNORE INTO users(id,phone,name,created_at) VALUES('host','09990000001','برگزارکننده',1);
INSERT INTO events(id,host_id,title,description,category,venue,address,city,starts_at,ends_at,registration_ends_at,price,capacity,published,revision)
  VALUES('organizer-event','host','رویداد قبلی','توضیح قبلی','books','محل','نشانی','تهران',100,200,90,1000,10,1,7);
INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state)
  VALUES('organizer-booking','host','organizer-event',1,1000,10000,'confirmed','organizer-booking',1,'paid');
INSERT INTO tickets(id,reservation_id,ordinal,token,created_at,checked_in_at) VALUES('organizer-ticket','organizer-booking',1,'organizer-ticket-token',1,2);
INSERT INTO event_scanners(event_id,token,created_at) VALUES('organizer-event','organizer-scanner-token',1);
INSERT INTO event_media(id,event_id,role,position,storage_key,content_type,byte_size,created_at)
  VALUES('organizer-media','organizer-event','cover',0,'00000000-0000-4000-8000-000000000001.jpg','image/jpeg',100,1);
INSERT INTO collections(id,owner_id,title,created_at,updated_at) VALUES('organizer-collection','host','مجموعه',1,1);
INSERT INTO collection_events(collection_id,event_id,position) VALUES('organizer-collection','organizer-event',0);
INSERT INTO event_favorites(user_id,event_id,created_at) VALUES('host','organizer-event',1);
INSERT INTO event_ticket_tiers(id,event_id,name,price,capacity) VALUES('organizer-tier','organizer-event','عمومی',1000,10);
INSERT INTO reservation_items(reservation_id,tier_id,tier_name,quantity,unit_price) VALUES('organizer-booking','organizer-tier','عمومی',1,1000);
INSERT INTO event_series(id,host_id,title,created_at) VALUES('organizer-series','host','سری',1);
INSERT INTO event_programs(event_id,series_id,agenda_json,revision) VALUES('organizer-event','organizer-series','[]',3);
INSERT INTO event_reviews(id,event_id,user_id,rating,comment,created_at,updated_at) VALUES('organizer-review','organizer-event','host',5,'نظر',1,1);
INSERT INTO review_replies(id,review_id,host_id,comment,created_at,updated_at) VALUES('organizer-reply','organizer-review','host','پاسخ',1,1);
`;

export const organizerMigrationTables = ["events", "reservations", "tickets", "event_scanners", "event_media", "collections", "collection_events", "event_favorites", "event_ticket_tiers", "reservation_items", "event_series", "event_programs", "event_reviews", "review_replies"];
export const organizerSnapshotSql = organizerMigrationTables.map(table => `SELECT * FROM ${table} ORDER BY 1,2`).join(";");

export function assertOrganizerMigration(before, after) {
  organizerMigrationTables.forEach((table, index) => {
    assert.equal(after[index].length, before[index].length, `${table} row count preserved`);
    before[index].forEach((row, rowIndex) => {
      for (const [column, value] of Object.entries(row)) assert.deepEqual(after[index][rowIndex][column], value, `${table}.${column} preserved`);
    });
  });
  const event = after[0].find(row => row.id === "organizer-event");
  assert.equal(event.revision, 7, "Migration must not increment event revisions");
  assert.equal(event.host_id, "host");
  assert.equal(event.organizer_name, null);
}
