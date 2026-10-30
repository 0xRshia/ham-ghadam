import crypto from "node:crypto";

export async function testEvenline({ db, call, event, user, check, base, host, secret }) {
  const buyer = user(211), stranger = user(212), account = user(213);
  const eventId = event("evenline-collection",20);
  const request = async (method,route,data,token) => {
    const response=await fetch(base+route,{method,headers:{Origin:base,"Content-Type":"application/json",...(token?{Cookie:`hg_session=${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(10000)});
    return { status:response.status,data:await response.json() };
  };
  const challengeIds=[];
  function challenge(phone) {
    const id=crypto.randomUUID(),code="123456";
    challengeIds.push(id);
    db.prepare("INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)").run(id,phone,crypto.createHmac("sha256",secret).update(`${id}:${phone}:${code}`).digest("hex"),Date.now()+300000);
    return {challengeId:id,code};
  }
  const cookieToken = response => response.cookie?.match(/hg_session=([^;]+)/)?.[1];
  let collectionId;
  try {
    const profile = await request("GET", "/api/profile", undefined, buyer.token);
    const city = db.prepare("SELECT city FROM events WHERE id=?").get(eventId).city;
    check(profile.data.cities.includes(city), "Profile city choices include published event cities");
    check((await request("PATCH", "/api/profile", { city, bio: "معرفی تازه" }, buyer.token)).status === 200,
      "Profile accepts a city from its enumerated choices");
    check((await request("PATCH", "/api/profile", { city: "invalid-city-not-in-catalog" }, buyer.token)).status === 400,
      "Profile rejects arbitrary city text");
    check((await request("GET", "/api/profile", undefined, buyer.token)).data.profile.city === city,
      "Rejected city updates preserve the saved city");
    check((await request("PATCH", "/api/profile", { city: "" }, buyer.token)).status === 200,
      "Profile city selection remains optional");
    const created=await request("POST","/api/collections",{title:"مجموعهٔ آزمون"},host.token);
    check(created.status===201,"Collection is created as an owner-controlled draft");
    collectionId=created.data.id;
    const path=`/api/collections/${collectionId}`;
    check((await request("GET",path,undefined,buyer.token)).status===404,"Private collection is hidden from other users");
    check(!(await request("GET","/api/collections?discover=true")).data.collections.some(item=>item.id===collectionId),"Discovery excludes private drafts for anonymous visitors");
    const contents={title:"مجموعهٔ هنر و گفتگو",description:"معرفی مجموعهٔ آزمون",published:true,eventIds:[eventId]};
    check((await request("PATCH",path,contents,stranger.token)).status===404,"Only the owner can edit a collection");
    check((await request("PATCH",path,contents,host.token)).status===200,"Owner can publish real events in a collection");
    check((await request("GET","/api/collections?discover=true")).data.collections.some(item=>item.id===collectionId),"Anonymous discovery includes published collections");
    for(let i=0;i<2;i++)check((await request("PUT",path+"/follow",{},buyer.token)).status===200,"Following a collection is idempotent");
    let detail=await request("GET",path,undefined,buyer.token);
    check(detail.data.collection.following && detail.data.collection.followers===1 && detail.data.collection.event_count===1 && detail.data.events[0].id===eventId,"Collection membership, follow count and event count reflect stored records");
    check((await request("PUT",path+"/follow",{},host.token)).status===404,"Owners cannot follow their own collection");
    check((await request("PATCH",path,{...contents,eventIds:["unavailable"]},host.token)).status===400,"Collection updates reject unavailable events");
    detail=await request("GET",path,undefined,buyer.token);
    check(detail.data.events[0].id===eventId,"Invalid collection update preserves previous membership");
    await request("PATCH",path,{...contents,published:false},host.token);
    check(!(await request("GET","/api/collections?discover=true")).data.collections.some(item=>item.id===collectionId),"Unpublished collections leave discovery immediately");
    check((await request("GET",path,undefined,buyer.token)).status===404,"Unpublishing revokes public access even for followers");
    check((await request("DELETE",path+"/follow",{},buyer.token)).status===200,"Users can unfollow a collection after it becomes private");
    await request("DELETE",path,{},host.token);
    check(db.prepare("SELECT COUNT(*) n FROM collection_events WHERE collection_id=?").get(collectionId).n===0,"Deleting a collection cascades its memberships");

    const tierPath=`/api/host/events/${eventId}/tiers`;
    const regular={id:crypto.randomUUID(),name:"بلیت عادی",description:"ورود به برنامه",price:0,capacity:3,active:1};
    const premium={id:crypto.randomUUID(),name:"بلیت ویژه",description:"امکانات بیشتر",price:2000,capacity:5,active:1};
    check((await request("PUT",tierPath,{tiers:[regular,premium]},buyer.token)).status===403,"Ticket tier management requires host authorization");
    check((await request("PUT",tierPath,{tiers:[regular,premium]},host.token)).status===200,"Host can create priced and capacity-limited ticket tiers");
    const tierBooking=await call("/api/reservations",{eventId,quantity:1,name:"خریدار آزمون",requestKey:crypto.randomUUID(),items:[{tierId:regular.id,quantity:1}]},buyer.token);
    check(tierBooking.status===201 && tierBooking.data.reservation.total===0,"A real free tier booking snapshots the selected price");
    check((await request("PUT",tierPath,{tiers:[{...regular,capacity:0,name:"تغییر نام"},premium]},host.token)).status===409,"Host cannot reduce a tier below confirmed inventory");
    check(db.prepare("SELECT name FROM event_ticket_tiers WHERE id=?").get(regular.id).name===regular.name,"Invalid tier update is atomic");
    check((await request("PUT",tierPath,{tiers:[{...regular,name:"نام تازه",price:5000,active:0},premium]},host.token)).status===200,"Hosts can rename and retire a tier without deleting it");
    const editedEvent=(await call(`/api/events/${eventId}`)).data.event;
    check(editedEvent.minimum_price===premium.price && editedEvent.ticketTiers.length===1 && editedEvent.ticketTiers[0].id===premium.id,"Discovery price and available ticket choices reflect active tiers");
    check((await request("GET",tierPath,undefined,host.token)).data.tiers.some(tier=>tier.id===regular.id && tier.active===0),"Retired tiers remain available to the host for reactivation");
    const snapshot=db.prepare("SELECT tier_name,unit_price FROM reservation_items WHERE reservation_id=?").get(tierBooking.data.reservation.id);
    check(snapshot.tier_name===regular.name && snapshot.unit_price===0,"Tier edits preserve purchased names and prices");
    check((await call("/api/reservations",{eventId,quantity:1,name:"خریدار آزمون",requestKey:crypto.randomUUID(),items:[{tierId:regular.id,quantity:1}]},buyer.token)).status===400,"Retired tiers reject new reservations");
    check((await request("PUT",tierPath,{tiers:[{...regular,active:0},{...premium,active:0}]},host.token)).status===400,"A tiered event cannot accidentally revert to legacy pricing");

    const otp=challenge(account.phone);
    check((await call("/api/auth/verify",{...otp,name:"ک"})).status===400,"Signup validates the account name before consuming verification");
    const verified=await call("/api/auth/verify",{...otp,name:"کاربر آزمون"});
    check(verified.status===200 && verified.data.user.id===account.id && !!cookieToken(verified),"An SMS-verified phone signs in and creates a session");
    check((await call("/api/auth/verify",{...otp,name:"کاربر آزمون"})).status===400,"Consumed verification cannot be replayed");
    for(const route of ["/api/auth/password","/api/auth/register","/api/auth/password-reset"]){
      const response=await fetch(base+route,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({phone:account.phone,password:"رمز عبور آزمایشی امن ۱۴۰۵"}),signal:AbortSignal.timeout(10000)});
      check(response.status===404,`Password sign-in route ${route} is disabled`);
    }
  } finally {
    if(collectionId)db.prepare("DELETE FROM collections WHERE id=?").run(collectionId);
    for(const id of challengeIds)db.prepare("DELETE FROM challenges WHERE id=?").run(id);
  }
}
