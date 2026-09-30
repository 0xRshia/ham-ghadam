import crypto from 'node:crypto';
export async function testPush({ db,user,check,base,secret }) {
  const owner=user(221),other=user(222);
  const curve=crypto.createECDH('prime256v1');curve.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/integration-not-delivered',keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  const request=async(method,path,data,token,origin=base)=>{
    const response=await fetch(base+path,{method,signal:AbortSignal.timeout(15000),headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:`hg_session=${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,data:await response.json()};
  };
  check((await request('GET','/api/push-subscriptions')).status===401,'Push configuration requires sign-in');
  const configuration=await request('GET','/api/push-subscriptions',undefined,owner.token);
  check(configuration.status===200 && configuration.data.configured && configuration.data.publicKey && !('privateKey' in configuration.data),'Push configuration validates the VAPID pair and exposes only its public key');
  check((await request('POST','/api/push-subscriptions',subscription,owner.token,'https://untrusted.example')).status===403,'Push subscription enforces same-origin');
  check((await request('POST','/api/push-subscriptions',{...subscription,endpoint:'https://127.0.0.1/private'},owner.token)).status===400,'Push API rejects SSRF endpoints');
  check((await request('POST','/api/push-subscriptions',{...subscription,keys:{...subscription.keys,auth:'bad'}},owner.token)).status===400,'Push API validates cryptographic key lengths');
  const job=await fetch(base+'/api/jobs/notifications',{method:'POST',signal:AbortSignal.timeout(55000),headers:{Authorization:`Bearer ${secret}`}});
  const jobResult=await job.json();
  check(job.status===200 && jobResult.configured && jobResult.delivered===0,'Authorized job generates notifications without sending when no devices are subscribed');
  check((await request('POST','/api/push-subscriptions',subscription,owner.token)).status===200,'Browser subscription is persisted');
  const row=db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').get(owner.id);
  check(row.session_hash===crypto.createHash('sha256').update(owner.token).digest('hex'),'Push subscription is bound to the authenticated session');
  check((await request('POST','/api/push-subscriptions',subscription,owner.token)).status===200 && db.prepare('SELECT COUNT(*) count FROM push_subscriptions WHERE user_id=?').get(owner.id).count===1,'Repeated subscription is idempotent');
  const statusPath='/api/push-subscriptions?fingerprint='+crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
  check((await request('GET',statusPath,undefined,owner.token)).data.subscribed===true && (await request('GET',statusPath,undefined,other.token)).data.subscribed===false,'Subscription status is scoped to the signed-in user and session');
  await request('DELETE','/api/push-subscriptions',{endpoint:subscription.endpoint},other.token);
  check((await request('GET',statusPath,undefined,owner.token)).data.subscribed===true,'Other users cannot revoke a subscription');
  for(let index=0;index<4;index++) await request('POST','/api/push-subscriptions',{...subscription,endpoint:subscription.endpoint+index},owner.token);
  check((await request('POST','/api/push-subscriptions',{...subscription,endpoint:subscription.endpoint+'limit'},owner.token)).status===409,'Browser subscriptions are limited to five devices');
  check((await request('POST','/api/jobs/notifications',{})).status===401,'Delivery job rejects missing authorization');
  await request('POST','/api/auth/logout',{},owner.token);
  check(db.prepare('SELECT COUNT(*) count FROM push_subscriptions WHERE user_id=?').get(owner.id).count===0,'Signing out revokes all push subscriptions bound to that session');
}
