// LANDORA 授權資料索引查詢 Worker (staging); no external scraping.
// Deploy only after configuring DB, QUERY_TOKEN, INGEST_TOKEN and ALLOWED_ORIGIN.
const json=(body,status=200,origin='')=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}});
const norm=s=>String(s??'').normalize('NFKC').replace(/臺/g,'台').replace(/[\\s　]/g,'').toLowerCase();
const parcel=s=>norm(s).replace(/地號$/,'').replace(/^0+(?=\\d)/,'');
const str=(s,max=150)=>typeof s==='string'?s.trim().slice(0,max):'';
const validUrl=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.')}catch{return false}};
const authorized=(request,secret)=>!!secret&&request.headers.get('authorization')==='Bearer '+secret;
const getOrigin=(req,env)=>req.headers.get('origin')===env.ALLOWED_ORIGIN?env.ALLOWED_ORIGIN:'';
const safeRow=r=>({url:r.listing_url,type:r.listing_type,city:r.city,district:r.district,section:r.section,address:r.address,community:r.community,floor:r.floor,areaPing:r.area_ping,source:r.source_name,sourceUrl:r.source_url,verified:!!r.verified,observedAt:r.observed_at,parcels:r.parcels?JSON.parse(r.parcels):[]});
export default {async fetch(request,env){
 const u=new URL(request.url),origin=getOrigin(request,env);
 if(request.method==='OPTIONS'){
  if(!origin)return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','access-control-max-age':'600','vary':'Origin'}});
 }
 if(!env.DB||!env.QUERY_TOKEN||!env.INGEST_TOKEN||!env.ALLOWED_ORIGIN)return json({error:'SERVICE_NOT_CONFIGURED'},503,origin);
 if(u.pathname==='/health'&&request.method==='GET')return json({service:'LANDORA 授權索引',status:'configured',productionReady:false},200,origin);
 if(u.pathname==='/api/index/ingest'&&request.method==='POST'){
  if(!authorized(request,env.INGEST_TOKEN))return json({error:'UNAUTHORIZED'},401,origin);
  let body;try{body=await request.json()}catch{return json({error:'INVALID_JSON'},400,origin)}
  if(!body||!['house','land'].includes(body.type)||!validUrl(body.url)||!validUrl(body.sourceUrl)||!str(body.source)||!str(body.permissionBasis)||!str(body.city)||!str(body.district)||!str(body.observedAt)||!str(body.id))return json({error:'INVALID_OR_UNLICENSED_RECORD'},400,origin);
  const parcels=Array.isArray(body.parcels)?body.parcels:[];
  if(parcels.length>50||parcels.some(p=>!p||!str(p.number,50)))return json({error:'INVALID_PARCELS'},400,origin);
  if(body.type==='land'&&(!str(body.section)||!parcels.length))return json({error:'LAND_REQUIRES_SECTION_AND_PARCELS'},400,origin);
  const id=str(body.id,100),now=new Date().toISOString();
  try{
   const statements=[env.DB.prepare('INSERT INTO listing_index (id,listing_url,listing_type,city,district,section,address,community,floor,area_ping,source_name,source_url,permission_basis,verified,observed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET listing_url=excluded.listing_url,listing_type=excluded.listing_type,city=excluded.city,district=excluded.district,section=excluded.section,address=excluded.address,community=excluded.community,floor=excluded.floor,area_ping=excluded.area_ping,source_name=excluded.source_name,source_url=excluded.source_url,permission_basis=excluded.permission_basis,verified=excluded.verified,observed_at=excluded.observed_at,updated_at=excluded.updated_at').bind(id,body.url,body.type,str(body.city),str(body.district),str(body.section)||null,str(body.address)||null,str(body.community)||null,Number.isInteger(body.floor)?body.floor:null,Number.isFinite(body.areaPing)?body.areaPing:null,str(body.source),body.sourceUrl,str(body.permissionBasis,500),body.verified===true?1:0,body.observedAt,now),env.DB.prepare('DELETE FROM listing_parcels WHERE listing_id=?').bind(id),...parcels.map(p=>env.DB.prepare('INSERT INTO listing_parcels (listing_id,parcel_number,share_numerator,share_denominator) VALUES (?,?,?,?)').bind(id,parcel(p.number),Number.isInteger(p.shareNumerator)?p.shareNumerator:null,Number.isInteger(p.shareDenominator)&&p.shareDenominator>0?p.shareDenominator:null))];
   await env.DB.batch(statements);return json({success:true,id,parcels:parcels.length},200,origin);
  }catch(e){console.error('index ingest failed',e);return json({error:'INDEX_WRITE_FAILED'},500,origin)}
 }
 if(!authorized(request,env.QUERY_TOKEN))return json({error:'UNAUTHORIZED'},401,origin);
 if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405,origin);
 const city=norm(u.searchParams.get('city')),district=norm(u.searchParams.get('district'));
 if(!city||!district||city.length>30||district.length>30)return json({error:'CITY_AND_DISTRICT_REQUIRED'},400,origin);
 try{
  let stmt;
  if(u.pathname==='/api/lookup/address'){
   const q=norm(u.searchParams.get('q'));if(q.length<3||q.length>120)return json({error:'ADDRESS_REQUIRED'},400,origin);
   stmt=env.DB.prepare(`SELECT l.*, (SELECT json_group_array(parcel_number) FROM listing_parcels p WHERE p.listing_id=l.id) parcels FROM listing_index l WHERE l.listing_type='house' AND replace(replace(l.city,'臺','台'),' ','')=? AND replace(replace(l.district,'臺','台'),' ','')=? AND (replace(replace(coalesce(l.address,''),'臺','台'),' ','') LIKE ? OR replace(replace(coalesce(l.community,''),'臺','台'),' ','') LIKE ?) ORDER BY l.observed_at DESC LIMIT 50`).bind(city,district,'%'+q+'%','%'+q+'%');
  }else if(u.pathname==='/api/lookup/parcel'){
   const section=norm(u.searchParams.get('section')),number=parcel(u.searchParams.get('number'));
   if(!section||!number||section.length>100||number.length>50)return json({error:'SECTION_AND_PARCEL_REQUIRED'},400,origin);
   stmt=env.DB.prepare(`SELECT l.*, (SELECT json_group_array(parcel_number) FROM listing_parcels p2 WHERE p2.listing_id=l.id) parcels FROM listing_index l JOIN listing_parcels p ON p.listing_id=l.id WHERE l.listing_type='land' AND replace(replace(l.city,'臺','台'),' ','')=? AND replace(replace(l.district,'臺','台'),' ','')=? AND replace(replace(l.section,'臺','台'),' ','')=? AND p.parcel_number=? ORDER BY l.observed_at DESC LIMIT 50`).bind(city,district,section,number);
  }else return json({error:'NOT_FOUND'},404,origin);
  const rows=(await stmt.all()).results||[];return json({success:true,count:rows.length,results:rows.map(safeRow),notice:'僅為授權索引候選，刊登是否仍有效及門牌真實性需獨立核實'},200,origin);
 }catch(e){console.error('lookup failed',e);return json({error:'LOOKUP_FAILED'},500,origin)}
}};
