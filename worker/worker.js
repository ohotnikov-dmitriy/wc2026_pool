/* Cloudflare Worker — WC2026 bracket pool API (Keycloak / LDAP auth).
 *
 * Bindings / vars (wrangler.toml + secrets):
 *   env.DB              -> D1 database
 *   env.DEADLINE_ISO    -> "2026-06-10T21:00:00Z" (authoritative lock time)
 *   env.ALLOW_ORIGIN    -> CORS origin (default "*")
 *   env.KC_TOKEN_URL    -> Keycloak token endpoint (.../protocol/openid-connect/token)
 *   env.KC_USERINFO_URL -> Keycloak userinfo endpoint (default: token URL with /token -> /userinfo)
 *   env.KC_CLIENT_ID    -> Keycloak client id (default "wc2026-pool")
 *   env.KC_CLIENT_SECRET-> SECRET; only if the client is "confidential"
 *   env.ADMIN_TOKEN     -> SECRET; required to write official results
 *
 * Routes:
 *   POST /api/login        {username,password}   -> {username, token, expires_in}  (LDAP via Keycloak)
 *   GET  /api/entry        (Bearer)              -> {username,email,picks,complete}
 *   PUT  /api/entry        {picks,complete,email?} (Bearer) -> {ok}   (rejected after deadline)
 *   GET  /api/results                            -> {picks,updated}
 *   PUT  /api/results      {picks} (Bearer ADMIN) -> {ok}
 *   GET  /api/leaderboard                        -> {rows:[{username,points,breakdown}],scored}
 */

// ---------- Inlined scoring engine (mirrors assets/engine.js) ----------------
const ENG = (() => {
  const groups = {
    A:['Mexico','South Africa','South Korea','Czechia'], B:['Canada','Bosnia & Herzegovina','Qatar','Switzerland'],
    C:['Brazil','Morocco','Haiti','Scotland'], D:['United States','Paraguay','Australia','Türkiye'],
    E:['Germany','Curaçao','Ivory Coast','Ecuador'], F:['Netherlands','Japan','Sweden','Tunisia'],
    G:['Belgium','Egypt','Iran','New Zealand'], H:['Spain','Cape Verde','Saudi Arabia','Uruguay'],
    I:['France','Senegal','Iraq','Norway'], J:['Argentina','Algeria','Austria','Jordan'],
    K:['Portugal','DR Congo','Uzbekistan','Colombia'], L:['England','Croatia','Ghana','Panama']
  };
  const r32 = [
    {id:73,a:{kind:'rank',g:'A',r:2},b:{kind:'rank',g:'B',r:2}},{id:74,a:{kind:'rank',g:'E',r:1},b:{kind:'third'}},
    {id:75,a:{kind:'rank',g:'F',r:1},b:{kind:'rank',g:'C',r:2}},{id:76,a:{kind:'rank',g:'C',r:1},b:{kind:'rank',g:'F',r:2}},
    {id:77,a:{kind:'rank',g:'I',r:1},b:{kind:'third'}},{id:78,a:{kind:'rank',g:'E',r:2},b:{kind:'rank',g:'I',r:2}},
    {id:79,a:{kind:'rank',g:'A',r:1},b:{kind:'third'}},{id:80,a:{kind:'rank',g:'L',r:1},b:{kind:'third'}},
    {id:81,a:{kind:'rank',g:'D',r:1},b:{kind:'third'}},{id:82,a:{kind:'rank',g:'G',r:1},b:{kind:'third'}},
    {id:83,a:{kind:'rank',g:'K',r:2},b:{kind:'rank',g:'L',r:2}},{id:84,a:{kind:'rank',g:'H',r:1},b:{kind:'rank',g:'J',r:2}},
    {id:85,a:{kind:'rank',g:'B',r:1},b:{kind:'third'}},{id:86,a:{kind:'rank',g:'J',r:1},b:{kind:'rank',g:'H',r:2}},
    {id:87,a:{kind:'rank',g:'K',r:1},b:{kind:'third'}},{id:88,a:{kind:'rank',g:'D',r:2},b:{kind:'rank',g:'G',r:2}}
  ];
  const r16=[{id:89,from:[74,77]},{id:90,from:[73,75]},{id:91,from:[76,78]},{id:92,from:[79,80]},
             {id:93,from:[83,84]},{id:94,from:[81,82]},{id:95,from:[86,88]},{id:96,from:[85,87]}];
  const qf=[{id:97,from:[89,90]},{id:98,from:[93,96]},{id:99,from:[91,92]},{id:100,from:[94,95]}];
  const sf=[{id:101,from:[97,98]},{id:102,from:[99,100]}];
  const byId=a=>{const o={};a.forEach(m=>o[m.id]=m);return o;};
  const R32=byId(r32),R16=byId(r16),QF=byId(qf);
  const POINTS={r32:1,r16:2,qf:3.5,sf:5,bronze:6,final:6,champion:7.5};
  const rankTeam=(p,g,r)=>(p.groups&&p.groups[g]&&p.groups[g][r-1])||null;
  const slotTeam=(p,id,side)=>{const m=R32[id],s=m[side];return s.kind==='rank'?rankTeam(p,s.g,s.r):((p.thirds&&p.thirds[id])||null);};
  const winnerOf=(p,id)=>(p.winners&&p.winners[id])||null;
  function teamsOf(p,id){
    if(R32[id]) return [slotTeam(p,id,'a'),slotTeam(p,id,'b')];
    if(id===104) return [101,102].map(s=>{const t=teamsOf(p,s),w=winnerOf(p,s);return w?(t[0]===w?t[1]:t[0]):null;});
    const m=R16[id]||QF[id]||(id===101||id===102?sf.find(x=>x.id===id):(id===103?{from:[101,102]}:null));
    return m?m.from.map(s=>winnerOf(p,s)):[null,null];
  }
  function predictedSets(p){
    const S={r32:new Set(),r16:new Set(),qf:new Set(),sf:new Set(),bronze:new Set(),final:new Set(),champion:new Set()};
    r32.forEach(m=>{['a','b'].forEach(s=>{const t=slotTeam(p,m.id,s);if(t)S.r32.add(t);});const w=winnerOf(p,m.id);if(w)S.r16.add(w);});
    r16.forEach(m=>{const w=winnerOf(p,m.id);if(w)S.qf.add(w);});
    qf.forEach(m=>{const w=winnerOf(p,m.id);if(w)S.sf.add(w);});
    sf.forEach(m=>{const t=teamsOf(p,m.id),w=winnerOf(p,m.id);if(w)S.final.add(w);if(w&&t[0]&&t[1])S.bronze.add(t[0]===w?t[1]:t[0]);});
    const c=winnerOf(p,103);if(c)S.champion.add(c);
    return S;
  }
  const inter=(a,b)=>{let n=0;a.forEach(x=>{if(b.has(x))n++;});return n;};
  function score(p,actual){
    const P=predictedSets(p),A=predictedSets(actual);
    const bd={r32:inter(P.r32,A.r32)*POINTS.r32,r16:inter(P.r16,A.r16)*POINTS.r16,qf:inter(P.qf,A.qf)*POINTS.qf,
      sf:inter(P.sf,A.sf)*POINTS.sf,bronze:inter(P.bronze,A.bronze)*POINTS.bronze,
      final:inter(P.final,A.final)*POINTS.final,champion:inter(P.champion,A.champion)*POINTS.champion};
    let t=0;for(const k in bd)t+=bd[k];
    return {total:Math.round(t*100)/100,breakdown:bd};
  }
  return {score};
})();

// ---------- HTTP helpers ----------------------------------------------------
function cors(env){
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}
function json(data, status, env){
  return new Response(JSON.stringify(data), { status: status||200,
    headers: Object.assign({ 'Content-Type':'application/json' }, cors(env)) });
}
const err = (msg, status, env) => json({ error: msg }, status||400, env);
const now = () => Date.now();
function deadlinePassed(env){ const iso=env.DEADLINE_ISO; if(!iso) return false; const d=Date.parse(iso); return Number.isFinite(d)&&now()>d; }

// ---------- Keycloak auth ----------------------------------------------------
function b64urlToStr(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; const bin=atob(s);
  const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return new TextDecoder().decode(u); }
function decodeJwt(t){ try{ return JSON.parse(b64urlToStr(String(t).split('.')[1])); }catch(e){ return null; } }
function userinfoUrl(env){ return env.KC_USERINFO_URL || (env.KC_TOKEN_URL ? env.KC_TOKEN_URL.replace(/\/token$/,'/userinfo') : null); }

// Verify the caller's bearer token against Keycloak userinfo; return the username or null.
async function authUser(request, env){
  const tok=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!tok) return null;
  const ui=userinfoUrl(env); if(!ui) return null;
  let r; try{ r=await fetch(ui,{headers:{Authorization:'Bearer '+tok}}); }catch(e){ return null; }
  if(!r.ok) return null;
  const u=await r.json().catch(()=>null);
  if(!u) return null;
  return (u.preferred_username || u.username || u.sub || '').toString().slice(0,80) || null;
}

async function upsertUser(env, username, email){
  const ts=now();
  await env.DB.prepare(
    'INSERT INTO entries (username,email,picks,complete,created,updated) VALUES (?,?,?,?,?,?) '+
    'ON CONFLICT(username) DO UPDATE SET email=COALESCE(excluded.email, entries.email)'
  ).bind(username, email||null, null, 0, ts, ts).run();
}

// ---------- Router ----------------------------------------------------------
export default {
  async fetch(request, env){
    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'');
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors(env)});

    try {
      // ---- POST /api/login : LDAP creds -> Keycloak ROPC -> upsert + token ----
      if(path==='/api/login' && request.method==='POST'){
        const b=await request.json().catch(()=>({}));
        const username=(b.username||'').toString().trim();
        const password=(b.password||'').toString();
        if(!username || !password) return err('Username and password are required',400,env);
        if(!env.KC_TOKEN_URL) return err('Auth is not configured on the server',500,env);
        const form=new URLSearchParams();
        form.set('grant_type','password');
        form.set('client_id', env.KC_CLIENT_ID || 'wc2026-pool');
        if(env.KC_CLIENT_SECRET) form.set('client_secret', env.KC_CLIENT_SECRET);
        form.set('username', username);
        form.set('password', password);
        form.set('scope','openid');
        let kr; try{ kr=await fetch(env.KC_TOKEN_URL,{method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form.toString()}); }
        catch(e){ return err('Auth server unreachable',502,env); }
        const kd=await kr.json().catch(()=>({}));
        if(!kr.ok) return err(kd.error_description || kd.error || 'Invalid username or password', 401, env);
        const token=kd.access_token;
        const claims=decodeJwt(token)||{};
        const uname=(claims.preferred_username || username).toString().slice(0,80);
        await upsertUser(env, uname, claims.email||null);
        return json({ username:uname, token, expires_in:kd.expires_in||300 }, 200, env);
      }

      // ---- GET/PUT /api/entry : the caller's own bracket (auth required) ----
      if(path==='/api/entry'){
        const uname=await authUser(request, env);
        if(!uname) return err('Not authenticated — please sign in again',401,env);
        if(request.method==='GET'){
          let row=await env.DB.prepare('SELECT username,email,picks,complete FROM entries WHERE username=?').bind(uname).first();
          if(!row){ await upsertUser(env, uname, null); row={username:uname,email:null,picks:null,complete:0}; }
          return json({ username:row.username, email:row.email||null, complete:!!row.complete,
            picks: row.picks?JSON.parse(row.picks):null }, 200, env);
        }
        if(request.method==='PUT'){
          if(deadlinePassed(env)) return err('Deadline passed — picks are locked',403,env);
          const b=await request.json().catch(()=>({}));
          const picks=b.picks?JSON.stringify(b.picks):null;
          if(picks && picks.length>20000) return err('Payload too large',413,env);
          const email=b.email?String(b.email).trim().slice(0,120):null;
          await upsertUser(env, uname, email); // ensure row exists
          await env.DB.prepare('UPDATE entries SET picks=?,complete=?,updated=?'+(email?',email=?':'')+' WHERE username=?')
            .bind(...(email?[picks,b.complete?1:0,now(),email,uname]:[picks,b.complete?1:0,now(),uname])).run();
          return json({ ok:true }, 200, env);
        }
      }

      // ---- /api/results : official bracket (admin token) ----
      if(path==='/api/results'){
        if(request.method==='GET'){
          const row=await env.DB.prepare('SELECT picks,updated FROM results WHERE id=1').first();
          return json({ picks: row&&row.picks?JSON.parse(row.picks):null, updated: row?row.updated:null }, 200, env);
        }
        if(request.method==='PUT'){
          const auth=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
          if(!env.ADMIN_TOKEN || auth!==env.ADMIN_TOKEN) return err('Unauthorized',401,env);
          const b=await request.json().catch(()=>({}));
          const picks=b.picks?JSON.stringify(b.picks):null;
          await env.DB.prepare('INSERT INTO results (id,picks,updated) VALUES (1,?,?) '+
            'ON CONFLICT(id) DO UPDATE SET picks=excluded.picks, updated=excluded.updated').bind(picks, now()).run();
          return json({ ok:true }, 200, env);
        }
      }

      // ---- GET /api/leaderboard : usernames + scores ----
      if(path==='/api/leaderboard' && request.method==='GET'){
        const res=await env.DB.prepare('SELECT picks FROM results WHERE id=1').first();
        const actual=res&&res.picks?JSON.parse(res.picks):null;
        const scored=!!actual;
        const { results }=await env.DB.prepare('SELECT username,picks FROM entries ORDER BY updated DESC').all();
        const rows=(results||[]).map(e=>{
          const picks=e.picks?JSON.parse(e.picks):null;
          let points=0, breakdown=null;
          if(picks && actual){ const s=ENG.score(picks,actual); points=s.total; breakdown=s.breakdown; }
          return { username:e.username, points, breakdown };
        }).sort((a,b)=> b.points-a.points || (a.username||'').localeCompare(b.username||''));
        return json({ rows, scored }, 200, env);
      }

      return err('Not found',404,env);
    } catch (e) {
      return err('Server error: ' + (e && e.message || e), 500, env);
    }
  }
};
