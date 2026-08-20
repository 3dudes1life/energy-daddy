const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{...JSON_HEADERS,...extra}});
const nowIso = () => new Date().toISOString();

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
  try{ await env.ENERGY_STATE.put('health:last', nowIso(), {expirationTtl:3600}); kv=true; }catch{}
  return {ok:d1&&kv, service:'energy-daddy-api', version:'1.5', d1, kv, time:nowIso()};
}
async function latest(env){
  const raw=await env.ENERGY_STATE.get('latest:site','json');
  return raw||{status:'empty', message:'No live telemetry ingested yet.'};
}
async function sources(env){
  const {results=[]}=await env.ENERGY_DB.prepare(`SELECT id,provider,kind,scope,status,last_seen_at,metadata_json FROM sources ORDER BY provider,id`).all();
  const out=[];
  for(const r of results){
    const runtime=await env.ENERGY_STATE.get(`provider:${r.id}`,'json');
    out.push({...r,metadata:r.metadata_json?JSON.parse(r.metadata_json):{},runtime:runtime||null});
  }
  return out;
}
async function history(env,url){
  const start=url.searchParams.get('start'), end=url.searchParams.get('end'), metric=url.searchParams.get('metric'), source=url.searchParams.get('source');
  let sql='SELECT interval_start,interval_end,source_id,metric,energy_wh,power_avg_w,quality,scope,metadata_json FROM telemetry_15m WHERE 1=1'; const binds=[];
  if(start){sql+=' AND interval_start>=?';binds.push(new Date(start).toISOString())}
  if(end){sql+=' AND interval_start<?';binds.push(new Date(end).toISOString())}
  if(metric){sql+=' AND metric=?';binds.push(metric)}
  if(source){sql+=' AND source_id=?';binds.push(source)}
  sql+=' ORDER BY interval_start ASC LIMIT 5000';
  const {results=[]}=await env.ENERGY_DB.prepare(sql).bind(...binds).all(); return results;
}
async function live(env){
  const latestRows=(await env.ENERGY_DB.prepare(`
    SELECT t.interval_start,t.interval_end,t.source_id,t.metric,t.energy_wh,t.power_avg_w,t.quality,t.scope,t.metadata_json
    FROM telemetry_15m t
    JOIN (
      SELECT source_id,metric,scope,MAX(interval_start) AS max_start
      FROM telemetry_15m GROUP BY source_id,metric,scope
    ) x ON x.source_id=t.source_id AND x.metric=t.metric AND x.scope=t.scope AND x.max_start=t.interval_start
    ORDER BY t.source_id,t.metric
  `).all()).results||[];
  const src=await sources(env);
  const cron=await env.ENERGY_STATE.get('cron:last');
  return {ok:true,version:'1.5',generated_at:nowIso(),cron_last:cron||null,sources:src,latest:latestRows.map(r=>({...r,metadata:r.metadata_json?JSON.parse(r.metadata_json):{}}))};
}
async function events(env,url){
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20)));
  const {results=[]}=await env.ENERGY_DB.prepare(`SELECT id,ts,type,severity,title,explanation,evidence_json,status FROM events ORDER BY ts DESC LIMIT ?`).bind(limit).all();
  return results.map(r=>({...r,evidence:r.evidence_json?JSON.parse(r.evidence_json):{}}));
}
async function ingestPoints(points,env){
  const stmts=[]; let latestPoint=null;
  for(const p of points){
    if(!p.source_id||!p.metric||p.t==null) continue;
    const start=iso15(p.t), end=new Date(new Date(start).getTime()+15*60*1000).toISOString();
    const energyWh=Number(p.energy_wh||0), powerW=p.power_avg_w==null?null:Number(p.power_avg_w);
    stmts.push(env.ENERGY_DB.prepare(`INSERT INTO telemetry_15m(interval_start,interval_end,source_id,metric,energy_wh,power_avg_w,quality,scope,metadata_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(interval_start,source_id,metric,scope) DO UPDATE SET interval_end=excluded.interval_end,energy_wh=excluded.energy_wh,power_avg_w=excluded.power_avg_w,quality=excluded.quality,metadata_json=excluded.metadata_json`).bind(start,end,p.source_id,p.metric,energyWh,powerW,p.quality||'measured',p.scope||'site',JSON.stringify(p.metadata||{})));
    latestPoint={...p,t:start};
  }
  if(stmts.length) await env.ENERGY_DB.batch(stmts);
  if(latestPoint) await env.ENERGY_STATE.put('latest:site',JSON.stringify({status:'ok',point:latestPoint,updated_at:nowIso()}));
  return stmts.length;
}
async function ingest(request,env){
  if(!isAuthorized(request,env)) return {error:'unauthorized',status:401};
  const body=await request.json(); const points=Array.isArray(body)?body:body.points;
  if(!Array.isArray(points)||!points.length) return {error:'points array required',status:400};
  if(points.length>2000) return {error:'max 2000 points per request',status:413};
  return {ok:true,accepted:await ingestPoints(points,env)};
}
async function recordEvent(env,event){
  await env.ENERGY_DB.prepare(`INSERT INTO events(ts,type,severity,title,explanation,evidence_json,status) VALUES(?,?,?,?,?,?,?)`).bind(event.ts||nowIso(),event.type||'observation',event.severity||'info',event.title||'Untitled',event.explanation||'',JSON.stringify(event.evidence||{}),event.status||'open').run();
}
async function providerRun(env,provider,status,points=0,message=''){
  try{await env.ENERGY_DB.prepare(`INSERT INTO provider_runs(provider,started_at,completed_at,status,points,message) VALUES(?,?,?,?,?,?)`).bind(provider,nowIso(),nowIso(),status,points,message).run()}catch{}
}
async function setProviderState(env,id,state){
  await env.ENERGY_STATE.put(`provider:${id}`,JSON.stringify({...state,updated_at:nowIso()}));
}

async function pollSolarEdge(env){
  const siteId=(env.SOLAREDGE_SITE_ID||'').trim();
  const apiKey=(env.SOLAREDGE_API_KEY||'').trim();
  if(!siteId||!apiKey){
    const state={status:'awaiting_credentials',live:false,message:'SolarEdge API key/site ID not configured. Build 1.5 will not guess or poll without them.'};
    await setProviderState(env,'solaredge-site',state);
    await providerRun(env,'SolarEdge','skipped',0,state.message);
    return state;
  }
  try{
    const endpoint=`https://monitoringapi.solaredge.com/site/${encodeURIComponent(siteId)}/overview?api_key=${encodeURIComponent(apiKey)}`;
    const res=await fetch(endpoint,{headers:{accept:'application/json'}});
    if(!res.ok) throw new Error(`SolarEdge HTTP ${res.status}`);
    const body=await res.json();
    const overview=body.overview||{};
    const power=Number(overview.currentPower?.power);
    if(!Number.isFinite(power)) throw new Error('SolarEdge response did not include currentPower.power');
    const captured=nowIso();
    const accepted=await ingestPoints([{source_id:'solaredge-site',metric:'solar_production',t:captured,energy_wh:power*0.25,power_avg_w:power,scope:'inverter',quality:'derived_live',metadata:{provider:'SolarEdge',provider_last_update:overview.lastUpdateTime||null,derivation:'current power × 15 minutes; use interval API later for settlement-grade history'}}],env);
    await env.ENERGY_DB.prepare(`UPDATE sources SET status='live',last_seen_at=? WHERE id='solaredge-site'`).bind(captured).run();
    const state={status:'live',live:true,last_seen_at:captured,power_w:power,points:accepted,message:'SolarEdge production poll succeeded.'};
    await setProviderState(env,'solaredge-site',state); await providerRun(env,'SolarEdge','ok',accepted,'current production');
    return state;
  }catch(err){
    const state={status:'error',live:false,message:String(err?.message||err)};
    await setProviderState(env,'solaredge-site',state); await providerRun(env,'SolarEdge','error',0,state.message);
    await recordEvent(env,{type:'provider_error',severity:'warn',title:'SolarEdge poll failed',explanation:state.message,evidence:{provider:'SolarEdge'},status:'open'});
    return state;
  }
}

async function runBrainCycle(env){
  const started=nowIso();
  await env.ENERGY_STATE.put('cron:last',started);
  const solar=await pollSolarEdge(env);
  await setProviderState(env,'tesla-site',{status:'historical_only',live:false,message:'Tesla live polling intentionally disabled to avoid paid API use. Battery impact comes from periodic history imports.'});
  await setProviderState(env,'sdge-meter',{status:'reconciliation',live:false,message:'SDG&E is treated as delayed settlement/reconciliation evidence, not a real-time feed.'});
  await setProviderState(env,'emporia-ev',{status:'manual_or_bridge',live:false,message:'Emporia EV attribution is loaded from exports today; a local bridge can be added later without blocking SolarEdge live production.'});
  return {ok:true,started_at:started,solaredge:solar};
}

async function api(request,env){
  const url=new URL(request.url), path=url.pathname;
  const headers=cors(request,env);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  try{
    if(path==='/api/health') return json(await health(env),200,headers);
    if(path==='/api/latest') return json(await latest(env),200,headers);
    if(path==='/api/live') return json(await live(env),200,headers);
    if(path==='/api/sources') return json(await sources(env),200,headers);
    if(path==='/api/history') return json(await history(env,url),200,headers);
    if(path==='/api/events') return json(await events(env,url),200,headers);
    if(path==='/api/ingest'&&request.method==='POST'){const r=await ingest(request,env);return json(r,r.status||200,headers)}
    if(path==='/api/event'&&request.method==='POST'){
      if(!isAuthorized(request,env)) return json({error:'unauthorized'},401,headers);
      await recordEvent(env,await request.json()); return json({ok:true},201,headers);
    }
    if(path==='/api/brain/run'&&request.method==='POST'){
      if(!isAuthorized(request,env)) return json({error:'unauthorized'},401,headers);
      return json(await runBrainCycle(env),200,headers);
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
    ctx.waitUntil(runBrainCycle(env));
  }
};
