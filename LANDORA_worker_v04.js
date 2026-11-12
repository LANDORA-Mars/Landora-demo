// LANDORA Worker API v0.4 — deployment candidate, NOT deployed.
// Required env: DB (Cloudflare D1), AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL.
// Optional env: ALLOWED_ORIGIN (exact HTTPS origin). No bearer token or secrets in GitHub.
const headers={ "content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff" };
const reply=(obj,status=200,origin="")=>new Response(JSON.stringify(obj),{status,headers:{...headers,...(origin?{"access-control-allow-origin":origin,"vary":"Origin"}:{})}});
const uuid=()=>crypto.randomUUID();
const b64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0));
const decode=s=>JSON.parse(new TextDecoder().decode(b64(s)));
const enc=s=>new TextEncoder().encode(s);
const isOrigin=(s,env)=>!!s&&s===env.ALLOWED_ORIGIN&&s.startsWith("https://");
async function auth(req,env){
 const m=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("authorization")||"");
 if(!m)throw {status:401,code:"LOGIN_REQUIRED"};
 if(!env.AUTH_ISSUER||!env.AUTH_AUDIENCE||!env.AUTH_JWKS_URL)throw {status:503,code:"AUTH_NOT_CONFIGURED"};
 const parts=m[1].split(".");if(parts.length!==3)throw {status:401,code:"INVALID_TOKEN"};
 let h,p;try{h=decode(parts[0]);p=decode(parts[1])}catch{throw {status:401,code:"INVALID_TOKEN"}}
 if(h.alg!=="RS256"||!h.kid||h.typ&&h.typ!=="JWT")throw {status:401,code:"UNSUPPORTED_TOKEN"};
 const now=Math.floor(Date.now()/1000);
 if(p.iss!==env.AUTH_ISSUER||!(Array.isArray(p.aud)?p.aud.includes(env.AUTH_AUDIENCE):p.aud===env.AUTH_AUDIENCE)||!p.sub||!Number.isFinite(p.exp)||p.exp<=now||p.nbf&&p.nbf>now+30)throw {status:401,code:"TOKEN_CLAIMS_INVALID"};
 const jwksUrl=new URL(env.AUTH_JWKS_URL);
 if(jwksUrl.protocol!=="https:")throw {status:503,code:"AUTH_CONFIG_INVALID"};
 const res=await fetch(jwksUrl.toString(),{cf:{cacheTtl:300,cacheEverything:true}});
 if(!res.ok)throw {status:503,code:"AUTH_KEYS_UNAVAILABLE"};
 const jwks=await res.json();const jwk=(jwks.keys||[]).find(k=>k.kid===h.kid&&k.kty==="RSA"&&(!k.use||k.use==="sig")&&(!k.alg||k.alg==="RS256"));
 if(!jwk)throw {status:401,code:"UNKNOWN_SIGNING_KEY"};
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64(parts[2]),enc(parts[0]+"."+parts[1])))throw {status:401,code:"INVALID_SIGNATURE"};
 return p.sub;
}
async function member(db,sub){
 const m=await db.prepare("SELECT id,organization_id,role FROM ld_members WHERE auth_subject=?").bind(sub).first();
 if(!m)throw {status:403,code:"MEMBER_NOT_PROVISIONED"};
 return m;
}
const checkDb=env=>{if(!env.DB)throw {status:503,code:"DATABASE_NOT_BOUND"};return env.DB};
const urlOk=s=>{try{const u=new URL(s);return u.protocol==="https:"&&!!u.hostname&&u.hostname.includes(".")&&!u.username&&!u.password&&s.length<=2048}catch{return false}};
export default {async fetch(req,env){
 const origin=req.headers.get("origin")||"",allowed=isOrigin(origin,env)?origin:"",url=new URL(req.url);
 if(req.method==="OPTIONS"){if(!allowed)return new Response(null,{status:403});return new Response(null,{status:204,headers:{"access-control-allow-origin":allowed,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Authorization,Content-Type","access-control-max-age":"600","vary":"Origin"}})}
 try{
 if(origin&&!allowed)throw {status:403,code:"ORIGIN_DENIED"};
 if(url.pathname==="/health"&&req.method==="GET")return reply({service:"LANDORA API",version:"0.4-review",status:"online",liveMatching:false},200,allowed);
 if(!url.pathname.startsWith("/api/"))throw {status:404,code:"NOT_FOUND"};
 const db=checkDb(env),sub=await auth(req,env),m=await member(db,sub);
 if(url.pathname==="/api/me"&&req.method==="GET")return reply({memberId:m.id,role:m.role,organizationId:m.organization_id},200,allowed);
 if(url.pathname==="/api/cases"&&req.method==="GET"){
 const rows=await db.prepare("SELECT id,listing_url,listing_domain,status,created_at FROM ld_cases WHERE organization_id=? ORDER BY created_at DESC LIMIT 50").bind(m.organization_id).all();
 return reply({data:rows.results||[]},200,allowed);
 }
 if(url.pathname==="/api/cases"&&req.method==="POST"){
 const len=Number(req.headers.get("content-length")||0);if(len>4096)throw {status:413,code:"BODY_TOO_LARGE"};
 let body;try{body=await req.json()}catch{throw {status:400,code:"INVALID_JSON"}}
 if(!body||typeof body.url!=="string"||!urlOk(body.url))throw {status:422,code:"INVALID_LISTING_URL"};
 const subrow=await db.prepare("SELECT id,quota_limit,quota_used,status,trial_ends_at,period_ends_at FROM ld_subscriptions WHERE organization_id=? AND status IN ('trialing','active') ORDER BY updated_at DESC LIMIT 1").bind(m.organization_id).first();
 if(!subrow)throw {status:402,code:"SUBSCRIPTION_REQUIRED"};
 const now=new Date().toISOString();
 if(subrow.status==="trialing"&&(!subrow.trial_ends_at||subrow.trial_ends_at<=now))throw {status:402,code:"TRIAL_EXPIRED"};
 if(subrow.status==="active"&&subrow.period_ends_at&&subrow.period_ends_at<=now)throw {status:402,code:"SUBSCRIPTION_EXPIRED"};
 // Reserve quota and create a case in one D1 batch transaction. changes() is the
 // SQLite connection-local count from the preceding conditional UPDATE, so an
 // exhausted quota cannot create a case merely because quota_used==quota_limit.
 const id=uuid(),u=new URL(body.url),audit=uuid();
 const [quota,created]=await db.batch([
 db.prepare("UPDATE ld_subscriptions SET quota_used=quota_used+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND quota_used<quota_limit").bind(subrow.id),
 db.prepare("INSERT INTO ld_cases(id,organization_id,created_by,listing_url,listing_domain,status) SELECT ?,?,?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM ld_subscriptions WHERE id=? AND quota_used<=quota_limit)").bind(id,m.organization_id,m.id,u.href,u.hostname,"queued",subrow.id)
 ]);
 // D1 batch is transactional but quota conditional failure does not throw; fail closed and compensate below.
 if(!quota.meta?.changes||!created.meta?.changes){
 if(quota.meta?.changes)await db.prepare("UPDATE ld_subscriptions SET quota_used=quota_used-1 WHERE id=? AND quota_used>0").bind(subrow.id).run();
 throw {status:429,code:"QUOTA_EXHAUSTED"};
 }
 await db.prepare("INSERT INTO ld_audit_events(id,organization_id,actor_id,action,object_type,object_id) VALUES (?,?,?,?,?,?)").bind(audit,m.organization_id,m.id,"case.create","case",id).run();
 return reply({id,status:"queued",liveMatching:false,message:"案件已建立，尚未連接授權來源解析器。"},201,allowed);
 }
 const match=/^\/api\/cases\/([0-9a-f-]{36})$/.exec(url.pathname);
 if(match&&req.method==="GET"){
 const row=await db.prepare("SELECT id,listing_url,listing_domain,status,created_at FROM ld_cases WHERE id=? AND organization_id=?").bind(match[1],m.organization_id).first();
 if(!row)throw {status:404,code:"CASE_NOT_FOUND"};
 const candidates=await db.prepare("SELECT id,candidate_address,land_section,land_number,building_number,score,score_version,verification FROM ld_candidates WHERE case_id=? ORDER BY score DESC LIMIT 50").bind(row.id).all();
 return reply({case:row,candidates:candidates.results||[]},200,allowed);
 }
 throw {status:404,code:"NOT_FOUND"};
 }catch(e){return reply({success:false,error:e.code||"INTERNAL_ERROR"},e.status||500,allowed)}
 }};
