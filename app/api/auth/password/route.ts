import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { boundary, body, sameOrigin, phoneNumber, hash, rateLimit, ApiError, randomToken, sessionCookie, json, isHost, isAdmin } from "@/lib/server";
import { dummyPasswordHash, verifyPassword } from "@/lib/passwords";
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const data = await body(req); const phone = phoneNumber(data.phone);
  if (typeof data.password !== "string" || data.password.length > 512) throw new ApiError(400,faContent.invalidCredentials);
  await rateLimit("password-ip:"+await hash(req.headers.get("cf-connecting-ip") ?? "local"),30);
  await rateLimit("password-phone:"+phone,10,1000);
  const db=database();
  const record=await db.prepare("SELECT u.id,u.phone,u.name,c.password_hash FROM users u JOIN password_credentials c ON c.user_id=u.id WHERE u.phone=?").bind(phone).first<{id:string;phone:string;name:string;password_hash:string}>();
  const valid = await verifyPassword(data.password,record?.password_hash ?? dummyPasswordHash);
  if(!valid || !record)throw new ApiError(401,faContent.invalidCredentials);
  const token=randomToken(), age=30*86400;
  // Recheck the exact credential in the INSERT so a concurrent password reset wins.
  const session=await db.prepare("INSERT INTO sessions(hash,user_id,expires_at) SELECT ?,user_id,? FROM password_credentials WHERE user_id=? AND password_hash=? RETURNING user_id").bind(await hash(token),Date.now()+age*1000,record.id,record.password_hash).first();
  if(!session)throw new ApiError(401,faContent.credentialsChanged);
  return json({user:{id:record.id,name:record.name,phone:record.phone,isHost:isHost(phone),isAdmin:isAdmin(phone)}},200,{"Set-Cookie":sessionCookie(req,token,age)});
});
