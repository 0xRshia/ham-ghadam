import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { nodeSourceModules } from './node-source-module.mjs';
import { organizerAgreement } from './legal-fixtures.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-schedule-'));
process.env.DATABASE_PATH = path.join(dir, 'events.sqlite');
process.env.MEDIA_PATH = path.join(dir, 'media');
process.env.HOST_PHONES = '09990000001';
process.env.TEMP_LOGIN_ENABLED = 'false';
process.env.SEED_SAMPLE_EVENTS = 'false';
const load = nodeSourceModules(path.join(dir, 'modules'));
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec('PRAGMA foreign_keys=ON');
let adapter;
try {
  for (const {tag} of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries) db.exec(fs.readFileSync(`drizzle/${tag}.sql`, 'utf8'));
  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES('schedule-host','09990000001','میزبان',?)").run(Date.now());
  adapter = (await load('db/node.ts')).database();
  const { saveFastEvent, fastEvent } = await load('lib/fast-events.ts');
  const { readEventInput } = await load('lib/event-input.ts');
  const { initialManualSchedule, manualScheduleFields, parseManualSchedule, manualScheduleEnd } = await load('lib/manual-event-schedule.ts');
  const { tehranDay, eventAvailable, eventSortTime, nextScheduleDay } = await load('lib/event-schedule.ts');
  const { eventNotEndedSql } = await load('lib/event-schedule-sql.ts');
  const { persianInput } = await load('lib/persian-date.ts');
  const day = tehranDay(Date.now()) + 3 * 86400000;
  const weekday = new Date(day + 12600000).getUTCDay();
  const base = { title:'سانس‌های آزمون',description:'آزمون برنامهٔ رویداد',category:'art',venue:'محل آزمون',city:'تهران',host_id:'schedule-host',maps_url:'https://example.test/venue',date:persianInput(day),time:'18:00',endDate:persianInput(day),endTime:'20:00' };
  const slots = {kind:'sessions',date:base.date,weekdays:[],sessions:[{start:'11:00',end:'13:00'},{start:'14:00',end:'16:00'}]};
  const weekly = {...slots,kind:'weekly',weekdays:[weekday],endDate:persianInput(day+15*86400000)};
  const sqlAvailable = (event, now) => !!db.prepare(`SELECT ${eventNotEndedSql('?1')} available FROM events e WHERE id=?2`).get({'?1':now,'?2':event.id}).available;
  const create = schedule => saveFastEvent({...base,schedule},[]);
  let event = await create(slots);
  assert.equal(event.starts_at,null);assert.equal(event.ends_at,null);
  assert.equal(event.schedule.source,'manual');assert.equal(event.schedule.sessions.length,2);
  for (const [now, expected] of [[day, true],[day+13*3600000,true],[day+16*3600000,false],[day+86400000,false]]) {
    assert.equal(eventAvailable(event,now),expected);assert.equal(sqlAvailable(event,now),expected,'SQL availability matches JS at session boundaries');
  }
  assert.equal(eventSortTime(event,day+13*3600000),day+14*3600000);
  assert.equal(nextScheduleDay(event,day+16*3600000),null);
  assert.deepEqual(manualScheduleFields(initialManualSchedule(event)).schedule, {...slots,endDate:null});
  const changed = await saveFastEvent({...base,revision:event.revision,description:'ویرایش توضیح'},[],event.id);
  assert.deepEqual(changed.schedule,event.schedule,'An omitted schedule preserves authored slots');
  event = await saveFastEvent({...base,revision:changed.revision,schedule:null},[],event.id);
  assert.equal(event.schedule,null);assert.equal(event.starts_at,day+18*3600000,'Explicit null restores a continuous single event');

  event = await create(weekly);
  assert.equal(manualScheduleEnd(event.schedule),day+14*86400000+16*3600000);
  for (const [now, expected] of [[day,true],[day+17*3600000,true],[day+13*86400000,true],[day+14*86400000+16*3600000,false],[day+15*86400000,false]]) {
    assert.equal(eventAvailable(event,now),expected);assert.equal(sqlAvailable(event,now),expected);
  }
  assert.equal(eventSortTime(event,day+17*3600000),day+7*86400000+11*3600000,'After the last daily slot, sort by the next actual occurrence');
  const open = await create({...weekly,endDate:null});
  const {saveEventProgram} = await load('lib/event-program.ts');
  const video = await saveEventProgram(open,{revision:0,agenda:[],series_id:null,video_url:'https://example.test/video.mp4'});
  assert.equal(video.video_url,'https://example.test/video.mp4','Recurring events can still save video without a timed agenda');
  assert.equal(eventAvailable(open,day+1000*86400000),true);
  assert.equal(sqlAvailable(open,day+1000*86400000),true);
  assert.throws(()=>readEventInput({...base,schedule:{...weekly,endDate:null},registrationDate:base.date,registrationTime:'10:00'}),e=>e.status===400);
  assert.equal(readEventInput({...base,schedule:weekly,registrationDate:base.date,registrationTime:'10:00'}).registrationEnd,day+10*3600000);
  assert.throws(()=>readEventInput({...base,schedule:weekly,registrationDate:weekly.endDate,registrationTime:'10:00'}),e=>e.status===400,'Deadline cannot extend beyond the last actual occurrence');

  for (const invalid of [null,{}, {...slots,kind:'flexible'}, {...slots,weekdays:[8]}, {...weekly,weekdays:[]}, {...weekly,weekdays:['5']}, {...slots,date:'1405/13/01'}, {...slots,sessions:[]}, {...slots,sessions:Array(13).fill(slots.sessions[0])}, {...slots,sessions:[{start:'24:00',end:'25:00'}]}, {...slots,sessions:[{start:'11:01',end:'13:00'}]}, {...slots,sessions:[{start:'14:00',end:'13:00'}]}, {...slots,sessions:[{start:'11:00',end:'13:00'},{start:'12:00',end:'14:00'}]}, {...weekly,endDate:persianInput(day-86400000)}, {...weekly,weekdays:[(weekday+1)%7],endDate:base.date}]) {
    assert.throws(()=>parseManualSchedule(invalid),`Invalid schedule rejected: ${JSON.stringify(invalid)}`);
  }
  const sorted = parseManualSchedule({...slots,sessions:[{start:'۱۴:۰۰',end:'۱۶:۰۰'},slots.sessions[0]]});
  assert.equal(sorted.sessions[0].start,660);
  const expired = {...slots,date:persianInput(day-10*86400000)};
  assert.throws(()=>readEventInput({...base,schedule:expired}),e=>e.status===400,'New expired slots are rejected');
  const past = parseManualSchedule(expired);
  assert.doesNotThrow(()=>readEventInput({...base,schedule:expired},{...open,schedule:past,starts_at:null,ends_at:null}),'Unchanged past schedules permit content corrections');
  await assert.rejects(()=>saveFastEvent({...base,revision:event.revision+1,schedule:weekly},[],event.id),e=>e.status===409);
  db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES('history','schedule-host',?,1,0,0,'cancelled','history',?,'none')").run(event.id,Date.now());
  event = await fastEvent(event.id);
  await assert.rejects(()=>saveFastEvent({...base,revision:event.revision,schedule:{...weekly,sessions:[{start:'15:00',end:'17:00'}]}},[],event.id),e=>e.status===409);
  event = await saveFastEvent({...base,revision:event.revision,schedule:weekly,description:'اصلاح بدون تغییر زمان'},[],event.id);
  assert.deepEqual(event.schedule,parseManualSchedule(weekly),'Reservation history permits content-only corrections');

  const timed = await create(null);
  db.prepare("INSERT INTO event_programs(event_id,agenda_json) VALUES(?,?)").run(timed.id,JSON.stringify([{id:'part',title:'برنامه',starts_at:day+18*3600000,ends_at:day+19*3600000}]));
  const refreshed = await fastEvent(timed.id);
  await assert.rejects(()=>saveFastEvent({...base,revision:refreshed.revision,schedule:weekly},[],timed.id),e=>e.status===409,'Existing timed agenda must be removed before converting to recurring slots');

  const token = randomBytes(32).toString('hex');
  const {hash} = await load('lib/server.ts');
  db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,'schedule-host',?)").run(await hash(token),Date.now()+60000);
  const hostRoute = await load('app/api/host/route.ts');
  const response = await hostRoute.POST(new Request('https://schedule.example.test/api/host',{method:'POST',headers:{Origin:'https://schedule.example.test','Content-Type':'application/json',Cookie:`hg_session=${token}`},body:JSON.stringify({...base,schedule:weekly,organizerAgreement})}));
  const result = await response.json();assert.equal(response.status,201,JSON.stringify(result));
  const hostEvent = await fastEvent(result.id);
  assert.deepEqual(hostEvent.schedule,parseManualSchedule(weekly));
  const {requireOrganizerAgreement} = await load('lib/organizer-contract.ts');
  await requireOrganizerAgreement(db.prepare('SELECT * FROM events WHERE id=?').get(result.id),'schedule-host');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('PASS manual slots and recurrence: validation, persistence, round trips, SQL/JS availability, deadlines, reservation/agenda/revision guards, host creation and agreement');
} finally {
  adapter?.prepare('SELECT 1').connection.close();db.close();fs.rmSync(dir,{recursive:true,force:true});
}
