// Voice Room - Complete Fix v8 - Glassmorphism + Supabase + Low Latency Mesh
const $ = s => document.querySelector(s);
const displayNameInput = $('#displayName');
const createBtn = $('#createBtn');
const joinBtn = $('#joinBtn');
const roomInput = $('#roomInput');
const myIdBox = $('#myIdBox');
const myIdText = $('#myIdText');
const copyIdBtn = $('#copyIdBtn');
const shareBtn = $('#shareBtn');
const copyToast = $('#copyToast');
const lobby = $('#lobby');
const room = $('#room');
const roomIdDisplay = $('#roomIdDisplay');
const peerCount = $('#peerCount');
const sideCount = $('#sideCount');
const copyRoomBtn = $('#copyRoomBtn');
const leaveBtn = $('#leaveBtn');
const endBtn = $('#endBtn');
const participantsGrid = $('#participantsGrid');
const screenGrid = $('#screenGrid');
const memberList = $('#memberList');
const chatBox = $('#chatBox');
const chatInput = $('#chatInput');
const chatSendBtn = $('#chatSendBtn');
const quickPeerInput = $('#quickPeerInput');
const quickCallBtn = $('#quickCallBtn');
const micBtn = $('#micBtn');
const screenBtn = $('#screenBtn');
const deafenBtn = $('#deafenBtn');
const helpBtn = $('#helpBtn');
const helpModal = $('#helpModal');
const closeHelp = $('#closeHelp');
const toastGlobal = $('#toastGlobal');

let peer = null;
let myId = null;
let myName = 'مهمان';
let roomId = null;
let localStream = null;
let screenStream = null;
let isMicOn = true;
let isDeafened = false;
let isScreenOn = false;
const connections = new Map();
const pendingPeers = new Set();
let audioContext = null, analyser = null;
let speaking = false;
let audioUnlocked = false;
let supaClient = null, supaUserId = null, supaEnabled = false, supaChannel = null;
let renderQueued = false;

// Supabase init
try{
  if(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_PROJECT') && typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY.includes('eyJ')){
    supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supaEnabled = true;
    console.log('✅ Supabase enabled', SUPABASE_URL);
  } else {
    console.log('ℹ️ Supabase disabled - PeerJS only');
  }
}catch(e){ console.warn('supabase init fail',e); }

async function supaEnsureUser(name){
  if(!supaEnabled) return null;
  try{
    let saved = localStorage.getItem('vr_uid');
    if(saved){ supaUserId = saved; return saved; }
    supaUserId = 'u-' + Math.random().toString(36).slice(2,9);
    const { error } = await supaClient.from('users').insert({ id: supaUserId, name });
    if(error) console.warn('supa user',error);
    localStorage.setItem('vr_uid', supaUserId);
    return supaUserId;
  }catch(e){ console.warn(e); return null; }
}
async function withTimeout(promise, ms){
  return Promise.race([promise, new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), ms))]);
}
async function supaCreateRoom(id, name){
  if(!supaEnabled) return;
  try{ await withTimeout(supaClient.from('rooms').insert({ id, name, created_by: supaUserId }), 2000); }catch(e){ console.warn('supaCreateRoom',e.message); }
}
async function supaJoinRoom(rid){
  if(!supaEnabled || !supaUserId) return;
  try{ await withTimeout(supaClient.from('room_members').insert({ room_id: rid, user_id: supaUserId }), 2000); }catch(e){}
}
async function supaLoadMessages(rid){
  if(!supaEnabled) return [];
  try{
    const { data } = await withTimeout(supaClient.from('messages').select('*').eq('room_id', rid).order('created_at',{ascending:true}).limit(200), 2000);
    return data||[];
  }catch{ return []; }
}
async function supaSendMessage(rid, text){
  if(!supaEnabled) return;
  const id = 'm-'+Date.now()+Math.random().toString(36).slice(2,6);
  try{ await supaClient.from('messages').insert({ id, room_id: rid, user_id: supaUserId, user_name: myName, text }); }catch(e){ console.warn(e); }
}
async function supaLogScreen(rid, action){
  if(!supaEnabled) return;
  const id='s-'+Date.now()+Math.random().toString(36).slice(2,6);
  try{ await supaClient.from('screen_logs').insert({ id, room_id: rid, user_id: supaUserId, user_name: myName, action }); }catch{}
}
function supaSubscribeMessages(rid){
  if(!supaEnabled) return;
  try{
    supaChannel = supaClient.channel('messages-'+rid).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`room_id=eq.${rid}`}, payload=>{
      const m = payload.new;
      if(m.user_id===supaUserId) return;
      addChatMessage(m.user_name, m.text, false, false);
    }).subscribe();
  }catch(e){ console.warn(e); }
}

function genId(){ return 'v-' + Math.random().toString(36).slice(2,6) + '-' + Math.random().toString(36).slice(2,6); }
function toast(msg){ toastGlobal.textContent = msg; toastGlobal.classList.add('show'); setTimeout(()=>toastGlobal.classList.remove('show'),2600); console.log('[toast]',msg); }
function showCopyToast(){ copyToast.classList.add('show'); setTimeout(()=>copyToast.classList.remove('show'),1400); }
async function copyText(t){
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(t);
    else {
      const ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast('کپی شد ✓'); showCopyToast();
  }catch{ toast('کپی نشد: '+t); }
}
function escapeHtml(s){ return String(s).replace(/[&<>"'`]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c])); }
function getName(){ return displayNameInput.value.trim() || 'مهمان-' + Math.floor(Math.random()*900+100) }
function updateCounts(){ const n = connections.size + 1; peerCount.textContent = n + ' نفر آنلاین'; sideCount.textContent = n; }

let audioUnlockObserver=null;
function unlockAudio(){
  if(audioUnlocked) return;
  audioUnlocked=true;
  document.querySelectorAll('audio,video').forEach(el=> el.play().catch(()=>{}));
  if(audioContext && audioContext.state==='suspended') audioContext.resume().catch(()=>{});
  if(!audioUnlockObserver){
    audioUnlockObserver=new MutationObserver(muts=>{
      muts.forEach(m=> m.addedNodes.forEach(n=>{
        if(n.tagName==='AUDIO' || n.tagName==='VIDEO'){ n.muted = n.tagName==='AUDIO' ? isDeafened : n.muted; n.play().catch(()=>{}); }
      }));
    });
    audioUnlockObserver.observe(document.body,{childList:true,subtree:true});
  }
}
document.addEventListener('click', unlockAudio, {once:true});
document.addEventListener('touchend', unlockAudio, {once:true});

async function ensureMic(){
  if(localStream){ localStream.getAudioTracks().forEach(t=> t.enabled = isMicOn); return localStream; }
  if(!window.isSecureContext && location.hostname!=='localhost' && location.hostname!=='127.0.0.1'){
    toast('برای میکروفون باید با https باز کنی');
    return null;
  }
  try{
    localStream = await navigator.mediaDevices.getUserMedia({
      audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 },
      video:false
    });
    console.log('mic granted', localStream.getTracks().map(t=>t.label));
    isMicOn=true;
    setupAudioAnalyser(localStream);
    return localStream;
  }catch(e){
    console.error('mic error',e);
    if(e.name==='NotAllowedError') toast('دسترسی میکروفون رد شد — روی Allow بزن و رفرش کن');
    else toast('میکروفون در دسترس نیست: '+e.message);
    localStream=null; return null;
  }
}
function setupAudioAnalyser(stream){
  try{
    if(audioContext) try{ audioContext.close(); }catch{}
    audioContext = new (window.AudioContext||window.webkitAudioContext)();
    const src = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize=512; analyser.smoothingTimeConstant=0.8;
    src.connect(analyser);
    const data=new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking=false;
    function tick(){
      if(!analyser) return;
      analyser.getByteFrequencyData(data);
      const avg=data.reduce((a,b)=>a+b,0)/data.length;
      speaking = avg>18 && isMicOn;
      if(speaking!==lastSpeaking){ lastSpeaking=speaking; queueRender(); }
      requestAnimationFrame(tick);
    }
    tick();
    if(audioContext.state==='suspended') audioContext.resume();
  }catch(e){ console.warn('analyser',e); }
}
function queueRender(){
  if(renderQueued) return;
  renderQueued=true;
  requestAnimationFrame(()=>{ renderQueued=false; renderParticipants(); });
}

function initPeer(id){
  return new Promise((resolve,reject)=>{
    const p = new Peer(id, {
      debug:1,
      config:{
        iceServers:[
          {urls:'stun:stun.l.google.com:19302'},
          {urls:'stun:stun1.l.google.com:19302'},
          {urls:'stun:stun2.l.google.com:19302'},
          {urls:'stun:stun.relay.metered.ca:80'},
          {urls:'turn:openrelay.metered.ca:80', username:'openrelayproject', credential:'openrelayproject'},
          {urls:'turn:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject'},
          {urls:'turn:openrelay.metered.ca:443?transport=tcp', username:'openrelayproject', credential:'openrelayproject'}
        ],
        sdpSemantics:'unified-plan'
      }
    });
    let timeout=setTimeout(()=>{ try{p.destroy();}catch{}; reject(new Error('peer timeout')); },6000);
    p.on('open', oid=>{ clearTimeout(timeout); console.log('peer open',oid); resolve(p); });
    p.on('error', err=>{
      console.error('peer error',err);
      if(err.type==='unavailable-id'){ clearTimeout(timeout); reject(err); }
      else if(err.type==='peer-unavailable'){ toast('شناسه یافت نشد'); }
      else toast('خطا: '+(err.message||err.type));
    });
    let retries=0;
    p.on('disconnected',()=>{
      if(retries++<5){ setTimeout(()=>{ try{p.reconnect();}catch{} }, 1000*retries); }
      else toast('ارتباط قطع شد — رفرش کن');
    });
    p.on('close',()=> toast('ارتباط بسته شد'));
  });
}

async function enterRoom(id, isCreator){
  myName=getName();
  roomId=id;
  myId=isCreator ? id : id+'-'+Math.random().toString(36).slice(2,5);
  localStorage.setItem('vr_name', myName);
  lobby.classList.add('hidden');
  room.classList.remove('hidden');
  roomIdDisplay.textContent=isCreator?myId:id;
  myIdText.textContent=myId;
  myIdBox.classList.remove('hidden');
  history.replaceState(null,'','?room='+encodeURIComponent(isCreator?myId:id));

  if(supaEnabled){
    try{
      const test=await withTimeout(supaClient.from('users').select('id').limit(1), 2500);
      if(test && test.error && test.error.code==='PGRST205'){
        toast('⚠️ جدول‌های Supabase ساخته نشده — فعلاً با PeerJS کار می‌کنه');
        supaEnabled=false;
      } else {
        await supaEnsureUser(myName);
        if(isCreator) await supaCreateRoom(id,id); else await supaJoinRoom(id);
        const oldMsgs=await supaLoadMessages(id);
        if(oldMsgs.length){ chatBox.innerHTML=''; oldMsgs.forEach(m=> addChatMessage(m.user_name, m.text, m.user_id===supaUserId, false)); }
        supaSubscribeMessages(id);
      }
    }catch(e){ console.warn('supa skip',e.message); }
  }

  await ensureMic();
  unlockAudio();
  try{
    peer=await initPeer(myId);
  }catch(e){
    if(e.type==='unavailable-id'){
      toast('شناسه تکراری — یکی دیگه می‌سازم');
      const newId=genId();
      roomInput.value=newId;
      return enterRoom(newId, true);
    }
    toast('ارتباط برقرار نشد: '+e.message);
    lobby.classList.remove('hidden'); room.classList.add('hidden');
    return;
  }
  myIdText.textContent=peer.id;
  roomIdDisplay.textContent=isCreator?peer.id:id;
  attachPeerHandlers();
  renderParticipants(); updateCounts();
  if(!isCreator){
    toast('در حال اتصال به '+id+' ...');
    await connectToPeer(id);
    setTimeout(()=>{ if(connections.size===0) toast('وصل نشد — مطمئن شو سازنده آنلاینه'); },3500);
  } else {
    toast('اتاق ساخته شد — لینک را بفرست');
  }
}

function attachPeerHandlers(){
  peer.on('connection', conn=> handleDataConnection(conn));
  peer.on('call', async call=>{
    const peerId=call.peer;
    console.log('incoming call',peerId,call.metadata);
    if(call.metadata && call.metadata.type==='screen'){
      call.answer();
      call.on('stream', stream=> addScreenStream(peerId, stream, getPeerName(peerId)));
      call.on('close', ()=> removeScreenStream(peerId));
      call.on('error', ()=> removeScreenStream(peerId));
      if(!connections.has(peerId)) connections.set(peerId,{});
      connections.get(peerId).screenCall=call; connections.get(peerId).screenOn=true;
    } else {
      try{ await ensureMic(); }catch{}
      call.answer(localStream||undefined);
      handleMediaCall(call);
    }
    const existing=connections.get(peerId);
    if(!existing || !existing.conn || !existing.conn.open){
      try{ const dc=peer.connect(peerId,{reliable:true}); handleDataConnection(dc); }catch{}
    }
  });
}

function handleDataConnection(conn){
  const peerId=conn.peer;
  if(pendingPeers.has(peerId)) pendingPeers.delete(peerId);
  if(!connections.has(peerId)) connections.set(peerId,{});
  const entry=connections.get(peerId);
  entry.conn=conn;
  entry.name=entry.name||peerId.slice(0,8);
  conn.on('open', ()=>{
    console.log('data open',peerId);
    conn.send({ t:'hello', name:myName, micOn:isMicOn, screenOn:isScreenOn, peers:[...connections.keys(), peer.id] });
    if(isScreenOn && screenStream){
      setTimeout(()=>{
        try{
          const sCall=peer.call(peerId, screenStream, {metadata:{type:'screen'}});
          sCall.on('error', e=> console.error(e));
          entry.screenCallOut=sCall;
        }catch(e){ console.error(e); }
      },400);
    }
    updateCounts(); queueRender();
  });
  conn.on('data', data=>{
    if(!data||!data.t) return;
    if(data.t==='hello'){
      entry.name=data.name||entry.name;
      entry.micOn=data.micOn; entry.screenOn=data.screenOn;
      if(data.peers && Array.isArray(data.peers)){
        // debounce و فقط یک طرف وصل شه
        data.peers.forEach(pid=>{
          if(pid===peer.id || pid===peerId) return;
          if(connections.has(pid) && connections.get(pid).conn?.open) return;
          if(pendingPeers.has(pid)) return;
          // فقط peer با id بزرگتر وصل شه تا حلقه نشه
          if(String(peer.id) > String(pid)) return;
          pendingPeers.add(pid);
          setTimeout(()=>{ pendingPeers.delete(pid); connectToPeer(pid); }, 100+Math.random()*200);
        });
      }
      queueRender();
    } else if(data.t==='update'){
      if('micOn' in data) entry.micOn=data.micOn;
      if('screenOn' in data) entry.screenOn=data.screenOn;
      if(data.name) entry.name=data.name;
      queueRender();
    } else if(data.t==='chat'){
      addChatMessage(data.name||entry.name, data.text, false, data.system);
    } else if(data.t==='peer-left'){
      handlePeerLeave(data.peerId);
    }
  });
  conn.on('close', ()=> handlePeerLeave(peerId));
  conn.on('error', ()=> handlePeerLeave(peerId));
}

function handleMediaCall(call){
  const peerId=call.peer;
  if(!connections.has(peerId)) connections.set(peerId,{});
  const entry=connections.get(peerId);
  if(entry.call && entry.call!==call) try{ entry.call.close(); }catch{}
  entry.call=call;
  let received=false;
  const to=setTimeout(()=>{
    if(!received){
      toast('صدای '+getPeerName(peerId)+' نیومد — تلاش مجدد');
      try{ call.close(); }catch{}
      setTimeout(()=>{
        if(peer && localStream && connections.has(peerId)){
          try{ const nc=peer.call(peerId, localStream, {metadata:{type:'voice'}}); if(nc) handleMediaCall(nc); }catch{}
        }
      },1000);
    }
  },4000);
  call.on('stream', stream=>{
    received=true; clearTimeout(to);
    entry.stream=stream; entry.voiceRetry=0;
    attachAudio(peerId, stream);
    queueRender();
    toast('ویس '+getPeerName(peerId)+' وصل شد ✓');
    unlockAudio();
  });
  call.on('close', ()=>{ clearTimeout(to); removeAudio(peerId); });
  call.on('error', (e)=>{
    clearTimeout(to); console.error('voice err',e);
    toast('خطای ویس با '+getPeerName(peerId));
    removeAudio(peerId);
    if(!entry.voiceRetry || entry.voiceRetry<1){
      entry.voiceRetry=(entry.voiceRetry||0)+1;
      setTimeout(()=>{ if(peer&&localStream){ try{ const nc=peer.call(peerId, localStream, {metadata:{type:'voice'}}); if(nc) handleMediaCall(nc); }catch{} } },1500);
    }
  });
}

async function connectToPeer(peerId){
  if(!peer || !peerId || peerId===peer.id) return;
  const ex=connections.get(peerId);
  if(ex && ex.conn?.open) return;
  if(pendingPeers.has(peerId)) return;
  pendingPeers.add(peerId);
  console.log('connectToPeer',peerId);
  const conn=peer.connect(peerId,{reliable:true});
  handleDataConnection(conn);
  await ensureMic();
  await new Promise(r=> setTimeout(r,300));
  if(localStream){
    try{
      const call=peer.call(peerId, localStream, {metadata:{type:'voice'}});
      if(call) handleMediaCall(call);
    }catch(e){ console.error(e); toast('تماس صوتی برقرار نشد'); }
  } else {
    toast('میکروفون نداری — صدات نمیره');
  }
  if(screenStream && isScreenOn){
    try{
      const sCall=peer.call(peerId, screenStream, {metadata:{type:'screen'}});
      if(!connections.has(peerId)) connections.set(peerId,{});
      connections.get(peerId).screenCallOut=sCall;
    }catch{}
  }
  setTimeout(()=> pendingPeers.delete(peerId), 3000);
}

function getPeerName(pid){ const e=connections.get(pid); return e?.name||pid.slice(0,8); }

function attachAudio(peerId, stream){
  let el=document.getElementById('audio-'+peerId);
  if(!el){
    el=document.createElement('audio');
    el.id='audio-'+peerId;
    el.autoplay=true; el.playsInline=true; el.controls=false; el.style.display='none';
    document.body.appendChild(el);
  }
  el.srcObject=stream;
  el.muted=isDeafened; el.volume=1.0;
  const tracks=stream.getAudioTracks();
  console.log('attachAudio',peerId, tracks.map(t=>t.label+' enabled='+t.enabled));
  if(tracks.length===0) toast('صدایی از '+getPeerName(peerId)+' نیومد');
  const p=el.play();
  if(p) p.then(()=> console.log('audio ok',peerId)).catch(e=>{
    console.warn('play blocked',e);
    toast('برای شنیدن صدا یک بار کلیک کن');
    const once=()=>{ el.play().catch(()=>{}); document.removeEventListener('click',once); };
    document.addEventListener('click',once);
  });
}
function removeAudio(peerId){ const el=document.getElementById('audio-'+peerId); if(el){ el.srcObject=null; el.remove(); } }

function addScreenStream(peerId, stream, name){
  let card=document.getElementById('screen-'+peerId);
  if(!card){
    card=document.createElement('div');
    card.id='screen-'+peerId;
    card.className='screen-card';
    card.innerHTML=`<video autoplay playsinline></video><div class="label"><i class="fa-solid fa-display"></i> <span></span></div>`;
    screenGrid.appendChild(card);
    screenGrid.classList.remove('hidden');
  }
  card.querySelector('span').textContent=name+' — اشتراک صفحه';
  const v=card.querySelector('video');
  v.autoplay=true; v.playsInline=true; v.muted=false;
  v.srcObject=stream;
  v.onloadedmetadata=()=>{
    console.log('screen meta',peerId, v.videoWidth, v.videoHeight);
    v.play().then(()=> console.log('screen ok',peerId)).catch(e=>{
      console.warn(e); v.muted=true; v.play().catch(()=>{}); toast('برای دیدن اسکرین کلیک کن');
    });
  };
  const vTracks=stream.getVideoTracks();
  console.log('screen tracks', vTracks.map(t=>t.label+' '+t.readyState));
  if(vTracks.length===0) toast('اسکرین بدون تصویر');
  stream.getVideoTracks()[0]?.addEventListener('ended', ()=> removeScreenStream(peerId));
  const e=connections.get(peerId);
  if(e){ e.screenStream=stream; e.screenOn=true; }
  queueRender();
  setTimeout(()=> v.play().catch(()=>{}),300);
}
function removeScreenStream(peerId){
  const card=document.getElementById('screen-'+peerId);
  if(card) card.remove();
  if(screenGrid.children.length===0) screenGrid.classList.add('hidden');
  const e=connections.get(peerId);
  if(e){ e.screenOn=false; e.screenStream=null; }
  queueRender();
}
function addMyScreenCard(){
  let card=document.getElementById('screen-mine');
  if(isScreenOn && screenStream){
    if(!card){
      card=document.createElement('div');
      card.id='screen-mine';
      card.className='screen-card';
      card.innerHTML=`<video autoplay playsinline muted></video><div class="label"><i class="fa-solid fa-display"></i> <span>صفحه تو</span></div>`;
      screenGrid.prepend(card);
      screenGrid.classList.remove('hidden');
    }
    const v=card.querySelector('video');
    v.srcObject=screenStream; v.muted=true; v.play().catch(()=>{});
  } else {
    if(card) card.remove();
    if(screenGrid.children.length===0) screenGrid.classList.add('hidden');
  }
}

function renderParticipants(){
  // diff render - فقط اگر لازم باشه کل رو بساز، وگرنه فقط speaking
  participantsGrid.innerHTML='';
  memberList.innerHTML='';
  const meCard=document.createElement('div');
  meCard.className='p-card'+(speaking?' speaking':'');
  meCard.innerHTML=`
    <div class="avatar"><span>${escapeHtml(myName.slice(0,1).toUpperCase())}</span></div>
    <h4>${escapeHtml(myName)} <span style="font-size:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:2px 6px;border-radius:999px">تو</span></h4>
    <span class="badge ${isMicOn?'mic-on':'mic-off'}"><i class="fa-solid ${isMicOn?'fa-microphone':'fa-microphone-slash'}"></i> ${isMicOn?'روشن':'ساکت'}</span>
    ${isScreenOn?'<span class="badge screen-on"><i class="fa-solid fa-display"></i> صفحه</span>':''}
  `;
  participantsGrid.appendChild(meCard);
  const meLi=document.createElement('li');
  meLi.innerHTML=`<div class="m-avatar">${escapeHtml(myName.slice(0,1).toUpperCase())}</div><div class="m-info"><b>${escapeHtml(myName)} (تو)</b><span>${isMicOn?'میک روشن':'میک بسته'}</span></div><span class="m-status ${isMicOn?'on':'off'}">${isMicOn?'●':'○'}</span>`;
  memberList.appendChild(meLi);
  connections.forEach((entry,pid)=>{
    const name=escapeHtml(entry.name||pid.slice(0,8));
    const micOn=entry.micOn!==false;
    const hasScreen=!!entry.screenOn;
    const card=document.createElement('div');
    card.className='p-card';
    card.innerHTML=`
      <div class="avatar"><span>${name.slice(0,1).toUpperCase()}</span></div>
      <h4>${name}</h4>
      <span class="badge ${micOn?'mic-on':'mic-off'}"><i class="fa-solid ${micOn?'fa-microphone':'fa-microphone-slash'}"></i> ${micOn?'روشن':'ساکت'}</span>
      ${hasScreen?'<span class="badge screen-on"><i class="fa-solid fa-display"></i> صفحه</span>':''}
    `;
    participantsGrid.appendChild(card);
    const li=document.createElement('li');
    li.innerHTML=`<div class="m-avatar">${name.slice(0,1).toUpperCase()}</div><div class="m-info"><b>${name}</b><span>${micOn?'میک روشن':'میک بسته'}${hasScreen?' • صفحه':''}</span></div><span class="m-status ${micOn?'on':'off'}">${micOn?'●':'○'}</span>`;
    li.title=pid; li.style.cursor='pointer'; li.onclick=()=> copyText(pid);
    memberList.appendChild(li);
  });
  updateCounts();
}

function handlePeerLeave(pid){
  const e=connections.get(pid);
  if(!e) return;
  try{ e.conn&&e.conn.close(); }catch{}
  try{ e.call&&e.call.close(); }catch{}
  try{ e.screenCall&&e.screenCall.close(); }catch{}
  try{ e.screenCallOut&&e.screenCallOut.close(); }catch{}
  removeAudio(pid); removeScreenStream(pid);
  connections.delete(pid);
  // به بقیه خبر بده
  connections.forEach(ent=>{ try{ ent.conn&&ent.conn.open&&ent.conn.send({t:'peer-left', peerId:pid}); }catch{} });
  addChatMessage(null, (e.name||pid.slice(0,8))+' خارج شد', false, true);
  queueRender();
}

function addChatMessage(name, text, isMe=false, isSystem=false){
  if(chatBox.querySelector('.chat-empty')) chatBox.innerHTML='';
  const div=document.createElement('div');
  div.className='msg'+(isMe?' me':'')+(isSystem?' system':'');
  if(isSystem){
    div.style.background='transparent'; div.style.border='1px dashed rgba(255,255,255,0.15)'; div.style.textAlign='center'; div.style.color='rgba(255,255,255,0.6)'; div.style.fontSize='11px';
    div.innerHTML=`<p>${escapeHtml(text)}</p>`;
  } else {
    const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    div.innerHTML=`<b>${escapeHtml(name)}</b><p>${escapeHtml(text)}</p><small>${time}</small>`;
  }
  chatBox.appendChild(div);
  chatBox.scrollTop=chatBox.scrollHeight;
}

function broadcastUpdate(){
  connections.forEach(e=>{ try{ e.conn&&e.conn.open&&e.conn.send({t:'update', micOn:isMicOn, screenOn:isScreenOn, name:myName}); }catch{} });
}
function broadcastChat(text){
  const limited=text.slice(0,1000);
  connections.forEach(e=>{ try{ if(e.conn&&e.conn.open&&e.conn.bufferedAmount<16384) e.conn.send({t:'chat', name:myName, text:limited}); }catch{} });
}

createBtn.onclick=async ()=>{
  console.log('create clicked');
  if(!displayNameInput.value.trim()){ displayNameInput.focus(); toast('اول نامت را وارد کن'); return; }
  const id=genId(); roomInput.value=id;
  try{ await enterRoom(id,true); }catch(e){ console.error(e); toast('خطا در ساخت: '+e.message); }
};
joinBtn.onclick=async ()=>{
  const id=roomInput.value.trim();
  if(!id){ toast('شناسه اتاق را وارد کن'); return; }
  if(!displayNameInput.value.trim()){ displayNameInput.focus(); toast('نام را وارد کن'); return; }
  try{ await enterRoom(id,false); }catch(e){ console.error(e); toast('خطا در ورود: '+e.message); }
};
quickCallBtn.onclick=()=> doQuickCall();
quickPeerInput.addEventListener('keydown', e=>{ if(e.key==='Enter') doQuickCall(); });
function doQuickCall(){
  const pid=quickPeerInput.value.trim();
  if(!pid) return;
  pendingPeers.add(pid);
  connectToPeer(pid);
  quickPeerInput.value='';
  toast('در حال اتصال به '+pid.slice(0,12)+'...');
  setTimeout(()=> pendingPeers.delete(pid),5000);
}

copyIdBtn.onclick=()=> copyText(myIdText.textContent);
copyRoomBtn.onclick=()=> copyText(roomIdDisplay.textContent);
shareBtn.onclick=async ()=>{
  const link=location.origin+location.pathname+'?room='+encodeURIComponent(myIdText.textContent);
  if(navigator.share){ try{ await navigator.share({title:'دعوت به ویس‌روم', text:'بیا به ویس وصل شو', url:link}); }catch{} } else copyText(link);
};

micBtn.onclick=toggleMic;
function toggleMic(){
  isMicOn=!isMicOn;
  if(localStream) localStream.getAudioTracks().forEach(t=> t.enabled=isMicOn);
  else if(isMicOn) ensureMic();
  micBtn.classList.toggle('off', !isMicOn); micBtn.classList.toggle('on', isMicOn);
  micBtn.querySelector('span').textContent=isMicOn?'میکروفون روشن':'میکروفون بسته';
  micBtn.querySelector('i').className=isMicOn?'fa-solid fa-microphone':'fa-solid fa-microphone-slash';
  broadcastUpdate(); queueRender(); toast(isMicOn?'میکروفون روشن':'میکروفون بسته');
}
deafenBtn.onclick=()=>{
  isDeafened=!isDeafened;
  deafenBtn.classList.toggle('active', isDeafened);
  deafenBtn.querySelector('span').textContent=isDeafened?'صدا قطع':'صدا روشن';
  document.querySelectorAll('audio').forEach(a=>{ a.muted=isDeafened; if(!isDeafened) a.play().catch(()=>{}); });
  toast(isDeafened?'صدای دیگران قطع شد':'صدای دیگران وصل شد');
};
screenBtn.onclick=toggleScreen;
async function toggleScreen(){
  if(isScreenOn){ stopScreen(); return; }
  try{
    try{ screenStream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'monitor'}, audio:true}); }
    catch{ screenStream=await navigator.mediaDevices.getDisplayMedia({video:true, audio:false}); }
    const vTracks=screenStream.getVideoTracks();
    if(!vTracks.length) throw new Error('no video');
    isScreenOn=true;
    screenBtn.classList.add('active');
    screenBtn.querySelector('span').textContent='توقف اشتراک';
    addMyScreenCard();
    connections.forEach((_,pid)=>{
      try{
        const call=peer.call(pid, screenStream, {metadata:{type:'screen'}});
        call.on('error', e=> console.error(e));
        const ent=connections.get(pid);
        if(ent) ent.screenCallOut=call;
      }catch(e){ console.error(e); }
    });
    broadcastUpdate(); queueRender();
    toast('اشتراک صفحه شروع شد');
    if(supaEnabled&&roomId) supaLogScreen(roomId,'start');
    vTracks[0].addEventListener('ended', stopScreen);
  }catch(e){ console.error(e); toast('اشتراک صفحه لغو شد: '+(e.message||'')); }
}
function stopScreen(){
  isScreenOn=false;
  screenBtn.classList.remove('active');
  screenBtn.querySelector('span').textContent='اشتراک صفحه';
  if(screenStream){ screenStream.getTracks().forEach(t=> t.stop()); screenStream=null; }
  addMyScreenCard();
  connections.forEach(e=>{ try{ e.screenCallOut&&e.screenCallOut.close(); }catch{} e.screenCallOut=null; });
  broadcastUpdate(); queueRender();
  if(supaEnabled&&roomId) supaLogScreen(roomId,'stop');
}

function sendChat(){
  const txt=chatInput.value.trim();
  if(!txt) return;
  if(txt.length>1000){ toast('پیام خیلی طولانیه'); return; }
  addChatMessage(myName, txt, true);
  broadcastChat(txt);
  if(supaEnabled&&roomId) supaSendMessage(roomId, txt);
  chatInput.value='';
}
chatSendBtn.onclick=sendChat;
chatInput.addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });

async function leaveRoom(){
  if(supaChannel) try{ await supaChannel.unsubscribe(); supaChannel=null; }catch{}
  if(screenStream) stopScreen();
  if(localStream){ localStream.getTracks().forEach(t=> t.stop()); localStream=null; }
  if(analyser) { analyser=null; if(audioContext) try{ await audioContext.close(); }catch{} audioContext=null; speaking=false; }
  for(const pid of [...connections.keys()]) handlePeerLeave(pid);
  connections.clear(); pendingPeers.clear();
  if(peer){ try{ peer.destroy(); }catch{} peer=null; }
  room.classList.add('hidden'); lobby.classList.remove('hidden'); myIdBox.classList.add('hidden');
  roomId=null; myId=null;
  history.replaceState(null,'',location.pathname);
}
leaveBtn.onclick=leaveRoom;
endBtn.onclick=leaveRoom;

document.addEventListener('keydown', e=>{
  if(room.classList.contains('hidden')) return;
  if(e.key==='m'||e.key==='M'||e.key==='م') toggleMic();
  if(e.key==='s'||e.key==='S'||e.key==='س') toggleScreen();
});

helpBtn.onclick=(e)=>{ e.preventDefault(); helpModal.classList.remove('hidden'); };
closeHelp.onclick=()=> helpModal.classList.add('hidden');
helpModal.onclick=(e)=>{ if(e.target===helpModal) helpModal.classList.add('hidden'); };

const savedName=localStorage.getItem('vr_name');
if(savedName) displayNameInput.value=savedName;
const params=new URLSearchParams(location.search);
const roomParam=params.get('room');
if(roomParam) roomInput.value=roomParam;
displayNameInput.addEventListener('input', ()=> localStorage.setItem('vr_name', displayNameInput.value));
window.addEventListener('beforeunload', e=>{ if(!room.classList.contains('hidden')){ e.preventDefault(); e.returnValue=''; }});
if(!window.isSecureContext && location.hostname!=='localhost' && location.hostname!=='127.0.0.1'){
  console.warn('need https');
  setTimeout(()=> toast('برای میکروفون باید با https باز کنی'), 1000);
}
window.addEventListener('error', e=>{ console.error('global',e.message); toast('خطا: '+e.message); });
window.addEventListener('unhandledrejection', e=>{ console.error(e.reason); toast('خطا: '+(e.reason?.message||e.reason)); });

// تست خودکار
console.log('✅ app.js v8 loaded');
