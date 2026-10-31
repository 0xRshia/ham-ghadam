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
    const sent=calls.at(-1),code=/کد ورود شما: (\d{6})/.exec(sent.MessageText)[1];
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
  assert.equal(/کد ورود شما: (\d{6})/.exec(calls.at(-1).MessageText)[1],/کد ورود شما: (\d{6})/.exec(calls.at(-2).MessageText)[1]);
  for(const error of ['-18',new Error('Delivery outcome unknown')]){
    const previousCalls=calls.length,count=db.prepare('SELECT COUNT(*) n FROM challenges').get().n;
    results=[error];await request('https://app.hmghadam.com',503);
    assert.equal(calls.length,previousCalls+1,'Other errors/uncertain deliveries are not retried');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM challenges').get().n,count,'Failed challenges are removed');
  }
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
  console.log('PASS domain-bound SMS for app/stage, provider rejection fallback, no duplicate uncertain sends, hash-only storage and WebOTP acceptance/cancellation/fallback');
} finally {
  globalThis.fetch=realFetch;delete globalThis.window;
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
  adapter?.prepare('SELECT 1').connection.close();db.close();fs.rmSync(dir,{recursive:true,force:true});
}
