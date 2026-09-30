import fs from 'node:fs';
import assert from 'node:assert/strict';
export async function testAvatar({db,user,check,base}) {
  const owner=user(241),other=user(242),bytes=fs.readFileSync('public/images/cafe.jpg');
  async function upload(token,{origin=base,content=bytes,type='image/jpeg',field='cover'}={}) {
    const form=new FormData();form.set('data','{}');form.set(field,new Blob([content],{type}),'avatar.jpg');
    const response=await fetch(base+'/api/profile/avatar',{method:'POST',body:form,headers:{Origin:origin,...(token?{Cookie:`hg_session=${token}`}:{})},signal:AbortSignal.timeout(15000)});
    return {status:response.status,data:await response.json()};
  }
  const profile=async token=>(await (await fetch(base+'/api/profile',{headers:{Cookie:`hg_session=${token}`},signal:AbortSignal.timeout(15000)})).json()).profile;
  const resetLimit=()=>db.prepare('DELETE FROM rate_limits WHERE key=?').run('profile-avatar:'+owner.id);
  check((await upload()).status===401,'Avatar upload requires sign-in');
  check((await upload(owner.token,{origin:'https://untrusted.example'})).status===403,'Avatar upload enforces same-origin before parsing files');
  check((await upload(owner.token,{content:'<svg><script>alert(1)</script></svg>',type:'image/svg+xml'})).status===400,'Avatar upload rejects executable SVG content');resetLimit();
  check((await upload(owner.token,{type:'image/png'})).status===400,'Avatar content must match its declared image type');resetLimit();
  check((await upload(owner.token,{field:'gallery'})).status===400,'Avatar accepts exactly one image in its designated field');resetLimit();
  const first=await upload(owner.token);check(first.status===201 && first.data.url.startsWith('/api/profile-media/'),'Avatar stores a validated image with a server-owned URL');
  const stored=await fetch(base+first.data.url,{signal:AbortSignal.timeout(15000)});check(stored.status===200 && stored.headers.get('content-type')==='image/jpeg' && stored.headers.get('x-content-type-options')==='nosniff','Public avatar is served with verified type and safe response headers');assert.deepEqual(Buffer.from(await stored.arrayBuffer()),bytes);
  check((await profile(owner.token)).avatar_url===first.data.url && (await profile(other.token)).avatar_url===null,'Avatar belongs only to the authenticated profile');
  check((await upload(owner.token)).status===429,'Rapid avatar replacement is rate limited');resetLimit();
  const second=await upload(owner.token);check(second.status===201 && second.data.url!==first.data.url,'Replacing avatar creates a new immutable image identity');
  check((await fetch(base+first.data.url,{signal:AbortSignal.timeout(15000)})).status===404 && (await profile(owner.token)).avatar_url===second.data.url,'Old avatar URL is no longer publicly served after replacement');
  const removed=await fetch(base+'/api/profile/avatar',{method:'DELETE',headers:{Origin:base,Cookie:`hg_session=${owner.token}`},signal:AbortSignal.timeout(15000)});
  check(removed.status===200 && (await profile(owner.token)).avatar_url===null && (await fetch(base+second.data.url,{signal:AbortSignal.timeout(15000)})).status===404,'Removing avatar clears the profile and public media reference');
}
