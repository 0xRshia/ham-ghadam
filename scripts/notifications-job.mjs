const origin = process.env.APP_ORIGIN;
const secret = process.env.NOTIFICATION_JOB_SECRET;
if (!origin || !secret || secret.length < 32) throw new Error('APP_ORIGIN and a strong NOTIFICATION_JOB_SECRET are required');
const url = new URL('/api/jobs/notifications',origin);
if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Notification jobs require HTTPS outside loopback');
const response = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`},redirect:'error',signal:AbortSignal.timeout(55000)});
if (!response.ok) throw new Error(`Notification job failed with HTTP ${response.status}`);
const result = await response.json();
console.log(JSON.stringify({configured:result.configured,delivered:result.delivered,failed:result.failed,email:result.email}));
