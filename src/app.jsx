import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {chapters,lookup,roman,moods,envelopes,names,today,questionFor,random,dateLabel} from './data.js';

const prefix='door-journal:';
function read(k,fallback){try{return JSON.parse(localStorage.getItem(prefix+k))??fallback;}catch{return fallback;}}
function write(k,v){localStorage.setItem(prefix+k,JSON.stringify(v));}
function useStored(k,v){const [value,set]=useState(()=>read(k,v));return [value,next=>{const updated=typeof next==='function'?next(value):next;write(k,updated);set(updated);}];}
async function api(path,options){
  const result=await fetch('/api'+path,options);
  const data=await result.json();
  if(!result.ok) throw Error(data.error||'The journal could not finish that request.');
  return data;
}
const post=(data,headers={})=>({method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
function safeLink(text){try{const url=new URL(text);return ['https:','http:'].includes(url.protocol)?url:null;}catch{return null;}}
function embed(text){
  const u=safeLink(text);
  if(!u)return '';
  if(u.hostname==='open.spotify.com' && /^\/(track|album|playlist|episode)\/[A-Za-z0-9]+$/.test(u.pathname))return 'https://open.spotify.com/embed'+u.pathname;
  const id=u.hostname==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)?u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]:null;
  return /^[\w-]{11}$/.test(id||'')?'https://www.youtube-nocookie.com/embed/'+id:'';
}

function createSound(){
 let ctx, ambient, gain;
 function context(){ctx??=new (window.AudioContext||window.webkitAudioContext)();ctx.resume();return ctx;}
 function noise(seconds,kind,volume,loop){
  const ac=context(), b=ac.createBuffer(1,ac.sampleRate*seconds,ac.sampleRate), d=b.getChannelData(0);
  let smooth=0;
  for(let i=0;i<d.length;i++){const white=Math.random()*2-1;smooth=(smooth+white*.045)/1.045;d[i]=kind==='rain'?white*.34+smooth:kind==='fire'?smooth*1.7+(Math.random()>.9995?white:0):kind==='café'?smooth*(1+.5*Math.sin(i/ac.sampleRate*3.4)):white*Math.sin(Math.PI*i/d.length)*.6;}
  const source=ac.createBufferSource();source.buffer=b;source.loop=loop;
  const filter=ac.createBiquadFilter();filter.type='lowpass';filter.frequency.value=kind==='paper'?2050:kind==='café'?480:kind==='fire'?900:4000;
  const control=ac.createGain();control.gain.value=volume;source.connect(filter).connect(control).connect(ac.destination);source.start();return {source,control};
 }
 return {flip(v){if(v)noise(.36,'paper',v*.16,false);},set(kind,v){if(ambient?.kind===kind){gain.gain.value=v*.28;return;}ambient?.source.stop();ambient=null;if(kind!=='off'){const n=noise(4,kind,v*.28,true);ambient={source:n.source,kind};gain=n.control;}}};
}
const sound=createSound();

function Media({items=[]}){
 return items.map((m,i)=><figure key={i} className={m.type.startsWith('image/')?'polaroid':'recording'}>
  {m.type.startsWith('image/')?<img loading="lazy" src={m.url} alt={m.caption||'Journal photograph'}/>:m.type.startsWith('video/')?<video src={m.url} controls playsInline preload="metadata"/>:<><span>♬ Voice letter</span><audio src={m.url} controls preload="metadata"/></>}
  {m.caption&&<figcaption>{m.caption}</figcaption>}
 </figure>);
}

function Entry({row,privatePage,heart,owned,edit,remove,saveHeart,report,pen,setPen,reload}){
 const [opened,setOpened]=useState(false),[parent,setParent]=useState(null),[note,setNote]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const capsule=row.opens&&row.opens>today();
 if(row.locked||capsule)return <div className="sealed"><span className="wax">✦</span><h2>Sealed until {dateLabel(row.opens)}</h2><p>{Math.max(1,Math.ceil((Date.parse(row.opens)-Date.now())/86400000))} days to go</p>{owned&&<button onClick={remove}>Remove envelope</button>}</div>;
 if(['letters','open','capsule'].includes(row.chapter)&&!opened)return <div className="sealed"><button className="envelope" onClick={()=>setOpened(true)} aria-label="Break the wax seal"><span className="wax">✦</span></button><h2>{row.title}</h2><p>{row.details?.To||row.details?.Envelope||'A letter from '+row.pen}</p><button className="text-link" onClick={()=>setOpened(true)}>Break the wax seal</button></div>;
 async function reply(e){
  e.preventDefault();setBusy(true);setMessage('');
  try{await api('/entries/'+row.id+'/replies',post({pen,body:note,parent}));setPen(pen.trim());setNote('');setParent(null);await reload();}catch(error){setMessage(error.message);}finally{setBusy(false);}
 }
 const replyList=row.replies||[];
 return <article className={opened?'unfold':''}>
  <p className="entry-meta">By {row.pen} · {dateLabel(row.created)}{row.details?.Mood?' · '+row.details.Mood:''}</p>
  <h2>{row.title}</h2>
  {row.details?.Spoilers&&<details><summary>Contains spoilers. Reveal this page</summary><p className={'entry-text '+(row.details?.Font==='Literary'?'literary':'')}>{row.body}</p></details>}
  {!row.details?.Spoilers&&<p className={'entry-text '+(row.details?.Font==='Literary'?'literary':'')}>{row.body}</p>}
  {row.details?.Rating&&<p className="rating" aria-label={row.details.Rating+' out of five stars'}>{'★'.repeat(Math.min(5,Math.max(0,Number(row.details.Rating)||0)))} <small>{row.details.Rating}/5</small></p>}
  <Media items={row.media}/>
  {Object.entries(row.details||{}).filter(([k])=>!['Mood','Rating','Font','Spoilers','QuestionDate'].includes(k)).map(([k,v])=>{
   const link=k.endsWith('link')&&safeLink(v), player=link&&embed(v);
   return v&&<div className="detail" key={k}><b>{k}</b><p>{link?<a href={link.href} target="_blank" rel="noreferrer">Open {k.toLowerCase()}</a>:v}</p>{player&&<iframe title={k+' player'} src={player} loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen/>}</div>;
  })}
  <div className="inline">
   {!privatePage&&<><button aria-pressed={heart} onClick={saveHeart}>{heart?'♥':'♡'} Appreciation</button><button onClick={()=>report(null)}>Report page</button></>}
   {owned&&<><button onClick={edit}>Edit page</button><button onClick={remove}>Remove page</button></>}
  </div>
  {!privatePage&&<section className="margin-notes"><h3>Notes in the margin</h3>
   {replyList.map(r=><div className={'note '+(r.parent?'nested':'')} key={r.id}><strong>{r.pen}</strong>{r.parent&&<small> replying to {replyList.find(p=>p.id===r.parent)?.pen||'a margin note'}</small>}<p>{r.body}</p><button onClick={()=>setParent(r.id)}>Reply</button> <button onClick={()=>report(r.id)}>Report</button></div>)}
   <form onSubmit={reply} className="stack">
    {parent&&<p>Replying to {replyList.find(r=>r.id===parent)?.pen} <button type="button" onClick={()=>setParent(null)}>Cancel reply</button></p>}
    <label>Fictional pen name<input required value={pen} onChange={e=>setPen(e.target.value)} maxLength={50} placeholder="Choose a name that isn't your own..."/></label>
    <label>Your margin note<textarea required value={note} onChange={e=>setNote(e.target.value)} maxLength={2500} rows={3}/></label>
    <button disabled={busy}>Leave a margin note</button><span role="status">{message}</span>
   </form>
  </section>}
 </article>;
}

function indexMedia(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('door-journal-media',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('pages');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function localMedia(action,id,value){
 const db=await indexMedia();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('pages',action==='get'?'readonly':'readwrite'), store=tx.objectStore('pages');
  const req=action==='get'?store.get(id):action==='put'?store.put(value,id):store.delete(id);
  tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
async function imageFile(file){
 const bitmap=await createImageBitmap(file);
 const factor=Math.min(1,1500/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f8f0df';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
 if(!blob)throw Error('This photograph could not be prepared.');
 return new File([blob],'journal-photo.jpg',{type:'image/jpeg'});
}

function Recorder({onClip}){
 const recorder=useRef(null), stream=useRef(null), chunks=useRef([]), timer=useRef(null), mounted=useRef(true);
 const [state,setState]=useState('idle'),[elapsed,setElapsed]=useState(0),[clip,setClip]=useState(null),[error,setError]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{if(state!=='recording')return;const t=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(t);},[state]);
 useEffect(()=>{if(elapsed>=60&&recorder.current?.state!=='inactive')recorder.current?.stop();},[elapsed]);
 const preview=useObject(clip);
 async function start(){
  setError('');setState('requesting');
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Voice recording is unavailable in this browser.');
   const mic=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!mounted.current){mic.getTracks().forEach(t=>t.stop());return;}
   stream.current=mic;chunks.current=[];
   const type=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(mic,type?{mimeType:type}:undefined);
   recorder.current=rec;setElapsed(0);
   rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
   rec.onstop=()=>{clearTimeout(timer.current);mic.getTracks().forEach(t=>t.stop());if(!mounted.current)return;const file=new File(chunks.current,'voice-letter',{type:rec.mimeType.split(';')[0]});setClip(file);setState('idle');};
   rec.start();setState('recording');
   timer.current=setTimeout(()=>{if(rec.state!=='inactive')rec.stop();},120000);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());setError(e.message);setState('idle');}
 }
 return <div className="recorder">
  <p>A voice recording may reveal who you are.</p>
  <div className="inline">{state==='idle'&&!clip?<button type="button" onClick={start}>Record voice letter</button>:state==='requesting'?<span>Waiting for microphone permission…</span>:state!=='idle'?<>
   <button type="button" onClick={()=>{if(state==='paused'){recorder.current.resume();setState('recording');}else{recorder.current.pause();setState('paused');}}}>{state==='paused'?'Resume':'Pause'}</button>
   <button type="button" onClick={()=>recorder.current.stop()}>Stop</button><span>{elapsed} / 60 seconds</span>
  </>:<><button type="button" onClick={()=>{if(onClip(clip)!==false)setClip(null);}}>Attach recording</button><button type="button" onClick={()=>setClip(null)}>Delete recording</button></>}</div>
  {preview&&<audio src={preview} controls/>}<p role="status">{error}</p>
 </div>;
}
function useObject(blob){
 const [url,set]=useState('');
 useEffect(()=>{if(!blob){set('');return;}const u=URL.createObjectURL(blob);set(u);return()=>URL.revokeObjectURL(u);},[blob]);return url;
}

const empty={pen:'',chapter:'memories',title:'',body:'',details:{},opens:'',visibility:'shared'};
function Writer({initial,editRow,pen,close,onSave,quiet}){
 const [form,setForm]=useState(()=>editRow?{...empty,...editRow,visibility:editRow.private?'private':'shared'}:{...empty,...read('draft',{}),...initial,details:{...read('draft',{}).details,...initial?.details},pen:pen||read('draft',{}).pen||''});
 const [media,setMedia]=useState([]),[stage,setStage]=useState(false),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[writing,setWriting]=useState(form.chapter==='midnight'),[removals,setRemovals]=useState([]);
 const uppercase=form.chapter==='daily';
 const control=(k,v)=>setForm(prev=>({...prev,[k]:v}));
 const detail=(k,v)=>setForm(prev=>({...prev,details:{...prev.details,[k]:v}}));
 useEffect(()=>{if(!editRow){const t=setTimeout(()=>{try{write('draft',form);}catch{setStatus('This browser could not autosave the draft.');}},250);return()=>clearTimeout(t);}},[form,editRow]);
 function addFile(file){if(media.length>=3){setStatus('A page can hold up to three attachments.');return false;}setMedia(m=>[...m,{file,caption:''}]);return true;}
 async function choose(e){
  const files=[...e.target.files].slice(0,3-media.length);e.target.value='';setBusy(true);
  try{const batch=[];for(const file of files){
   if(file.size>20_000_000)throw Error('Choose a smaller attachment.');
   const prepared=file.type.startsWith('image/')?await imageFile(file):file;
   if(prepared.size>8_000_000||(!prepared.type.startsWith('image/')&&!['video/mp4','video/webm'].includes(prepared.type)))throw Error('Choose a photo or a short MP4 or WebM video under 8 MB.');
   batch.push({file:prepared,caption:''});
  }setMedia(m=>[...m,...batch].slice(0,3));setStatus('');}catch(e){setStatus(e.message);}finally{setBusy(false);}
 }
 async function save(mode){
  setBusy(true);setStatus('');
  try{await onSave({...form,visibility:mode},media,editRow,removals);}catch(e){setStatus(e.message);}finally{setBusy(false);}
 }
 function preview(e){e.preventDefault();if(!form.pen.trim()||!form.title.trim()||!form.body.trim()){setStatus('Add a pen name, title and some words.');return;}setStage(true);setStatus('');}
 function insert() {
  const input=document.getElementById('entry-body'), start=input.selectionStart,end=input.selectionEnd;
  const selection=form.body.slice(start,end)||'your words';
  control('body',form.body.slice(0,start)+'“'+selection+'”'+form.body.slice(end));
  requestAnimationFrame(()=>{input.focus();input.setSelectionRange(start+1,start+1+selection.length);});
 }
 return <div className={'writer '+(writing?'midnight-writing':'')}>
  <h2>{stage?'One last look':editRow?'Edit this page':'Write a new page'}</h2>
  {stage?<div className="stack">
   <p className="entry-meta">{lookup[form.chapter][1]} · {form.pen}</p><h3>{form.title}</h3><p className="entry-text">{form.body}</p>
   {!!media.length&&<p>{media.length} attachment{media.length===1?'':'s'} ready</p>}
   <p>{form.visibility==='private'?'This page stays in this browser. Clearing browser data may erase it.':'Anyone with the link can read shared pages. A pen name offers pseudonymity, but complete anonymity cannot be guaranteed. Leave out sensitive personal information.'}</p>
   {form.opens&&form.chapter==='capsule'&&<p>Sealed until {dateLabel(form.opens)} (UTC). {form.visibility==='private'&&'Device-based locks can be bypassed.'}</p>}
   <div className="inline"><button disabled={busy} onClick={()=>save(form.visibility)} className="primary">{busy?'Saving…':form.visibility==='private'?'Keep It to Myself':'Leave It Between These Pages'}</button><button disabled={busy} onClick={()=>setStage(false)}>Back to writing</button></div>
  </div>:<form className="stack" onSubmit={preview}>
   <label>Who would you like to be on these pages?<div className="field-row"><input required placeholder="Choose a name that isn't your own..." value={form.pen} onChange={e=>control('pen',e.target.value)} maxLength={50}/><button type="button" onClick={()=>control('pen',random(names.filter(n=>n!==form.pen)))}>Surprise me</button></div></label>
   <label>Chapter<select value={form.chapter} onChange={e=>{control('chapter',e.target.value);if(e.target.value==='daily')detail('QuestionDate',today());if(e.target.value==='midnight')setWriting(true);}}>{chapters.filter(c=>!editRow||(editRow.chapter==='capsule')===(c[0]==='capsule')).map(c=><option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></label>
   {uppercase&&<label>Daily question<input type="date" value={form.details.QuestionDate||today()} onChange={e=>detail('QuestionDate',e.target.value)} required max={today()}/><small>{questionFor(form.details.QuestionDate||today())}</small></label>}
   {form.chapter==='capsule'&&<label>Opening date (UTC)<input type="date" required disabled={!!editRow} min={new Date(Date.now()+86400000).toISOString().slice(0,10)} value={form.opens||''} onChange={e=>control('opens',e.target.value)}/></label>}
   {form.chapter==='open'&&<label>Envelope<select required value={form.details.Envelope||''} onChange={e=>detail('Envelope',e.target.value)}><option value="">Choose an envelope</option>{envelopes.map(m=><option key={m}>Open when {m}.</option>)}</select></label>}
   <label>{({cinema:'Movie or show title',books:'Book title',music:'Song title',world:'Headline or topic',places:'Place or story title'})[form.chapter]||'Page title'}<input required maxLength={140} value={form.title} onChange={e=>control('title',e.target.value)}/></label>
   <label>{form.chapter==='world'?'Your opinion':'Your words'}<textarea id="entry-body" className={form.details.Font==='Literary'?'':'entry-text'} required maxLength={12000} rows={7} value={form.body} onChange={e=>control('body',e.target.value)} placeholder="Allow yourself a moment. Then begin anywhere."/></label>
   <div className="inline"><button type="button" onClick={insert}>Add quotation marks</button><button type="button" aria-pressed={writing} onClick={()=>setWriting(!writing)}>Midnight writing</button>{!quiet&&<button type="button" onClick={()=>sound.flip(.2)}>Pen on paper</button>}</div>
   <div className="field-row"><label>Mood<select value={form.details.Mood||''} onChange={e=>detail('Mood',e.target.value)}><option value="">Optional</option>{moods.map(m=><option key={m}>{m}</option>)}</select></label>
   <label>Writing style<select value={form.details.Font||''} onChange={e=>detail('Font',e.target.value)}><option>Handwritten</option><option>Literary</option></select></label></div>
   {['cinema','places','books'].includes(form.chapter)&&<label>Rating<select value={form.details.Rating||''} onChange={e=>detail('Rating',e.target.value)}><option value="">Optional</option>{[1,2,3,4,5].map(i=><option key={i}>{i}</option>)}</select></label>}
   {form.chapter==='cinema'&&<label className="check"><input type="checkbox" checked={!!form.details.Spoilers} onChange={e=>detail('Spoilers',e.target.checked?'Yes':'')}/> This page includes spoilers</label>}
   <details><summary>Details, photographs and sound</summary><div className="stack">
    {[...lookup[form.chapter][4],...(form.chapter==='music'?[]:['Music link'])].map(k=><label key={k}>{k}<input type={k.endsWith('link')?'url':'text'} maxLength={1000} value={form.details[k]||''} onChange={e=>detail(k,e.target.value)}/></label>)}
    {(!editRow||editRow.private)&&<>
    {editRow?.private&&editRow.media?.map((m,i)=><label className="check" key={i}><input type="checkbox" onChange={e=>setRemovals(r=>e.target.checked?[...r,i]:r.filter(n=>n!==i))}/> Remove attachment {i+1}{m.caption?' · '+m.caption:''}</label>)}
    <label>Photographs or short videos<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={choose}/></label>
    {media.map((m,i)=><div className="field-row" key={i}><label>Caption for {m.file.name}<input value={m.caption} maxLength={160} onChange={e=>setMedia(prev=>prev.map((x,j)=>i===j?{...x,caption:e.target.value}:x))}/></label><button type="button" onClick={()=>setMedia(prev=>prev.filter((_,j)=>j!==i))}>Remove</button></div>)}
    <Recorder onClip={addFile}/></>}
   </div></details>
   {!editRow&&<label>Visibility<select value={form.visibility} onChange={e=>control('visibility',e.target.value)}><option value="shared">Shared with anyone who has the link</option><option value="private">Private on this device</option></select></label>}
   <div className="inline">
    <button className="primary" disabled={busy}>{form.visibility==='private'?'Preview private page':'Preview shared page'}</button>
    {!editRow&&<><button type="button" disabled={busy} onClick={()=>{write('draft',form);setStatus('Draft saved on this device. Attachments are kept until you close the editor.');}}>Save as Draft</button>
    {form.visibility==='shared'&&<button type="submit" onClick={()=>control('visibility','private')}>Keep It to Myself</button>}</>}
    <button type="button" onClick={close}>Cancel</button>
   </div>
  </form>}
  <p role="status" className="status">{status}</p>
 </div>;
}

function Calendar({rows,openEntry}){
 const [month,setMonth]=useState(today().slice(0,7)),[day,setDay]=useState(today()),[chapter,setChapter]=useState('');
 const dates=rows.filter(r=>!r.locked&&(!chapter||r.chapter===chapter));
 const first=new Date(month+'-01T00:00:00Z'), year=first.getUTCFullYear(), m=first.getUTCMonth();
 const count=new Date(Date.UTC(year,m+1,0)).getUTCDate();
 const shift=n=>setMonth(new Date(Date.UTC(year,m+n,1)).toISOString().slice(0,7));
 const entries=dates.filter(r=>r.created.slice(0,10)===day);
 return <div><div className="calendar-header"><button onClick={()=>shift(-1)}>Previous</button><h3>{new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(first)}</h3><button onClick={()=>shift(1)}>Next</button></div>
 <label>Chapter<select value={chapter} onChange={e=>setChapter(e.target.value)}><option value="">All chapters</option>{chapters.map(c=><option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></label>
 <div className="calendar">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><b key={d}>{d}</b>)}{Array.from({length:first.getUTCDay()},(_,i)=><span key={'pad'+i}/>)}{Array.from({length:count},(_,i)=>{
  const date=month+'-'+String(i+1).padStart(2,'0'),marked=dates.some(r=>r.created.startsWith(date));
  return <button key={date} className={marked?'marked':''} aria-pressed={date===day} onClick={()=>setDay(date)}>{i+1}{marked&&<span className="sr">, contains an entry</span>}</button>;
 })}</div>
 <h3>{dateLabel(day)}</h3><Listings entries={entries} openEntry={openEntry} empty="The ink is quiet on this date."/></div>;
}
function Listings({entries,openEntry,empty='The first page is waiting to be written.'}){
 if(!entries.length)return <p className="empty">{empty}</p>;
 return <ul className="listings">{entries.map(row=><li key={row.id}><button onClick={()=>openEntry(row.id)}><span>{row.locked?'Sealed until '+dateLabel(row.opens):row.title}</span><small>{row.locked?'For Another Day':row.pen+' · '+lookup[row.chapter]?.[1]}{row.page?' · p. '+(row.page+2):''}</small></button></li>)}</ul>;
}
function Contents({go,count}){
 return <div className="contents"><div className="page-kicker">Index of the journal</div><h2>Table of contents</h2><div className="ornament">❧</div>
 <ol>{chapters.slice(0,10).map((c,i)=><li key={c[0]}><button onClick={()=>go('chapter:'+c[0])}><i>{roman[i]}</i><span>{c[1]}</span><em>{c[3]}</em></button></li>)}</ol>
 <p className="footnote">Someone was here · {count} shared {count===1?'page':'pages'}</p></div>;
}
function Welcome({go,newPage,find}){
 return <div className="welcome"><div className="page-kicker">A journal left open</div><h2>Dear Stranger,</h2>
 <p>This is a little corner of the world where you don't have to be anyone in particular.</p>
 <p>Tell us about a movie that made you cry, a song you cannot stop listening to, a place that felt like home, a book that changed something inside you, or a thought that arrived at three in the morning.</p>
 <p>Write a letter you may never send. Leave a wish for someone who might never know it was you.</p>
 <p>You don't need a real name here.</p><p>Just leave a little piece of your world.</p>
 <p>And perhaps, somewhere between these pages, someone will understand.</p>
 <div className="welcome-actions"><button onClick={()=>go('contents')}>Read what others left behind.</button><button onClick={()=>newPage()}>Leave a piece of yourself.</button><button onClick={()=>find('random')}>Take me to a random page.</button></div>
 </div>;
}

function Moderator(){
 const [key,setKey]=useState(''),[rows,setRows]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const auth=()=>({Authorization:'Bearer '+key});
 async function load(e){e?.preventDefault();setError('');setBusy(true);try{setRows(await api('/moderate',{headers:auth()}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function manage(id,action){setBusy(true);try{await api('/moderate',post({id,action},auth()));await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="standalone paper"><a href="/">Return to the journal</a><h1>Moderation</h1>
 <form onSubmit={load} className="stack"><label>Moderator key<input required type="password" value={key} onChange={e=>setKey(e.target.value)}/></label><button className="primary" disabled={busy}>Read reports</button></form>
 <p role="status">{error}</p>
 {rows&&<><h2>Reported pages and notes</h2>{!rows.length&&<p>No reports.</p>}{rows.map(r=><article className="note" key={r.id}><h3>{r.title}</h3><small>{dateLabel(r.created)} · {r.reply?'Margin note':'Journal page'}</small><p>{r.reason}</p>
 <div className="inline"><a href={'/#entry:'+r.entry} target="_blank" rel="noreferrer">Read page</a><button disabled={busy} onClick={()=>manage(r.id,'dismiss')}>Dismiss</button><button disabled={busy} onClick={()=>manage(r.id,'hide')}>Hide {r.reply?'note':'page'}</button></div></article>)}</>}</main>;
}

function App(){
 const hash=()=>location.hash.slice(1);
 const [open,setOpen]=useState(()=>hash().startsWith('entry:')),[page,setPage]=useState(()=>hash().startsWith('entry:')?hash():'welcome'),[direction,setDirection]=useState(''),[turn,setTurn]=useState(0);
 const [mobile,setMobile]=useState(()=>matchMedia('(max-width: 740px)').matches);
 const [rows,setRows]=useState([]),[fetchError,setFetchError]=useState(''),[loaded,setLoaded]=useState(false);
 const [entry,setEntry]=useState(null),[entryError,setEntryError]=useState(''),[editor,setEditor]=useState(null),[overlay,setOverlay]=useState(''),[notice,setNotice]=useState('');
 const [pen,setPen]=useStored('pen',''),[privateRows,setPrivate]=useStored('private',[]),[bookmarks,setBookmarks]=useStored('bookmarks',[]),[keys,setKeys]=useStored('keys',{}),[hearts,setHearts]=useStored('hearts',{}),[night,setNight]=useStored('night',false),[reduced,setReduced]=useStored('reduced',false),[volume,setVolume]=useStored('volume',.35),[paperSound,setPaperSound]=useStored('paper-sound',false);
 const [ambient,setAmbient]=useState('off'),[query,setQuery]=useState(''),[daily,setDaily]=useState(today()),[reportTarget,setReportTarget]=useState(null),[reason,setReason]=useState(''),[envelope,setEnvelope]=useState('');
 const touch=useRef(null), right=useRef(null), dialog=useRef(null), privateUrls=useRef([]), pageRef=useRef(page);
 pageRef.current=page;
 const pages=['welcome','contents',...chapters.map(c=>'chapter:'+c[0]),'calendar','discover',...rows.map(r=>'entry:'+r.id)];
 const isEntry=page.startsWith('entry:'), isPrivate=page.startsWith('private:'), id=page.split(':')[1];
 const visible=rows.filter(r=>!r.locked);
 const entryIndex=pages.indexOf(page);
 const chapter=page.startsWith('chapter:')?id:entry?.chapter;
 const ribbonRows=rows.slice(-14);
 async function refresh(){
  try{
   let list=[],after=0;
   for(;;){const part=await api('/entries?after='+after);list=list.concat(part);if(part.length<100)break;after=part.at(-1).page;}
   setRows(list);setLoaded(true);setFetchError('');
   return list;
  }catch(e){setFetchError(e.message);return [];}
 }
 useEffect(()=>{refresh();const onResize=e=>setMobile(e.matches),media=matchMedia('(max-width: 740px)');media.addEventListener('change',onResize);return()=>media.removeEventListener('change',onResize);},[]);
 useEffect(()=>{
  if(!open)return;
  const handle=()=>{if(hash().startsWith('entry:')&&hash()!==pageRef.current)go(hash());};
  window.addEventListener('popstate',handle);return()=>window.removeEventListener('popstate',handle);
 },[open]);
 function go(next,dir='next'){
  if(!next)return;
  setOpen(true);setOverlay('');setNotice('');
  setDirection(dir);setTurn(t=>t+1);setPage(next);
  if(paperSound)sound.flip(volume);
  if(next!=='welcome'&&next!=='contents'&&!next.startsWith('private'))write('progress',next);
  if(next.startsWith('entry:'))history.replaceState(null,'','#'+next);
  else if(hash())history.replaceState(null,'',location.pathname);
  right.current?.scrollTo(0,0);
 }
 function close(){
  setDirection('close');
  setTimeout(()=>{setOpen(false);if(hash())history.replaceState(null,'',location.pathname);},reduced?0:420);
  setNotice('Until the next time you have something to say.');
  if(paperSound)sound.flip(volume);
 }
 function step(offset){
  const start=entryIndex<0?1:entryIndex;
  const next=pages[start+offset];
  if(next)go(next,offset<0?'previous':'next');
 }
 useEffect(()=>{
  function keys(e){if(!open||overlay||editor||e.altKey||e.metaKey||e.ctrlKey||/^(INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|IFRAME)$/.test(e.target.tagName))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}}
  document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys);
 });
 async function loadEntry(pageId=id,local=isPrivate){
  if(local){
   const row=privateRows.find(r=>r.id===pageId);
   if(!row)throw Error('This private page was removed.');
   if(row.opens&&row.opens>today())return {...row,locked:true};
   const media=await localMedia('get',pageId)||[];
   const items=media.map(m=>{const url=URL.createObjectURL(m.file);privateUrls.current.push(url);return {...m,type:m.file.type,url};});
   return {...row,media:items};
  }
  return api('/entries/'+pageId);
 }
 async function reload(){setEntry(await loadEntry());}
 useEffect(()=>{
  let active=true;setEntry(null);setEntryError('');
  if(isEntry||isPrivate)loadEntry().then(r=>{if(active)setEntry(r);}).catch(e=>{if(active)setEntryError(e.message);});
  return()=>{active=false;privateUrls.current.forEach(u=>URL.revokeObjectURL(u));privateUrls.current=[];};
 },[page,privateRows]);
 useEffect(()=>{
  const current=dialog.current;
  if((overlay||editor)&&current&&!current.open)current.showModal();
  else if(!overlay&&!editor&&current?.open)current.close();
 },[overlay,editor]);
 function newPage(initial){
  setOverlay('');setNotice('');setEditor({initial:initial||(lookup[chapter]?{chapter,details:chapter==='daily'?{QuestionDate:daily}:chapter==='open'&&envelope?{Envelope:envelope}:{}}:undefined)});
 }
 async function save(form,media,editRow,removals){
  const isLocal=form.visibility==='private';
  let result, editId=editRow?.id;
  const values={pen:form.pen.trim(),chapter:form.chapter,title:form.title.trim(),body:form.body.trim(),details:Object.fromEntries(Object.entries(form.details).filter(([,v])=>v)),opens:form.chapter==='capsule'?form.opens:null};
  if(values.chapter==='daily')values.details.QuestionDate||=today();
  if(isLocal){
   const localId=editId||crypto.randomUUID();
   const old=editId?await localMedia('get',localId)||[]:[];
   const kept=old.filter((_,i)=>!removals.includes(i));
   if(kept.length+media.length>3)throw Error('Remove an old attachment before adding another.');
   if(kept.length||media.length||old.length)await localMedia('put',localId,[...kept,...media]);
   setPrivate([...privateRows.filter(r=>r.id!==localId),{...values,created:editRow?.created||new Date().toISOString(),id:localId,private:true}]);
   result={id:localId};
  }else{
   const body=new FormData();
   Object.entries(values).forEach(([k,v])=>{if(v)body.set(k,k==='details'?JSON.stringify(v):v);});
   media.forEach(({file,caption},i)=>{body.append('media',file);body.set('caption'+i,caption);});
   result=await api('/entries'+(editId?'/'+editId:''),{method:editId?'PATCH':'POST',body,headers:editId?{'X-Page-Key':keys[editId]}:{}});
   if(result.token)setKeys({...keys,[result.id]:result.token});
   await refresh();
  }
  setPen(values.pen);if(!editId)write('draft',{});setEditor(null);
  const next=(isLocal?'private:':'entry:')+result.id;
  if(next===page){if(!isLocal)await reload();}else go(next);
  setNotice(editId?'The page has been updated.':isLocal?'This page is tucked away on this device.':'Somewhere, someday, someone might find your words exactly when they need them.');
 }
 function find(mode){
  const matching=mode==='letter'?visible.filter(r=>['letters','open'].includes(r.chapter)):mode==='anniversary'?visible.filter(r=>r.created.slice(5,10)===today().slice(5)&&r.created.slice(0,4)<today().slice(0,4)):visible;
  const row=mode==='latest'?matching.at(-1):random(matching);
  if(row)go('entry:'+row.id);else setNotice(mode==='anniversary'?'No pages from this date in earlier years yet.':'No matching pages have been left yet.');
 }
 async function remove(){
  try{
   if(isPrivate){await localMedia('delete',id);setPrivate(privateRows.filter(r=>r.id!==id));}
   else{await api('/entries/'+id,{method:'DELETE',headers:{'X-Page-Key':keys[id]}});await refresh();}
   setBookmarks(bookmarks.filter(b=>b!==page));go(isPrivate?'private-list':'contents');setNotice('The page has been removed.');
  }catch(e){setNotice(e.message);}
 }
 async function heart(){
  const visitor=read('visitor',null)||crypto.randomUUID();write('visitor',visitor);
  try{const active=!hearts[id];await api('/entries/'+id+'/heart',post({visitor,active}));setHearts({...hearts,[id]:active});}catch(e){setNotice(e.message);}
 }
 function report(reply){setReportTarget(reply);setReason('');setOverlay('report');}
 async function sendReport(e){e.preventDefault();try{await api('/entries/'+id+'/report',post({reply:reportTarget,reason}));setOverlay('');setNotice('Your report was sent to the moderator.');}catch(e){setNotice(e.message);}}
 function toggleBookmark(){setBookmarks(bookmarks.includes(bookmarkPage)?bookmarks.filter(b=>b!==bookmarkPage):[...bookmarks,bookmarkPage]);}
 function setAtmosphere(kind,v){try{sound.set(kind,v);setAmbient(kind);}catch{setNotice('Sound is unavailable in this browser.');}}
 const groups=Object.values(visible.reduce((acc,r)=>{const key=r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(key)(acc[key]??=[]).push(r);return acc;},Object.create(null))).filter(g=>new Set(g.map(r=>r.pen.toLowerCase())).size>1);
 const openEntry=entryId=>go('entry:'+entryId);
 function render(p){
  if(p==='welcome')return <Welcome go={go} newPage={newPage} find={find}/>;
  if(p==='contents')return <Contents go={go} count={visible.length}/>;
  if(p==='calendar')return <><div className="page-kicker">By date</div><h2>Calendar of memories</h2><Calendar rows={rows} openEntry={openEntry}/></>;
  if(p==='private-list')return <><div className="page-kicker">For your eyes only</div><h2>Private pages</h2><p>Only this browser holds these pages. Clearing your browser data may erase them.</p><button onClick={()=>newPage({visibility:'private'})}>Write a private page</button><Listings entries={privateRows.map(r=>r.opens&&r.opens>today()?{...r,locked:true}:r)} openEntry={i=>go('private:'+i)} empty="There are no private pages on this device."/></>;
  if(p==='discover')return <><div className="page-kicker">In a different corner of the book</div><h2>Discover</h2><div className="stack"><button onClick={()=>find('random')}>A Page for You</button><button onClick={()=>find('letter')}>Dear Stranger</button><button onClick={()=>find('anniversary')}>On This Day</button><button onClick={()=>find('latest')}>Latest entry</button></div><h3>Same Thought, Different Souls</h3>{groups.length?groups.map(g=><Listings key={g[0].id} entries={g} openEntry={openEntry}/>):<p>When different strangers write about the same title or topic, their pages will meet here.</p>}</>;
  if(p.startsWith('chapter:')){
   const c=lookup[p.split(':')[1]], i=chapters.indexOf(c);
   let list=rows.filter(r=>r.chapter===c[0]);
   if(c[0]==='open'&&envelope)list=list.filter(r=>r.details?.Envelope===envelope);
   if(c[0]==='daily')list=list.filter(r=>r.details?.QuestionDate===daily);
   return <div className={'chapter chapter-'+c[0]}>
    <div className="page-kicker">{i<10?'Chapter '+roman[i]:'Between the chapters'}</div><div className="chapter-symbol" aria-hidden="true">{c[3]}</div><h2>{c[1]}</h2><p className="subtitle">{c[2]}</p>
    {c[0]==='daily'&&<><blockquote>{questionFor(daily)}</blockquote><label>Question archive<input type="date" max={today()} value={daily} onChange={e=>e.target.value&&setDaily(e.target.value)}/></label></>}
    {c[0]==='open'&&<div className="envelope-grid">{envelopes.map(m=>{const title='Open when '+m+'.';return <button className={envelope===title?'selected':''} aria-pressed={envelope===title} key={title} onClick={()=>setEnvelope(envelope===title?'':title)}>✉ {title}</button>;})}</div>}
    <button className="primary" onClick={()=>newPage({chapter:c[0],details:c[0]==='daily'?{QuestionDate:daily}:c[0]==='open'?{Envelope:envelope}:{}})}>{c[0]==='daily'?'Write an answer':c[0]==='capsule'?'Seal a time capsule':'Write in this chapter'}</button>
    <Listings entries={list} openEntry={openEntry}/>
   </div>;
  }
  if(p.startsWith('entry:')||p.startsWith('private:'))return <>
   <div className="page-kicker">{entry?lookup[entry.chapter]?.[1]:'Between the pages'} {isPrivate&&' · Private'}</div>
   {entry?<Entry key={entry.id} row={entry} privatePage={isPrivate} owned={!!keys[id]||isPrivate} heart={!!hearts[id]} edit={()=>setEditor({editRow:entry})} remove={()=>setOverlay('remove')} saveHeart={heart} report={report} pen={pen} setPen={setPen} reload={reload}/>:<p role="status">{entryError||'Finding the page…'}</p>}
  </>;
  return null;
 }
 const leftPage=page==='welcome'?'welcome':page==='contents'?'welcome':null;
 const rightPage=open&&page==='welcome'&&!mobile?'contents':page;
 const bookmarkPage=rightPage;
 const pageNum=rightPage==='contents'?2:rightPage==='welcome'?1:entry?.page?entry.page+2:entryIndex>=0&&entryIndex<12?roman[entryIndex-2]:'❧';
 const resultPages=visible.filter(r=>[r.title,r.pen,r.excerpt,lookup[r.chapter]?.[1],...Object.values(r.details||{})].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const progress=read('progress','');
 return <div className={'desk '+(night?'night ':'')+(reduced?'less-motion':'')}>
  <header className="desk-header"><button className="wordmark" onClick={()=>open&&close()} aria-label={open?'Close the journal':'When the Door Close'}><span>✦</span> When the Door Close</button>
   <nav aria-label="Journal controls">{open&&<><button onClick={()=>go('contents')}>Contents</button><button onClick={()=>setOverlay('search')}>Search</button></>}<button onClick={()=>setOverlay('settings')}>Atmosphere</button>{open&&<button className="gold" onClick={()=>newPage()}>Write a page</button>}</nav>
  </header>
  {!open?<main className="cover-layout">
   <div className="closed-book" aria-label="Antique brown leather journal with a red ribbon bookmark" onClick={()=>go('welcome')}>
    <div className="leaf-block"></div><span className="cover-ribbon" aria-hidden="true"></span>
    <div className="leather"><div className="cover-frame"><span className="corner tl">❧</span><span className="corner tr">❧</span><span className="corner bl">❧</span><span className="corner br">❧</span>
      <div className="cover-ornament" aria-hidden="true">✦</div><h1>When the<br/><em>Door</em><br/>Close</h1><div className="cover-ornament bottom" aria-hidden="true">❧</div>
      <p>A journal for strangers</p>
    </div></div>
   </div>
   <div className="cover-note"><p className="cover-eyebrow">A SHARED SCRAPBOOK</p><h2>Dear Stranger,</h2>
    <p>Perhaps you came here with something to say.<br/>Perhaps you came here simply to listen.<br/>Either way, there is a page waiting for you.</p>
    <button className="cover-open" onClick={()=>go('welcome','opening')}>Open the Journal <span aria-hidden="true">❧</span></button>
    {progress&&<button className="continue" onClick={()=>go(progress,'opening')}>Continue from my ribbon</button>}
    <p className="tagline">When the door closes, the world grows quiet, and the words finally find their way onto paper.</p>
   </div>
   <div className="dust" aria-hidden="true">{Array.from({length:14},(_,i)=><i key={i} style={{left:(i*29%99)+'%',top:(i*53%95)+'%',animationDelay:(-i*.67)+'s'}}/>)}</div>
  </main>:<main className="open-layout">
   <div className={'open-book '+(direction==='close'?'closing':'')}>
    <aside className="tabs" aria-label="Journal sections"><button onClick={()=>go('chapter:daily')}>Daily question</button><button onClick={()=>go('calendar')}>Calendar</button><button onClick={()=>go('discover')}>Discover</button><button onClick={()=>go('chapter:capsule')}>Time capsules</button><button onClick={()=>go('private-list')}>Private pages</button><button onClick={()=>setOverlay('bookmarks')}>Saved pages</button></aside>
    <div className="spread" onTouchStart={e=>{const t=e.changedTouches[0];touch.current=[t.clientX,t.clientY];}} onTouchEnd={e=>{if(!touch.current)return;const t=e.changedTouches[0],dx=t.clientX-touch.current[0],dy=t.clientY-touch.current[1];if(Math.abs(dx)>55&&Math.abs(dx)>1.4*Math.abs(dy))step(dx>0?-1:1);touch.current=null;}}>
     {!mobile&&<section className="paper left-paper">
      <div className="page-scroll">{leftPage?render(leftPage):<><Contents go={go} count={visible.length}/><div className="paper-quote">No names. No faces.<br/>Just little pieces of being human.</div></>}</div>
      <span className="page-number">{leftPage?1:2}</span><button className="page-corner back" aria-label="Previous page" title="Previous page" disabled={entryIndex===0} onClick={()=>step(-1)}>‹</button>
     </section>}
     <section ref={right} className={'paper right-paper '+(chapter==='midnight'?'moonlit':'')}>
      <div key={turn} className={'page-scroll flip '+direction}>{render(rightPage)}</div>
      <span className="page-number">{pageNum}</span>
      <button className="page-bookmark" aria-label={bookmarks.includes(bookmarkPage)?'Remove bookmark':'Bookmark this page'} title={bookmarks.includes(bookmarkPage)?'Remove bookmark':'Bookmark this page'} aria-pressed={bookmarks.includes(bookmarkPage)} onClick={toggleBookmark}>{bookmarks.includes(bookmarkPage)?'◆':'♢'}</button>
      <button className="page-corner forward" aria-label="Next page" title="Next page" disabled={entryIndex===pages.length-1} onClick={()=>step(1)}>›</button>
     </section>
     <div className="ribbon-index" aria-label="Recent published pages">{ribbonRows.map((r,i)=><button key={r.id} onClick={()=>openEntry(r.id)} aria-label={r.locked?'Sealed envelope':'Page '+(r.page+2)+': '+r.title} title={r.locked?'Sealed envelope':r.title} className={page==='entry:'+r.id?'active':''} style={{top:(9+i*5.5)+'%'}}/>)}</div>
     <button className="reading-ribbon" onClick={()=>go(progress||'welcome')} title="Last read page" aria-label="Return to last read page">✦</button>
    </div>
   </div>
   <div className="book-controls"><button onClick={()=>step(-1)} disabled={entryIndex===0}>Previous page</button><button onClick={close}>Close the Door</button><button onClick={()=>step(1)} disabled={entryIndex===pages.length-1}>Next page</button></div>
   {!loaded&&<p className="desk-status" role="status">{fetchError||'Finding the shared pages…'} {fetchError&&<button onClick={refresh}>Try again</button>}</p>}
  </main>}
  {notice&&<div className={'desk-status '+(open?'ink':'')} role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}
  <footer><span>No names. No faces. Just little pieces of being human.</span><button onClick={()=>setOverlay('guidelines')}>Community guidelines</button></footer>
  <dialog ref={dialog} onCancel={()=>{setEditor(null);setOverlay('');}} className="paper dialog">
   <button className="close-dialog" aria-label="Close dialog" onClick={()=>{setEditor(null);setOverlay('');}}>×</button>
   {editor&&<Writer initial={editor.initial} editRow={editor.editRow} pen={pen} quiet={!paperSound} onSave={save} close={()=>setEditor(null)}/>}
   {overlay==='search'&&<><h2>Find a page</h2><label>Search by topic, chapter or pen name<input autoFocus type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="A song, a place, a stranger…"/></label><Listings entries={resultPages} openEntry={openEntry} empty="No pages match these words."/></>}
   {overlay==='bookmarks'&&<><h2>Saved pages</h2><p>Bookmarks stay in this browser.</p><ul className="listings">{bookmarks.filter(b=>!b.startsWith('entry:')||rows.some(r=>'entry:'+r.id===b)).map(b=><li key={b}><button onClick={()=>go(b)}>{rows.find(r=>'entry:'+r.id===b)?.title||privateRows.find(r=>'private:'+r.id===b)?.title||lookup[b.split(':')[1]]?.[1]||b.replace('-',' ')}</button></li>)}</ul>{!bookmarks.length&&<p>Use the red bookmark at the edge of a page to save it here.</p>}</>}
   {overlay==='settings'&&<div className="stack"><h2>Atmosphere</h2><label className="check"><input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/> Candlelight mode</label><label className="check"><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> Reduce movement</label><label className="check"><input type="checkbox" checked={paperSound} onChange={e=>{setPaperSound(e.target.checked);if(e.target.checked)sound.flip(volume);}}/> Paper and writing sounds</label><label>Background sound<select value={ambient} onChange={e=>setAtmosphere(e.target.value,volume)}><option value="off">Off</option><option value="rain">Gentle rain</option><option value="café">Quiet café</option><option value="fire">Fireplace</option></select></label><label>Volume<input type="range" min="0" max="1" step=".05" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);setAtmosphere(ambient,v);}}/></label></div>}
   {overlay==='guidelines'&&<><h2>Community guidelines</h2><blockquote>Leave your thoughts, not your cruelty. Respect the strangers who share these pages with you.</blockquote><p>Anyone with the link can read shared entries. Use a fictional pen name and leave out identifying or sensitive information. Pseudonymity does not guarantee complete anonymity.</p><p>This browser holds the keys to edit and remove pages you publish, as well as your drafts, bookmarks and private pages. Clearing its data can remove access to them.</p><p>You can report a page or margin note from the journal.</p></>}
   {overlay==='report'&&<form className="stack" onSubmit={sendReport}><h2>Report {reportTarget?'a margin note':'a page'}</h2><label>What should the moderator know?<textarea required rows={4} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className="primary">Send report</button><p role="status">{notice}</p></form>}
   {overlay==='remove'&&<><h2>Remove this page?</h2><p>This permanently removes the page and its attachments{isPrivate?' from this device':' and replies from the shared journal'}.</p><div className="inline"><button onClick={()=>setOverlay('')}>Keep the page</button><button className="primary" onClick={remove}>Remove page</button></div><p role="status">{notice}</p></>}
  </dialog>
 </div>;
}
createRoot(document.getElementById('root')).render(location.pathname==='/moderate'?<Moderator/>:<App/>);
