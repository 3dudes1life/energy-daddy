const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{...JSON_HEADERS,...extra}});

function allowedOrigin(request, env){
  const origin=request.headers.get('origin');
  if(!origin) return null;
  const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
function cors(request, env){
  const origin=allowedOrigin(request, env);
  return origin ? {'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'content-type,x-energy-key','access-control-allow-methods':'GET,POST,OPTIONS'} : {};
}
function isAuthorized(request, env){
  if(request.method==='GET') return true;
  if(!env.INGEST_KEY) return false;
  return request.headers.get('x-energy-key')===env.INGEST_KEY;
}
function iso15(dateInput){
  const d=new Date(dateInput); if(Number.isNaN(d.getTime())) throw new Error('invalid timestamp');
  d.setUTCMinutes(Math.floor(d.getUTCMinutes()/15)*15,0,0); return d.toISOString();
}
async function health(env){
  let d1=false, kv=false;
  try{ await env.ENERGY_DB.prepare('SELECT 1 AS ok').first(); d1=true; }catch{}
  try{ await env.ENERGY_STATE.put('health:last', new Date().toISOString(), {expirationTtl:3600}); kv=true; }catch{}
  return {ok:d1&&kv, service:'energy-daddy-api', version:'1.4', d1, kv, time:new Date().toISOString()};
}
async function latest(env){
  const raw=await env.ENERGY_STATE.get('latest:site','json');
  return raw||{status:'empty', message:'No live telemetry ingested yet.'};
}
async function sources(env){
  const {results=[]}=await env.ENERGY_DB.prepare(`SELECT id,provider,kind,scope,status,last_seen_at,metadata_json FROM sources ORDER BY provider,id`).all();
  return results.map(r=>({...r,metadata:r.metadata_json?JSON.parse(r.metadata_json):{}}));
}
async function history(env,url){
  const start=url.searchParams.get('start'), end=url.searchParams.get('end'), metric=url.searchParams.get('metric'), source=url.searchParams.get('source');
  let sql='SELECT interval_start,interval_end,source_id,metric,energy_wh,power_avg_w,quality,scope FROM telemetry_15m WHERE 1=1'; const binds=[];
  if(start){sql+=' AND interval_start>=?';binds.push(new Date(start).toISOString())}
  if(end){sql+=' AND interval_start<?';binds.push(new Date(end).toISOString())}
  if(metric){sql+=' AND metric=?';binds.push(metric)}
  if(source){sql+=' AND source_id=?';binds.push(source)}
  sql+=' ORDER BY interval_start ASC LIMIT 5000';
  const {results=[]}=await env.ENERGY_DB.prepare(sql).bind(...binds).all(); return results;
}
async function ingest(request,env){
  if(!isAuthorized(request,env)) return {error:'unauthorized',status:401};
  const body=await request.json(); const points=Array.isArray(body)?body:body.points;
  if(!Array.isArray(points)||!points.length) return {error:'points array required',status:400};
  if(points.length>2000) return {error:'max 2000 points per request',status:413};
  const stmts=[]; let latestPoint=null;
  for(const p of points){
    if(!p.source_id||!p.metric||p.t==null) continue;
    const start=iso15(p.t), end=new Date(new Date(start).getTime()+15*60*1000).toISOString();
    const energyWh=Number(p.energy_wh||0), powerW=p.power_avg_w==null?null:Number(p.power_avg_w);
    stmts.push(env.ENERGY_DB.prepare(`INSERT INTO telemetry_15m(interval_start,interval_end,source_id,metric,energy_wh,power_avg_w,quality,scope,metadata_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(interval_start,source_id,metric,scope) DO UPDATE SET interval_end=excluded.interval_end,energy_wh=excluded.energy_wh,power_avg_w=excluded.power_avg_w,quality=excluded.quality,metadata_json=excluded.metadata_json`).bind(start,end,p.source_id,p.metric,energyWh,powerW,p.quality||'measured',p.scope||'site',JSON.stringify(p.metadata||{})));
    latestPoint={...p,t:start};
  }
  if(stmts.length) await env.ENERGY_DB.batch(stmts);
  if(latestPoint) await env.ENERGY_STATE.put('latest:site',JSON.stringify({status:'ok',point:latestPoint,updated_at:new Date().toISOString()}));
  return {ok:true,accepted:stmts.length};
}
async function recordEvent(env,event){
  await env.ENERGY_DB.prepare(`INSERT INTO events(ts,type,severity,title,explanation,evidence_json,status) VALUES(?,?,?,?,?,?,?)`).bind(event.ts||new Date().toISOString(),event.type||'observation',event.severity||'info',event.title||'Untitled',event.explanation||'',JSON.stringify(event.evidence||{}),event.status||'open').run();
}

async function api(request,env){
  const url=new URL(request.url), path=url.pathname;
  const headers=cors(request,env);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  try{
    if(path==='/api/health') return json(await health(env),200,headers);
    if(path==='/api/latest') return json(await latest(env),200,headers);
    if(path==='/api/sources') return json(await sources(env),200,headers);
    if(path==='/api/history') return json(await history(env,url),200,headers);
    if(path==='/api/ingest'&&request.method==='POST'){const r=await ingest(request,env);return json(r,r.status||200,headers)}
    if(path==='/api/event'&&request.method==='POST'){
      if(!isAuthorized(request,env)) return json({error:'unauthorized'},401,headers);
      await recordEvent(env,await request.json()); return json({ok:true},201,headers);
    }
    return json({error:'not found'},404,headers);
  }catch(err){return json({error:'server_error',message:String(err?.message||err)},500,headers)}
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')) return api(request,env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx){
    ctx.waitUntil((async()=>{
      const now=new Date().toISOString();
      await env.ENERGY_STATE.put('cron:last',now);
      // Build 1.4 intentionally does not poll providers yet. Future provider adapters
      // live server-side here so Tesla/SolarEdge/SDG&E credentials never enter the UI.
      await recordEvent(env,{ts:now,type:'heartbeat',severity:'info',title:'Energy brain heartbeat',explanation:'Scheduled Worker ran successfully.',status:'closed'});
    })());
  }
};
