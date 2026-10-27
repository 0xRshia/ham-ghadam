import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";
import { termsAcceptance, organizerAgreement } from "./legal-fixtures.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-legal-"));
process.env.DATABASE_PATH = path.join(directory, "events.sqlite");
process.env.MEDIA_PATH = path.join(directory, "media");
process.env.HOST_PHONES = "09990000001";
process.env.SEED_SAMPLE_EVENTS = "false";
process.env.TEMP_LOGIN_ENABLED = "true";
process.env.OTP_SECRET = randomBytes(32).toString("hex");
const load = nodeSourceModules(path.join(directory,"modules"));
const db = new DatabaseSync(process.env.DATABASE_PATH);
let adapter;
try {
  db.exec("PRAGMA foreign_keys=ON");
  for (const entry of JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8")).entries) db.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,"utf8"));
  const server = await load("lib/server.ts");
  adapter = (await load("db/node.ts")).database();
  const password = await load("app/api/auth/password/route.ts");
  const request = await load("app/api/auth/request/route.ts");
  const verify = await load("app/api/auth/verify/route.ts");
  const register = await load("app/api/auth/register/route.ts");
  const reset = await load("app/api/auth/password-reset/route.ts");
  const hostEvents = await load("app/api/host/route.ts");
  const publicEvent = await load("app/api/events/[id]/route.ts");
  const contract = await load("app/api/host/events/[id]/agreement/route.ts");
  const { hashPassword } = await load("lib/passwords.ts");
  const { readOrganizerAgreement } = await load("lib/organizer-contract.ts");
  const { persianInput } = await load("lib/persian-date.ts");
  const origin = "https://legal.example.test";
  async function call(handler, route, data, expected=200, cookie="", id, method="POST") {
    const response=await handler(new Request(origin+route,{method,headers:{Origin:origin,Cookie:cookie,...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})}),{params:Promise.resolve({id})});
    const result=await response.json();
    assert.equal(response.status,expected,`${method} ${route}: ${JSON.stringify(result)}`);
    return {result,response};
  }
  const loginPassword="legal-test-password";
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("host","09990000001","میزبان",Date.now());
  db.prepare("INSERT INTO password_credentials VALUES(?,?,?)").run("host",await hashPassword(loginPassword),Date.now());
  for (const acceptance of [{},{acceptTerms:false,termsVersion:termsAcceptance.termsVersion},{acceptTerms:true,termsVersion:"old"}]) {
    await call(password.POST,"/api/auth/password",{phone:"09990000001",password:loginPassword,...acceptance},400);
    await call(verify.POST,"/api/auth/verify",{challengeId:"missing",code:"123456",...acceptance},400);
    await call(register.POST,"/api/auth/register",{name:"آزمون",password:loginPassword,...acceptance},400);
    await call(reset.POST,"/api/auth/password-reset",{resetToken:"a".repeat(64),password:loginPassword,...acceptance},400);
    await call(request.POST,"/api/auth/request",{phone:"09108624708",...acceptance},400);
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n,0);
  const signedIn=await call(password.POST,"/api/auth/password",{phone:"09990000001",password:loginPassword,...termsAcceptance});
  const cookie=signedIn.response.headers.get("set-cookie").split(";")[0];
  assert.equal(db.prepare("SELECT version FROM user_terms_acceptances WHERE user_id='host'").get().version,termsAcceptance.termsVersion);
  const otpRequest=await call(request.POST,"/api/auth/request",{phone:"09108624707",...termsAcceptance});
  await call(verify.POST,"/api/auth/verify",{challengeId:otpRequest.result.challengeId,code:"123456",...termsAcceptance});
  await call(request.POST,"/api/auth/request",{phone:"09108624708",...termsAcceptance});
  await call(register.POST,"/api/auth/register",{challengeId:otpRequest.result.challengeId,code:"123456",name:"کاربر ثبت‌نام",password:loginPassword,...termsAcceptance});
  const resetGrant=await call(reset.POST,"/api/auth/password-reset",{action:"verify",challengeId:otpRequest.result.challengeId,code:"123456"});
  await call(reset.POST,"/api/auth/password-reset",{resetToken:resetGrant.result.resetToken,password:loginPassword},400);
  await call(reset.POST,"/api/auth/password-reset",{resetToken:resetGrant.result.resetToken,password:loginPassword,...termsAcceptance});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM user_terms_acceptances").get().n,3);
  console.log("PASS password, OTP, registration, reset and temporary sign-in reject absent/false/stale consent; successful password, OTP and temporary sessions persist versioned consent");

  assert.equal(readOrganizerAgreement(organizerAgreement).birthDate,"1370/01/01");
  for (const changes of [{accepted:false},{version:"old"},{fatherName:""},{postalCode:"1"},{nationalId:"1111111111"},{nationalId:"1234567890"},{email:"bad"},{birthDate:"1370/13/01"},{iban:"IR"+"0".repeat(24)},{bank:"بانک"}]) assert.throws(()=>readOrganizerAgreement({...organizerAgreement,...changes}));
  const company={...organizerAgreement,partyType:"company",nationalId:"12345678901",registrationNumber:"123",representativeName:"نماینده",representativeRole:"مدیر"};
  assert.equal(readOrganizerAgreement(company).partyType,"company");
  assert.throws(()=>readOrganizerAgreement({...company,representativeRole:""}));
  console.log("PASS conditional individual/company identity, birth date, contact and optional banking validation");

  const day=persianInput(Date.now()+3*86400000);
  const eventInput={title:"رویداد قرارداد",description:"توضیح رویداد",category:"books",venue:"محل",address:"نشانی",city:"تهران",maps_url:"https://maps.app.goo.gl/LegalEvent",date:day,time:"18:00",endTime:"20:00",registrationDate:day,registrationTime:"17:00",capacity:"20"};
  await call(hostEvents.POST,"/api/host",eventInput,400,cookie);
  const created=await call(hostEvents.POST,"/api/host",{...eventInput,organizerAgreement},201,cookie);
  const id=created.result.id;
  assert.equal(db.prepare("SELECT COUNT(*) n FROM organizer_contract_acceptances WHERE event_id=?").get(id).n,1);
  await call(hostEvents.POST,"/api/host",{action:"publish",id,published:false},200,cookie);
  await call(hostEvents.POST,"/api/host",{action:"publish",id,published:true},200,cookie);
  db.prepare("UPDATE events SET title='عنوان تازه',published=0 WHERE id=?").run(id);
  await call(hostEvents.POST,"/api/host",{action:"publish",id,published:true},400,cookie);
  await call(contract.GET,`/api/host/events/${id}/agreement`,undefined,401,"",id,"GET");
  const details=await call(contract.GET,`/api/host/events/${id}/agreement`,undefined,200,cookie,id,"GET");
  assert.equal(details.result.previous.fields.name,organizerAgreement.name);
  const revision=details.result.event.revision;
  await call(contract.POST,`/api/host/events/${id}/agreement`,{revision:revision-1,organizerAgreement},409,cookie,id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM organizer_contract_acceptances WHERE event_id=?").get(id).n,1,"Stale event revision must not create acceptance");
  await call(contract.POST,`/api/host/events/${id}/agreement`,{revision,organizerAgreement},200,cookie,id);
  assert.equal(db.prepare("SELECT published FROM events WHERE id=?").get(id).published,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM organizer_contract_acceptances WHERE event_id=?").get(id).n,2);
  const published=await call(publicEvent.GET,`/api/events/${id}`,undefined,200,"",id,"GET");
  assert.ok(!JSON.stringify(published.result).includes(organizerAgreement.nationalId), "Public event responses must not contain contract identity fields");
  db.prepare("UPDATE events SET published=0 WHERE id=?").run(id);
  const countBeforeRace=db.prepare("SELECT COUNT(*) n FROM organizer_contract_acceptances WHERE event_id=?").get(id).n;
  const racedRequest=new Request(origin+`/api/host/events/${id}/agreement`,{method:"POST",headers:{Origin:origin,Cookie:cookie,"Content-Type":"application/json"},body:"{}"});
  racedRequest.text=async()=>{
    db.prepare("UPDATE events SET title='تغییر هم‌زمان' WHERE id=?").run(id);
    return JSON.stringify({revision:db.prepare("SELECT revision FROM events WHERE id=?").get(id).revision,organizerAgreement});
  };
  const raced=await contract.POST(racedRequest,{params:Promise.resolve({id})});
  assert.equal(raced.status,409,"A newer client revision received after the event read cannot accept the old server snapshot");
  assert.equal(db.prepare("SELECT published FROM events WHERE id=?").get(id).published,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM organizer_contract_acceptances WHERE event_id=?").get(id).n,countBeforeRace);
  const {parseSheetSchedule}=await load("lib/event-schedule.ts");
  db.prepare("UPDATE events SET starts_at=NULL,ends_at=NULL,schedule_json=? WHERE id=?").run(JSON.stringify(parseSheetSchedule("هر جمعه","۱۸ تا ۲۰",1405)),id);
  const flexible=await call(contract.GET,`/api/host/events/${id}/agreement`,undefined,200,cookie,id,"GET");
  assert.equal(flexible.result.event.schedule.date_text,"هر جمعه");
  await call(contract.POST,`/api/host/events/${id}/agreement`,{revision:flexible.result.event.revision,organizerAgreement},200,cookie,id);
  db.prepare("UPDATE events SET published=0,schedule_json=? WHERE id=?").run(JSON.stringify(parseSheetSchedule("هر شنبه","۱۸ تا ۲۰",1405)),id);
  await call(hostEvents.POST,"/api/host",{action:"publish",id,published:true},400,cookie);
  assert.equal(db.prepare("SELECT published FROM events WHERE id=?").get(id).published,0);
  console.log("PASS concurrent body/read revision mismatch and flexible schedule changes cannot reuse an older contract snapshot; public API excludes private identity");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  console.log("PASS host creation requires agreement, saved snapshot gates publishing, private endpoint requires host session, stale revisions fail without recording consent, renewed agreement publishes atomically");
  // A different real user cannot view or accept another host's contract.
  const outsiderToken=randomBytes(32).toString("hex");
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run("outsider","09990000002","دیگری",Date.now());
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(await server.hash(outsiderToken),"outsider",Date.now()+86400000);
  process.env.HOST_PHONES += ",09990000002";
  await call(contract.GET,`/api/host/events/${id}/agreement`,undefined,404,`hg_session=${outsiderToken}`,id,"GET");
  await call(contract.POST,`/api/host/events/${id}/agreement`,{revision,organizerAgreement},404,`hg_session=${outsiderToken}`,id);
  console.log("PASS contract records are isolated by event owner");
  const savedContracts = db.prepare("SELECT id,event_snapshot_json FROM organizer_contract_acceptances WHERE event_id=?").all(id);
  db.prepare("DELETE FROM events WHERE id=?").run(id);
  for (const acceptance of savedContracts) {
    const retained = db.prepare("SELECT event_id,event_snapshot_json FROM organizer_contract_acceptances WHERE id=?").get(acceptance.id);
    assert.equal(retained.event_id,null);
    assert.equal(retained.event_snapshot_json,acceptance.event_snapshot_json);
    assert.equal(JSON.parse(retained.event_snapshot_json).id,id,"Archived consent retains original event identity in immutable snapshot");
  }
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  console.log("PASS deleting an event retains acceptance, original event identity and full snapshot");
} finally {
  adapter?.prepare("").connection.close();db.close();fs.rmSync(directory,{recursive:true,force:true});
}
