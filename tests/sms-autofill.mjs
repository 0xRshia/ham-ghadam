import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { nodeSourceModules } from './node-source-module.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(),'sms-autofill-'));
process.env.DATABASE_PATH=path.join(dir,'events.sqlite');
process.env.TEMP_LOGIN_ENABLED='false';
process.env.IDEKAVAN_API_KEY='test-key-not-a-real-key';
process.env.IDEKAVAN_SENDER='9890000000';
process.env.OTP_SECRET=randomBytes(32).toString('hex');
const db=new DatabaseSync(process.env.DATABASE_PATH);
const load=nodeSourceModules(path.join(dir,'modules'));
const realFetch=globalThis.fetch, navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
let adapter;
try {
  for(const {tag} of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries)db.exec(fs.readFileSync(`drizzle/${tag}.sql`,'utf8'));
  adapter=(await load('db/node.ts')).database();
  const {POST}=await load('app/api/auth/request/route.ts');
  const calls=[];let results=[];
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.m.idekavan.com/api/message/send');
    calls.push(JSON.parse(options.body)[0]);
    const outcome=results.shift()??'message-accepted';
    if(outcome instanceof Error)throw outcome;
    return Response.json({succeeded:true,resultCode:100,data:[outcome]});
  };
  let phoneIndex=1;
  async function request(origin,expected=200){
    const phone='0999000'+String(phoneIndex++).padStart(4,'0');
    const response=await POST(new Request(origin+'/api/auth/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({phone})}));
    const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return {phone,result};
  }
  for(const origin of ['https://app.hmghadam.com','https://stage.hmghadam.com']){
    const {phone,result}=await request(origin);
    const sent=calls.at(-1),code=/^Code: (\d{6})$/m.exec(sent.MessageText)[1];
    assert.equal(sent.MessageText.split('\n').at(-1),`@${new URL(origin).hostname} #${code}`);
    assert.equal(sent.DestinationAddress,'98'+phone.slice(1));assert.equal(sent.DataCoding,8);
    assert(!JSON.stringify(result).includes(code),'The API never returns the SMS code');
    const challenge=db.prepare('SELECT * FROM challenges WHERE id=?').get(result.challengeId);
    assert(challenge.hash && !challenge.hash.includes(code),'Only a hash is persisted');
  }
  const before=calls.length;results=['-21','message-retry-accepted'];
  await request('https://app.hmghadam.com');
  assert.equal(calls.length,before+2,'An explicit link-format rejection retries with the plain SMS');
  assert(!calls.at(-1).MessageText.includes('@'));assert.equal(calls.at(-1).udh,calls.at(-2).udh);
  assert.equal(/^Code: (\d{6})$/m.exec(calls.at(-1).MessageText)[1],/^Code: (\d{6})$/m.exec(calls.at(-2).MessageText)[1]);
  for(const error of ['-18',new Error('Delivery outcome unknown')]){
    const previousCalls=calls.length,count=db.prepare('SELECT COUNT(*) n FROM challenges').get().n;
    results=[error];await request('https://app.hmghadam.com',503);
    assert.equal(calls.length,previousCalls+1,'Other errors/uncertain deliveries are not retried');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM challenges').get().n,count,'Failed challenges are removed');
  }
  // The server enforces the two-minute resend cooldown and reports its deadline.
  const post=phone=>POST(new Request('https://app.hmghadam.com/api/auth/request',{method:'POST',headers:{Origin:'https://app.hmghadam.com','Content-Type':'application/json'},body:JSON.stringify({phone})}));
  const limitKey=phone=>'otp-phone:'+phone,cooldownMs=120000;
  const cooldownPhone='09990009991';
  const first=await post(cooldownPhone),firstBody=await first.json();
  assert.equal(first.status,200);
  assert.equal(firstBody.resendAt-(firstBody.expiresAt-300000),cooldownMs,'Resend opens two minutes after the code is issued');
  assert.ok(firstBody.resendAfter>=118&&firstBody.resendAfter<=120);
  let sentBefore=calls.length;
  const early=await post(cooldownPhone),earlyBody=await early.json();
  assert.equal(early.status,429,'A resend inside the cooldown is rejected');
  assert.equal(calls.length,sentBefore,'A rejected resend sends no SMS');
  assert.equal(earlyBody.resendAt,firstBody.resendAt,'The rejection reports the original resend deadline');
  assert.equal(early.headers.get('Retry-After'),String(earlyBody.resendAfter));
  assert.match(earlyBody.error,/شمارش معکوس/);
  db.prepare('UPDATE rate_limits SET last_at=? WHERE key=?').run(Date.now()-cooldownMs+2000,limitKey(cooldownPhone));
  assert.equal((await post(cooldownPhone)).status,429,'The cooldown holds until the full two minutes pass');
  db.prepare('UPDATE rate_limits SET last_at=? WHERE key=?').run(Date.now()-cooldownMs,limitKey(cooldownPhone));
  const resent=await post(cooldownPhone),resentBody=await resent.json();
  assert.equal(resent.status,200,'Resend is allowed once the cooldown ends');
  assert.equal(db.prepare('SELECT consumed FROM challenges WHERE id=?').get(firstBody.challengeId).consumed,1,'The resent code replaces the previous one');
  assert.equal(db.prepare('SELECT consumed FROM challenges WHERE id=?').get(resentBody.challengeId).consumed,0);
  assert.equal((await post(cooldownPhone)).status,429,'Each resend restarts the cooldown');

  const failedPhone='09990009992';
  results=[new Error('Delivery failed')];
  assert.equal((await post(failedPhone)).status,503);
  assert.equal(db.prepare('SELECT last_at FROM rate_limits WHERE key=?').get(limitKey(failedPhone)).last_at,0,'A failed delivery releases the cooldown');
  assert.equal((await post(failedPhone)).status,200,'The user may retry at once after a failed delivery');

  const racePhone='09990009993';sentBefore=calls.length;
  const raced=await Promise.all([post(racePhone),post(racePhone)]);
  assert.deepEqual(raced.map(response=>response.status).sort(),[200,429],'Concurrent requests cannot both pass the cooldown');
  assert.equal(calls.length,sentBefore+1);

  const quotaPhone='09990009994',quotaEnds=Date.now()+1800000;
  db.prepare('INSERT INTO rate_limits(key,count,resets_at,last_at) VALUES(?,?,?,?)').run(limitKey(quotaPhone),5,quotaEnds,Date.now()-cooldownMs*2);
  const quota=await post(quotaPhone),quotaBody=await quota.json();
  assert.equal(quota.status,429,'The hourly per-phone quota still applies');
  assert.equal(quotaBody.resendAt,quotaEnds,'A quota rejection reports when the quota resets');
  const {listenForSmsCode}=await load('lib/sms-autofill.ts');
  assert.equal(listenForSmsCode(()=>assert.fail('Unsupported browser'),new AbortController().signal),false);
  globalThis.window={isSecureContext:true,OTPCredential:class{}};
  let resolve,options;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{credentials:{get:input=>{options=input;return new Promise(r=>{resolve=r;});}}}});
  let code='';const controller=new AbortController();
  assert.equal(listenForSmsCode(value=>{code=value;},controller.signal),true);
  assert.deepEqual(options.otp,{transport:['sms']});resolve({code:'123456'});await Promise.resolve();assert.equal(code,'123456');
  const cancelled=new AbortController();listenForSmsCode(()=>assert.fail('Stale OTP applied'),cancelled.signal);cancelled.abort();resolve({code:'654321'});await Promise.resolve();
  listenForSmsCode(()=>assert.fail('Invalid OTP applied'),new AbortController().signal);resolve({code:'12345x'});await Promise.resolve();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{credentials:{get:()=>Promise.reject(new Error('User dismissed'))}}});
  listenForSmsCode(()=>assert.fail(),new AbortController().signal);await Promise.resolve();await Promise.resolve();
  console.log('PASS domain-bound SMS for app/stage, provider rejection fallback, no duplicate uncertain sends, two-minute resend cooldown with release on failure, hash-only storage and WebOTP acceptance/cancellation/fallback');
} finally {
  globalThis.fetch=realFetch;delete globalThis.window;
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
  adapter?.prepare('SELECT 1').connection.close();db.close();fs.rmSync(dir,{recursive:true,force:true});
}
