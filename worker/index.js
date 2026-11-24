import html from './generated/html.js';
import css from './generated/css.js';
import script from './generated/client.js';

const chapters = new Set(['cinema','books','music','places','midnight','letters','wishes','world','memories','open','capsule','daily']);
const types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg'};
const base = {'X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), geolocation=(), microphone=(self)','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src https://open.spotify.com https://www.youtube-nocookie.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const headers = (type, extras) => ({...base,'Content-Type':type,...extras});
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:headers('application/json; charset=utf-8',{'Cache-Control':'no-store'})});
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const query = (env,sql,...args) => env.DB.prepare(sql).bind(...args);
const all = async stmt => (await stmt.all()).results;
const now = () => new Date().toISOString();
const latest = 'hidden=0 AND (opens IS NULL OR opens<=?)';
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const clean = (value,max) => typeof value==='string'?value.trim().slice(0,max):'';
const validId = value => /^[a-f0-9-]{36}$/.test(value);
const key = (entry,index,extension) => entry+'/'+index+'.'+extension;
const secureEqual = async (a,b) => {
  const first=await digest(a), second=await digest(b);
  let mismatch=0;
  for(let i=0;i<first.length;i++) mismatch |= first.charCodeAt(i)^second.charCodeAt(i);
  return mismatch===0;
};
async function limit(req,env,cap=20) {
  const time=Math.floor(Date.now()/900000);
  const identity=req.headers.get('CF-Connecting-IP')||'local';
  const salt=env.RATE_LIMIT_SECRET||env.ADMIN_KEY||'journal-rate';
  const bucket=await digest(salt+':'+time+':'+identity);
  const row=await query(env,'INSERT INTO limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits',bucket,time+2).first();
  if(row.hits>cap) fail('The ink needs a moment to dry. Try again in a few minutes.',429);
  if(row.hits===1) await query(env,'DELETE FROM limits WHERE expires<?',time).run();
}
function entryData(row) {
  const {owner,hidden,...data}=row;
  if(row.opens && row.opens>now()) return {page:row.page,id:row.id,chapter:row.chapter,opens:row.opens,created:row.created,locked:true};
  return {...data,details:JSON.parse(row.details),media:JSON.parse(row.media).map((m,i)=>({...m,url:'/media/'+key(row.id,i,m.ext)}))};
}
async function getEntry(env,id) {
  const row=await query(env,'SELECT * FROM entries WHERE id=? AND '+latest,id,now()).first();
  if(!row) fail('This page is unavailable.',404);
  return row;
}
async function upload(file,env,id,index,caption) {
  const type=file.type.split(';')[0], ext=types[type];
  if(!ext || file.size<12 || file.size>8_000_000 || (type.startsWith('image/')&&file.size>1_500_000)) fail('Use a JPEG, PNG, WebP, MP4, WebM or Ogg file within the size limit.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const ascii=(from,to)=>String.fromCharCode(...bytes.slice(from,to));
  const valid={
    jpg:bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
    png:bytes[0]===137&&ascii(1,4)==='PNG',
    webp:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP',
    webm:bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163,
    mp4:ascii(4,8)==='ftyp',
    m4a:ascii(4,8)==='ftyp',
    ogg:ascii(0,4)==='OggS'
  };
  if(!valid[ext]) fail('One attachment could not be verified.');
  await env.BUCKET.put(key(id,index,ext),bytes,{httpMetadata:{contentType:type}});
  return {type,ext,caption:clean(caption,160)};
}
async function removeMedia(env,row) {
  const keys=JSON.parse(row.media).map((m,i)=>key(row.id,i,m.ext));
  if(keys.length) await env.BUCKET.delete(keys);
}
async function save(req,env,id) {
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data')) fail('This page needs a valid form.');
  if(Number(req.headers.get('content-length'))>23_000_000) fail('These attachments are too large.',413);
  const form=await req.formData();
  const pen=clean(form.get('pen'),50), chapter=clean(form.get('chapter'),20), title=clean(form.get('title'),140), body=clean(form.get('body'),12000);
  if(!pen||!title||!body||!chapters.has(chapter)) fail('Add a pen name, chapter, title and some words.');
  let old;
  if(id) {
    old=await query(env,'SELECT * FROM entries WHERE id=? AND hidden=0',id).first();
    if(!old||!await secureEqual(old.owner,await digest(req.headers.get('X-Page-Key')||''))) fail('The original browser holds the key to edit this page.',403);
  }
  const opens=clean(form.get('opens'),10)||null;
  if(!old && chapter==='capsule' && (!opens||!/^\d{4}-\d{2}-\d{2}$/.test(opens)||!Number.isFinite(Date.parse(opens))||new Date(opens).toISOString().slice(0,10)!==opens||opens<=now().slice(0,10))) fail('Choose a future date for this envelope.');
  if(old && ((old.chapter==='capsule')!==(chapter==='capsule'))) fail('A time capsule keeps its original delivery mode.');
  let details={};
  try { details=JSON.parse(form.get('details')||'{}'); } catch { fail('Check your page details.'); }
  if(!details||Array.isArray(details)||typeof details!=='object') fail('Check your page details.');
  details=Object.fromEntries(Object.entries(details).slice(0,20).map(([k,v])=>[k.slice(0,50),clean(v,1000)]));
  if(chapter==='daily'&&!/^\d{4}-\d{2}-\d{2}$/.test(details.QuestionDate||'')) fail('Select a daily question.');
  const files=form.getAll('media');
  if(files.length>3 || files.reduce((sum,file)=>sum+(file.size??0),0)>22_000_000 || files.some(file=>typeof file==='string')) fail('Add up to three attachments, with a total under 22 MB.');
  if(old) {
    if(files.length) fail('Shared attachments stay with the original page.');
    await query(env,'UPDATE entries SET pen=?,chapter=?,title=?,body=?,details=? WHERE id=?',pen,chapter,title,body,JSON.stringify(details),id).run();
    return json({id});
  }
  id=crypto.randomUUID();
  const token=crypto.randomUUID()+crypto.randomUUID(), media=[];
  try {
    for(const [index,file] of files.entries()) media.push(await upload(file,env,id,index,form.get('caption'+index)));
    await query(env,'INSERT INTO entries (id,pen,chapter,title,body,details,media,opens,created,owner) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id,pen,chapter,title,body,JSON.stringify(details),JSON.stringify(media),chapter==='capsule'?opens:null,now(),await digest(token)).run();
  } catch(error) {
    await removeMedia(env,{id,media:JSON.stringify(media)});
    throw error;
  }
  return json({id,token},201);
}
async function handle(req,env) {
  const url=new URL(req.url), path=url.pathname, method=req.method;
  if(['/','/moderate'].includes(path)&&method==='GET') return new Response(html,{headers:headers('text/html; charset=utf-8')});
  if(path==='/journal.css') return new Response(css,{headers:headers('text/css; charset=utf-8')});
  if(path==='/journal.js') return new Response(script,{headers:headers('text/javascript; charset=utf-8')});
  if(path==='/robots.txt') return new Response('User-agent: *\nDisallow: /\n',{headers:headers('text/plain')});
  if(method!=='GET'&&req.headers.get('Origin')!==url.origin) fail('Unable to accept a request from another site.',403);
  if(path==='/api/moderate') {
    const auth=req.headers.get('Authorization')||'';
    if(!env.ADMIN_KEY || env.ADMIN_KEY.length<24 || !await secureEqual(auth,'Bearer '+env.ADMIN_KEY)) fail('A moderator key is required.',401);
    if(method==='GET') return json(await all(query(env,'SELECT reports.*, entries.title FROM reports JOIN entries ON entries.id=reports.entry ORDER BY reports.created DESC LIMIT 150')));
    const {id,action}=await req.json();
    const report=await query(env,'SELECT * FROM reports WHERE id=?',id).first();
    if(!report||!['hide','dismiss'].includes(action)) fail('Report unavailable.',404);
    if(action==='hide') {
      if(report.reply) await query(env,'UPDATE replies SET hidden=1 WHERE id=?',report.reply).run();
      else {
        const row=await query(env,'SELECT * FROM entries WHERE id=?',report.entry).first();
        if(row) {
          await query(env,'UPDATE entries SET hidden=1 WHERE id=?',report.entry).run();
          await removeMedia(env,row);
        }
      }
    }
    await query(env,'DELETE FROM reports WHERE id=?',id).run();
    return json({ok:true});
  }
  if(path==='/api/entries'&&method==='GET') {
    const after=Math.max(0,Number(url.searchParams.get('after'))||0);
    const rows=await all(query(env,'SELECT page,id,pen,chapter,title,opens,created,CASE WHEN opens IS NULL OR opens<=? THEN substr(body,1,700) END AS excerpt,CASE WHEN opens IS NULL OR opens<=? THEN details END AS details FROM entries WHERE hidden=0 AND page>? ORDER BY page LIMIT 100',now(),now(),after));
    return json(rows.map(row=>{
      if(row.opens&&row.opens>now()) return {page:row.page,id:row.id,chapter:row.chapter,opens:row.opens,created:row.created,locked:true};
      return {...row,details:JSON.parse(row.details)};
    }));
  }
  if(path==='/api/entries'&&method==='POST') { await limit(req,env); return save(req,env); }
  const media=path.match(/^\/media\/([a-f0-9-]{36})\/(\d)\.([a-z0-9]+)$/);
  if(media&&method==='GET') {
    const row=await getEntry(env,media[1]);
    const expected=JSON.parse(row.media)[Number(media[2])];
    if(!expected||expected.ext!==media[3]) fail('Attachment unavailable.',404);
    const object=await env.BUCKET.get(key(media[1],media[2],media[3]),{range:req.headers});
    if(!object) fail('Attachment unavailable.',404);
    const range=req.headers.has('Range')&&object.range;
    const offset=range?.offset??(range?.suffix!==undefined?Math.max(0,object.size-range.suffix):0);
    const length=range?.length??object.size-offset;
    return new Response(object.body,{status:range?206:200,headers:headers(expected.type,{'Cache-Control':'private, no-store','Accept-Ranges':'bytes','Content-Length':String(range?length:object.size),...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${object.size}`}:{})})});
  }
  const match=path.match(/^\/api\/entries\/([a-f0-9-]{36})(?:\/(replies|heart|report))?$/);
  if(!match) fail('Page unavailable.',404);
  const [,id,action]=match;
  if(method==='GET'&&!action) {
    const row=await query(env,'SELECT * FROM entries WHERE id=? AND hidden=0',id).first();
    if(!row) fail('This page is unavailable.',404);
    const data=entryData(row);
    if(data.locked) return json(data);
    data.replies=await all(query(env,'SELECT id,parent,pen,body,created FROM replies WHERE entry=? AND hidden=0 ORDER BY created LIMIT 100',id));
    return json(data);
  }
  await limit(req,env);
  if(method==='PATCH'&&!action) return save(req,env,id);
  if(method==='DELETE'&&!action) {
    const row=await query(env,'SELECT * FROM entries WHERE id=? AND hidden=0',id).first();
    if(!row||!await secureEqual(row.owner,await digest(req.headers.get('X-Page-Key')||''))) fail('The original browser holds the key to remove this page.',403);
    await query(env,'DELETE FROM entries WHERE id=?',id).run();
    await removeMedia(env,row);
    return json({ok:true});
  }
  if(method!=='POST'||!action) fail('Page unavailable.',404);
  await getEntry(env,id);
  if(Number(req.headers.get('content-length'))>16000) fail('This note is too long.',413);
  const payload=await req.json();
  const reply=payload.reply||payload.parent||null;
  if(reply&&(!validId(reply)||!await query(env,'SELECT id FROM replies WHERE entry=? AND id=? AND hidden=0',id,reply).first())) fail('This margin note is unavailable.',404);
  if(action==='replies') {
    const pen=clean(payload.pen,50), body=clean(payload.body,2500);
    if(!pen||!body) fail('Add your pen name and a note.');
    await query(env,'INSERT INTO replies (id,entry,parent,pen,body,created) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),id,reply,pen,body,now()).run();
  }
  if(action==='heart') {
    if(!validId(payload.visitor)) fail('Missing device preference.');
    if(payload.active) await query(env,'INSERT OR IGNORE INTO hearts VALUES (?,?)',id,payload.visitor).run();
    else await query(env,'DELETE FROM hearts WHERE entry=? AND visitor=?',id,payload.visitor).run();
  }
  if(action==='report') {
    const reason=clean(payload.reason,500);
    if(!reason) fail('Add a reason for the report.');
    await query(env,'INSERT INTO reports VALUES (?,?,?,?,?)',crypto.randomUUID(),id,reply,reason,now()).run();
  }
  return json({ok:true});
}
export default {async fetch(req,env) {
  try { return await handle(req,env); }
  catch(error) {
    if(!error.status) console.error(error);
    return json({error:error.status?error.message:'The journal is temporarily unavailable. Please try again.'},error.status||500);
  }
}};
