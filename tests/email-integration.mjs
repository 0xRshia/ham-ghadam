import crypto from 'node:crypto';
export async function testEmail({db,user,check,base,secret}) {
  const owner=user(231),other=user(232);
  const request=async(method,path,data,token,origin=base)=>{
    const response=await fetch(base+path,{method,signal:AbortSignal.timeout(15000),headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:`hg_session=${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),redirect:'manual'});
    return {status:response.status,data:response.status===303 ? null : await response.json(),headers:response.headers};
  };
  const email='verification@example.test';
  const challenge=({expires=Date.now()+600000,attempts=0}={})=>{
    const id=crypto.randomUUID(),code='123456';
    const hash=crypto.createHmac('sha256',secret).update(JSON.stringify(['email-verification',id,email,code])).digest('hex');
    db.prepare('INSERT INTO email_challenges(id,user_id,email,hash,created_at,expires_at,attempts) VALUES(?,?,?,?,?,?,?)').run(id,owner.id,email,hash,Date.now(),expires,attempts);
    return {action:'verify',challengeId:id,code};
  };
  check((await request('GET','/api/account/email')).status===401,'Email addresses require authentication');
  check((await request('GET','/api/account/email',undefined,owner.token)).data.configured===false,'Missing email provider configuration is reported truthfully');
  check((await request('POST','/api/account/email',{action:'request',email:'invalid'},owner.token)).status===400,'Malformed verification recipient is rejected');
  check((await request('POST','/api/account/email',{action:'request',email},owner.token)).status===503,'Unconfigured email request cannot claim a code was sent');
  const first=challenge();
  check((await request('POST','/api/account/email',first,other.token)).status===400,'Email code belongs to its signed-in account');
  check((await request('POST','/api/account/email',{...first,code:'000000'},owner.token)).status===400,'Wrong email code is rejected');
  check((await request('POST','/api/account/email',first,owner.token)).status===200,'A valid email challenge stores a verified address');
  check((await request('GET','/api/account/email',undefined,owner.token)).data.account.email===email,'Verified email is privately available to its owner');
  check((await request('GET','/api/account/email',undefined,other.token)).data.account===null,'Other accounts cannot read the verified address');
  const profile=(await request('GET','/api/profile',undefined,owner.token)).data.profile;
  check(profile.notification_preferences.email===false && profile.notification_preferences.newsletter===false && !('email' in profile),'Verification alone does not opt into email or expose the recipient on profile data');
  check((await request('POST','/api/account/email',first,owner.token)).status===400,'Consumed email codes cannot be replayed');
  check((await request('POST','/api/account/email',challenge({expires:Date.now()-1}),owner.token)).status===400,'Expired email code cannot change the recipient');
  check((await request('POST','/api/account/email',challenge({attempts:5}),owner.token)).status===400,'Email verification stops after five attempts');
  check((await request('PATCH','/api/profile',{notification_preferences:{...profile.notification_preferences,email:true}},owner.token)).status===503,'Email alerts cannot activate before a provider is configured');
  const saved=db.prepare('SELECT * FROM account_emails WHERE user_id=?').get(owner.id);
  const token=crypto.createHmac('sha256',secret).update(JSON.stringify(['email-unsubscribe',owner.id,saved.email,saved.verified_at])).digest('hex');
  const path=`/api/email/unsubscribe?user=${encodeURIComponent(owner.id)}&token=${token}`;
  db.prepare("UPDATE user_profiles SET notification_preferences=json_set(notification_preferences,'$.email',json('true'),'$.newsletter',json('true')) WHERE user_id=?").run(owner.id);
  db.prepare('UPDATE account_emails SET enabled_at=? WHERE user_id=?').run(Date.now(),owner.id);
  const preview=await request('GET',path);
  check(preview.status===303 && new URL(preview.headers.get('location')).pathname==='/email/unsubscribe' && db.prepare('SELECT enabled_at FROM account_emails WHERE user_id=?').get(owner.id).enabled_at!==null,'Email link previews show confirmation without unsubscribing');
  check((await request('POST',path+'wrong',{})).status===400,'Invalid unsubscribe signature cannot change preferences');
  check((await request('POST',path,{},undefined,'https://mail.example.test')).status===200 && db.prepare('SELECT enabled_at FROM account_emails WHERE user_id=?').get(owner.id).enabled_at===null,'Valid one-click signature authorizes cross-origin unsubscribe without login');
  check((await request('POST',path,{})).status===200,'Unsubscribe is idempotent');
  check((await request('DELETE','/api/account/email',{},owner.token,'https://untrusted.example')).status===403,'Removing an email requires same-origin authorization');
  check((await request('DELETE','/api/account/email',{},owner.token)).status===200 && !db.prepare('SELECT user_id FROM account_emails WHERE user_id=?').get(owner.id),'Owner can remove a verified address');
  check(db.prepare('SELECT COUNT(*) count FROM email_challenges WHERE user_id=?').get(owner.id).count===0,'Removing email also removes its verification challenges');
}
