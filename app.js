// Voice Room — Fixed PeerJS Mesh + Screen Share (ویس + اسکرین بدون سیاهی)
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
let audioContext, analyser;
let speaking = false;
let audioUnlocked = false;

// ===== Supabase (اگر کانفیگ پر باشد، DB ابری فعال می‌شود) =====
let supaClient = null;
let supaUserId = null;
let supaEnabled = false;
try{
  if(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_PROJECT') && typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY.includes('eyJ')){
    supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supaEnabled = true;
    console.log('✅ Supabase enabled', SUPABASE_URL);
  } else {
    console.log('ℹ️ Supabase disabled - PeerJS only mode');
  }
}catch(e){ console.warn('supabase init fail',e); }

async function supaEnsureUser(name){
  if(!supaEnabled) return null;
  try{
    supaUserId = 'u-' + Math.random().toString(36).slice(2,9);
    const { error } = await supaClient.from('users').insert({ id: supaUserId, name });
    if(error) console.warn('supa user insert',error);
    return supaUserId;
  }catch(e){ console.warn(e); return null; }
}
async function supaCreateRoom(id, name){
  if(!supaEnabled) return;
  try{ await supaClient.from('rooms').insert({ id, name, created_by: supaUserId }); }catch(e){}
}
async function supaJoinRoom(roomId){
  if(!supaEnabled || !supaUserId) return;
  try{ await supaClient.from('room_members').insert({ room_id: roomId, user_id: supaUserId }); }catch(e){}
}
async function supaLoadMessages(roomId){
  if(!supaEnabled) return [];
  const { data } = await supaClient.from('messages').select('*').eq('room_id', roomId).order('created_at',{ascending:true}).limit(200);
  return data||[];
}
async function supaSendMessage(roomId, text){
  if(!supaEnabled) return;
  const id = 'm-'+Date.now()+Math.random().toString(36).slice(2,6);
  await supaClient.from('messages').insert({ id, room_id: roomId, user_id: supaUserId, user_name: myName, text });
}
async function supaLogScreen(roomId, action){
  if(!supaEnabled) return;
  const id='s-'+Date.now()+Math.random().toString(36).slice(2,6);
  await supaClient.from('screen_logs').insert({ id, room_id: roomId, user_id: supaUserId, user_name: myName, action });
}
function supaSubscribeMessages(roomId){
  if(!supaEnabled) return;
  supaClient.channel('messages-'+roomId).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`room_id=eq.${roomId}`}, payload=>{
    const m = payload.new;
    if(m.user_id===supaUserId) return; // خودم قبلاً اضافه کردم
    addChatMessage(m.user_name, m.text, false, false);
  }).subscribe();
}

function genId(){ return 'v-' + Math.random().toString(36).slice(2,6) + '-' + Math.random().toString(36).slice(2,6); }
function toast(msg){ toastGlobal.textContent = msg; toastGlobal.classList.add('show'); setTimeout(()=>toastGlobal.classList.remove('show'),2600); console.log('[toast]',msg); }
function showCopyToast(){ copyToast.classList.add('show'); setTimeout(()=>copyToast.classList.remove('show'),1400); }
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('کپی شد ✓'); showCopyToast(); }catch{ toast('کپی نشد، دستی کپی کن: '+t); } }
function getName(){ return displayNameInput.value.trim() || 'مهمان-' + Math.floor(Math.random()*900+100) }
function updateCounts(){ const n = connections.size + 1; peerCount.textContent = n + ' نفر آنلاین'; sideCount.textContent = n; }

// unlock audio on first interaction (برای رفع بلاک autoplay)
function unlockAudio(){
  if(audioUnlocked) return;
  audioUnlocked = true;
  document.querySelectorAll('audio').forEach(a=>{
    a.muted = isDeafened;
    a.play().catch(()=>{});
  });
  document.querySelectorAll('video').forEach(v=> v.play().catch(()=>{}));
  if(audioContext && audioContext.state==='suspended') audioContext.resume().catch(()=>{});
}
document.addEventListener('click', unlockAudio, {once:false});
document.addEventListener('touchend', unlockAudio, {once:false});

async function ensureMic(){
  if(localStream) {
    localStream.getAudioTracks().forEach(t=> t.enabled = isMicOn);
    return localStream;
  }
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true }, sampleRate: 48000, channelCount: 1, latency: { ideal: 0.01 }, googEchoCancellation: { ideal: true }, googAutoGainControl: { ideal: true }, googNoiseSuppression: { ideal: true }, googHighpassFilter: { ideal: true } }, video:false });
    console.log('mic granted', localStream.getTracks());
    isMicOn = true;
    setupAudioAnalyser(localStream);
    // اگر قبلاً به کسی وصل بودیم ولی بدون میک، حالا استریم را جایگزین کن (renegotiate با reconnect ساده)
    connections.forEach((entry,pid)=>{
      if(entry.call) {
        try{
          // برای ساده‌سازی: تماس جدید بزن
          const newCall = peer.call(pid, localStream, { metadata:{ type:'voice' } });
          handleMediaCall(newCall);
        }catch(e){ console.warn('re-call failed',e); }
      }
    });
    return localStream;
  }catch(e){
    console.error('mic error',e);
    toast('دسترسی میکروفون رد شد — روی Allow بزن و رفرش کن. بدون میک صدات نمیره.');
    localStream = null;
    return null;
  }
}
function setupAudioAnalyser(stream){
  try{
    audioContext = new (window.AudioContext||window.webkitAudioContext)();
    const src = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick(){
      if(!analyser) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a,b)=>a+b,0)/data.length;
      const wasSpeaking = speaking;
      speaking = avg > 14 && isMicOn;
      if(speaking!==wasSpeaking) renderParticipants();
      requestAnimationFrame(tick);
    }
    tick();
    if(audioContext.state==='suspended') audioContext.resume();
  }catch(e){ console.warn('analyser fail',e); }
}

function initPeer(id){
  return new Promise((resolve,reject)=>{
    const p = new Peer(id, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.relay.metered.ca:80' },
          // TURN رایگان برای عبور از NAT سخت - چند سرور برای پایداری بیشتر
          { urls: 'turn:openrelay.metered.ca:80', username:'openrelayproject', credential:'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username:'openrelayproject', credential:'openrelayproject' }
        ],
        iceTransportPolicy: 'all',
        sdpSemantics: 'unified-plan'
      }
    });
    p.on('open', oid=> { console.log('peer open',oid); resolve(p); });
    p.on('error', err=>{
      console.error('peer error',err);
      if(err.type==='unavailable-id'){ toast('این شناسه قبلاً استفاده شده — یکی دیگر بساز'); }
      else if(err.type==='peer-unavailable'){ toast('شناسه یافت نشد — مطمئن شو طرف مقابل اتاق را ساخته'); }
      else toast('خطا: '+ (err.message||err.type));
    });
    p.on('disconnected', ()=>{ console.log('peer disconnected, reconnecting'); try{ p.reconnect(); }catch{} });
  });
}

async function enterRoom(id, isCreator){
  myName = getName();
  roomId = id;
  myId = isCreator ? id : id + '-' + Math.random().toString(36).slice(2,5);
  localStorage.setItem('vr_name', myName);
  lobby.classList.add('hidden');
  room.classList.remove('hidden');
  roomIdDisplay.textContent = isCreator ? myId : id;
  myIdText.textContent = myId;
  myIdBox.classList.remove('hidden');
  history.replaceState(null,'','?room='+encodeURIComponent(isCreator?myId:id));
  // Supabase: ذخیره کاربر و اتاق (اگر جدول‌ها ساخته نشده باشه، گیر نکن)
  if(supaEnabled){
    try{
      // تست سریع که جدول وجود داره یا نه - اگر 404 ، غیرفعال کن و ادامه بده
      const test = await Promise.race([
        supaClient.from('users').select('id').limit(1),
        new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), 2500))
      ]);
      if(test && test.error && test.error.code==='PGRST205'){
        console.warn('Supabase tables not created yet - running in PeerJS only mode');
        toast('⚠️ جدول‌های Supabase هنوز ساخته نشده — لطفاً supabase.sql رو در SQL Editor اجرا کن (فعلاً با PeerJS کار می‌کنه)');
        supaEnabled = false;
      } else {
        await supaEnsureUser(myName);
        if(isCreator) await supaCreateRoom(id, id);
        else await supaJoinRoom(id);
        const oldMsgs = await supaLoadMessages(id);
        if(oldMsgs.length){
          chatBox.innerHTML='';
          oldMsgs.forEach(m=> addChatMessage(m.user_name, m.text, m.user_id===supaUserId, false));
        }
        supaSubscribeMessages(id);
      }
    }catch(e){
      console.warn('Supabase skip',e);
      // ادامه بده با PeerJS
    }
  }
  // مهم: قبل از Peer حتما میک را بگیر تا صدا قطع نباشد
  await ensureMic();
  unlockAudio();
  peer = await initPeer(myId);
  myIdText.textContent = peer.id;
  roomIdDisplay.textContent = isCreator ? peer.id : id;
  attachPeerHandlers();
  renderParticipants();
  updateCounts();
  if(!isCreator){
    toast('در حال اتصال به '+id+' ...');
    await connectToPeer(id);
    setTimeout(()=>{
      if(connections.size===0) toast('وصل نشد — مطمئن شو سازنده آنلاین است و شناسه درست است');
    }, 3500);
  } else {
    toast('اتاق ساخته شد — لینک را بفرست');
  }
}

function attachPeerHandlers(){
  peer.on('connection', conn=> handleDataConnection(conn));
  peer.on('call', async call=>{
    const peerId = call.peer;
    console.log('incoming call', peerId, call.metadata);
    if(call.metadata && call.metadata.type==='screen'){
      call.answer(); // بدون استریم، فقط دریافت
      call.on('stream', stream=>{
        console.log('screen stream received', peerId, stream.getTracks());
        if(!stream.getVideoTracks().length) {
          console.warn('screen stream has no video track');
          toast('اسکرین بدون ویدیو دریافت شد');
        }
        addScreenStream(peerId, stream, getPeerName(peerId));
      });
      call.on('close', ()=> removeScreenStream(peerId));
      call.on('error', e=> { console.error('screen call error',e); removeScreenStream(peerId); });
      if(!connections.has(peerId)) connections.set(peerId,{});
      const c = connections.get(peerId);
      c.screenCall = call;
      c.screenOn = true;
    } else {
      // voice
      try{ await ensureMic(); }catch{}
      console.log('answering voice call with', localStream);
      call.answer(localStream || undefined);
      handleMediaCall(call);
    }
    if(!connections.has(peerId) || !connections.get(peerId).conn || !connections.get(peerId).conn.open){
      try{
        const dc = peer.connect(peerId, { reliable:true });
        handleDataConnection(dc);
      }catch(e){ console.warn('data connect fail',e); }
    }
  });
}

function handleDataConnection(conn){
  const peerId = conn.peer;
  if(!connections.has(peerId)) connections.set(peerId,{});
  const entry = connections.get(peerId);
  entry.conn = conn;
  entry.name = entry.name || peerId.slice(0,8);
  conn.on('open', ()=>{
    console.log('data open',peerId);
    conn.send({ t:'hello', name: myName, micOn:isMicOn, screenOn:isScreenOn, peers: [...connections.keys(), peer.id] });
    // اگر من در حال اسکرین هستم، به تازه‌وارد هم بفرست (رفع سیاهی برای ورودی جدید)
    if(isScreenOn && screenStream){
      setTimeout(()=>{
        try{
          console.log('sending screen to newcomer',peerId);
          const sCall = peer.call(peerId, screenStream, { metadata:{ type:'screen' } });
          sCall.on('error', e=> console.error('screen to newcomer error',e));
          entry.screenCallOut = sCall;
        }catch(e){ console.error(e); }
      }, 400);
    }
    updateCounts(); renderParticipants();
  });
  conn.on('data', data=>{
    if(!data||!data.t) return;
    if(data.t==='hello'){
      entry.name = data.name || entry.name;
      entry.micOn = data.micOn;
      entry.screenOn = data.screenOn;
      if(data.peers && Array.isArray(data.peers)){
        data.peers.forEach(pid=>{
          if(pid===peer.id) return;
          if(pid===peerId) return;
          if(connections.has(pid) && connections.get(pid).conn && connections.get(pid).conn.open) return;
          console.log('mesh discover',pid);
          connectToPeer(pid);
        });
      }
      // اگر طرف مقابل در حال اسکرین است ولی ما هنوز استریم نداریم، چیزی نفرست — او خودش برای ما call می‌زند (در open خودش)
      renderParticipants();
    } else if(data.t==='update'){
      if('micOn' in data) entry.micOn = data.micOn;
      if('screenOn' in data) entry.screenOn = data.screenOn;
      if(data.name) entry.name = data.name;
      renderParticipants();
    } else if(data.t==='chat'){
      addChatMessage(data.name||entry.name, data.text, false, data.system);
    }
  });
  conn.on('close', ()=>{ console.log('data close',peerId); handlePeerLeave(peerId); });
  conn.on('error', (e)=>{ console.error('data error',peerId,e); handlePeerLeave(peerId); });
}

function handleMediaCall(call){
  const peerId = call.peer;
  if(!connections.has(peerId)) connections.set(peerId,{});
  const entry = connections.get(peerId);
  if(entry.call && entry.call !== call) { try{ entry.call.close(); }catch{} }
  entry.call = call;
  let streamReceived = false;
  const timeout = setTimeout(()=>{
    if(!streamReceived){
      console.warn('voice stream timeout for',peerId, 'retrying...');
      toast('صدای '+getPeerName(peerId)+' نیومد — دوباره تلاش می‌کنم');
      try{ call.close(); }catch{}
      // retry بعد از 1 ثانیه
      setTimeout(()=>{
        if(peer && localStream && connections.has(peerId)){
          try{
            const newCall = peer.call(peerId, localStream, { metadata:{ type:'voice' } });
            if(newCall) handleMediaCall(newCall);
          }catch(e){ console.error('retry call fail',e); }
        }
      }, 1000);
    }
  }, 4000);
  call.on('stream', stream=>{
    streamReceived = true;
    clearTimeout(timeout);
    console.log('voice stream from',peerId, stream.getAudioTracks());
    entry.stream = stream;
    entry.voiceRetry = 0;
    attachAudio(peerId, stream);
    renderParticipants();
    toast('ویس '+getPeerName(peerId)+' وصل شد ✓');
    unlockAudio();
    // چک کن که صدا واقعاً میاد یا نه (اگر ترک‌ها بی‌صدا بود)
    const tracks = stream.getAudioTracks();
    if(tracks.length && tracks[0].muted){
      console.warn('track muted',peerId);
      setTimeout(()=> { if(tracks[0].muted) toast('میک '+getPeerName(peerId)+' خاموشه'); }, 1000);
    }
  });
  call.on('close', ()=>{ clearTimeout(timeout); console.log('voice call close',peerId); removeAudio(peerId); });
  call.on('error', (e)=>{ clearTimeout(timeout); console.error('voice call error',peerId,e); toast('خطای ویس با '+getPeerName(peerId)); removeAudio(peerId);
    // retry یک بار
    if(!entry.voiceRetry || entry.voiceRetry<1){
      entry.voiceRetry = (entry.voiceRetry||0)+1;
      setTimeout(()=>{
        if(peer && localStream){
          try{
            const newCall = peer.call(peerId, localStream, { metadata:{ type:'voice' } });
            if(newCall) handleMediaCall(newCall);
          }catch{}
        }
      }, 1500);
    }
  });
}

async function connectToPeer(peerId){
  if(!peer || !peerId || peerId===peer.id) return;
  const existing = connections.get(peerId);
  if(existing && existing.conn && existing.conn.open) {
    console.log('already connected',peerId);
    return;
  }
  console.log('connectToPeer',peerId);
  const conn = peer.connect(peerId, { reliable:true });
  handleDataConnection(conn);
  await ensureMic();
  // کمی صبر برای open شدن data قبل از call
  await new Promise(r=> setTimeout(r, 300));
  if(localStream){
    try{
      const call = peer.call(peerId, localStream, { metadata:{ type:'voice' } });
      if(call) handleMediaCall(call);
      else console.warn('peer.call returned null',peerId);
    }catch(e){ console.error('call failed',e); toast('تماس صوتی برقرار نشد'); }
  } else {
    console.warn('no localStream, skipping voice call');
    toast('میکروفون نداری — صدات نمیره، ولی صدای بقیه را می‌شنوی');
  }
  if(screenStream && isScreenOn){
    try{
      const sCall = peer.call(peerId, screenStream, { metadata:{ type:'screen' } });
      sCall.on('error', e=> console.error('screen call error',e));
      if(!connections.has(peerId)) connections.set(peerId,{});
      connections.get(peerId).screenCallOut = sCall;
      console.log('screen call to',peerId);
    }catch(e){ console.error('screen call fail',e); }
  }
}

function getPeerName(pid){ const e = connections.get(pid); return e?.name || pid.slice(0,8); }

function attachAudio(peerId, stream){
  let el = document.getElementById('audio-'+peerId);
  if(!el){
    el = document.createElement('audio');
    el.id = 'audio-'+peerId;
    el.autoplay = true;
    el.playsInline = true;
    el.controls = false;
    el.style.display='none';
    document.body.appendChild(el);
  }
  el.srcObject = stream;
  el.muted = isDeafened;
  el.volume = 1.0;
  // برای دیباگ: اگر استریم بی‌صدا بود
  const tracks = stream.getAudioTracks();
  console.log('attachAudio',peerId,'tracks',tracks.map(t=> `${t.label} enabled=${t.enabled} muted=${t.muted}`));
  if(tracks.length===0) toast('صدایی از '+getPeerName(peerId)+' دریافت نشد (میک او خاموش است)');
  // تلاش برای پخش
  const playPromise = el.play();
  if(playPromise) playPromise.then(()=> console.log('audio play ok',peerId)).catch(e=>{
    console.warn('audio play blocked',e);
    toast('برای شنیدن صدا یک بار روی صفحه کلیک کن');
    // منتظر کلیک بمان
    const onClick = ()=>{
      el.play().catch(()=>{});
      document.removeEventListener('click', onClick);
    };
    document.addEventListener('click', onClick);
  });
}

function removeAudio(peerId){
  const el = document.getElementById('audio-'+peerId);
  if(el){ el.srcObject=null; el.remove(); }
}

function addScreenStream(peerId, stream, name){
  console.log('addScreenStream',peerId, stream);
  let card = document.getElementById('screen-'+peerId);
  if(!card){
    card = document.createElement('div');
    card.id = 'screen-'+peerId;
    card.className='screen-card';
    card.innerHTML = `<video autoplay playsinline></video><div class="label"><i class="fa-solid fa-display"></i> <span></span></div>`;
    screenGrid.appendChild(card);
    screenGrid.classList.remove('hidden');
  }
  card.querySelector('span').textContent = name + ' — اشتراک صفحه';
  const v = card.querySelector('video');
  v.autoplay = true;
  v.playsInline = true;
  v.muted = false;
  v.controls = false;
  v.style.background = '#000';
  v.srcObject = stream;
  // force play
  v.onloadedmetadata = ()=>{
    console.log('screen video metadata loaded',peerId, v.videoWidth, v.videoHeight);
    v.play().then(()=> console.log('screen play ok',peerId)).catch(e=> {
      console.warn('screen play blocked',e);
      v.muted = true;
      v.play().catch(()=>{});
      toast('برای دیدن اسکرین یک بار کلیک کن');
    });
  };
  // اگر قبلاً metadata لود شده بود
  if(v.readyState >= 1) v.play().catch(()=>{});
  // در صورت سیاه بودن، لاگ ترک‌ها
  const vTracks = stream.getVideoTracks();
  console.log('screen video tracks', vTracks.map(t=> `${t.label} readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
  if(vTracks.length===0) toast('اسکرین بدون تصویر دریافت شد');
  // اگر ترک ended شد حذف کن
  stream.getTracks().forEach(t=> t.onended = ()=> { console.log('screen track ended',peerId); removeScreenStream(peerId); });
  vTracks.forEach(t=> t.onmute = ()=> console.log('track mute',peerId));
  vTracks.forEach(t=> t.onunmute = ()=> console.log('track unmute',peerId));

  const e = connections.get(peerId);
  if(e){ e.screenStream = stream; e.screenOn = true; }
  renderParticipants();
  // رفع سیاهی با کمی تاخیر: بعضی مرورگرها اول سیاه می‌مونن
  setTimeout(()=> { v.play().catch(()=>{}); }, 300);
}

function removeScreenStream(peerId){
  const card = document.getElementById('screen-'+peerId);
  if(card) card.remove();
  if(screenGrid.children.length===0) screenGrid.classList.add('hidden');
  const e = connections.get(peerId);
  if(e){ e.screenOn=false; e.screenStream=null; }
  renderParticipants();
}

function addMyScreenCard(){
  let card = document.getElementById('screen-mine');
  if(isScreenOn && screenStream){
    if(!card){
      card = document.createElement('div');
      card.id='screen-mine';
      card.className='screen-card';
      card.innerHTML=`<video autoplay playsinline muted></video><div class="label"><i class="fa-solid fa-display"></i> <span>صفحه تو (پیش‌نمایش)</span></div>`;
      screenGrid.prepend(card);
      screenGrid.classList.remove('hidden');
    }
    const v = card.querySelector('video');
    v.srcObject = screenStream;
    v.muted = true;
    v.play().catch(()=>{});
  } else {
    if(card) card.remove();
    if(screenGrid.children.length===0) screenGrid.classList.add('hidden');
  }
}

function renderParticipants(){
  participantsGrid.innerHTML='';
  memberList.innerHTML='';
  const meCard = document.createElement('div');
  meCard.className='p-card' + (speaking ? ' speaking':'');
  meCard.innerHTML=`
    <div class="avatar"><span>${myName.slice(0,1).toUpperCase()}</span></div>
    <h4>${myName} <span style="font-size:10px;background:var(--primary);color:white;padding:2px 6px;border-radius:999px">تو</span></h4>
    <p>${isScreenOn ? 'در حال اشتراک صفحه' : 'در ویس'}</p>
    <span class="badge ${isMicOn?'mic-on':'mic-off'}"><i class="fa-solid ${isMicOn?'fa-microphone':'fa-microphone-slash'}"></i> ${isMicOn?'روشن':'ساکت'}</span>
    ${isScreenOn?'<span class="badge screen-on"><i class="fa-solid fa-display"></i> صفحه</span>':''}
  `;
  participantsGrid.appendChild(meCard);
  const meLi = document.createElement('li');
  meLi.innerHTML=`<div class="m-avatar">${myName.slice(0,1).toUpperCase()}</div><div class="m-info"><b>${myName} (تو)</b><span>${isMicOn?'میک روشن':'میک بسته'}</span></div><span class="m-status ${isMicOn?'on':'off'}">${isMicOn?'●': '○'}</span>`;
  memberList.appendChild(meLi);
  connections.forEach((entry, pid)=>{
    const name = entry.name || pid.slice(0,8);
    const micOn = entry.micOn !== false;
    const hasScreen = !!entry.screenOn;
    const card = document.createElement('div');
    card.className='p-card';
    card.innerHTML=`
      <div class="avatar"><span>${name.slice(0,1).toUpperCase()}</span></div>
      <h4>${name}</h4>
      <p>${hasScreen?'اشتراک صفحه فعال':'در ویس'}</p>
      <span class="badge ${micOn?'mic-on':'mic-off'}"><i class="fa-solid ${micOn?'fa-microphone':'fa-microphone-slash'}"></i> ${micOn?'روشن':'ساکت'}</span>
      ${hasScreen?'<span class="badge screen-on"><i class="fa-solid fa-display"></i> صفحه</span>':''}
    `;
    participantsGrid.appendChild(card);
    const li = document.createElement('li');
    li.innerHTML=`<div class="m-avatar">${name.slice(0,1).toUpperCase()}</div><div class="m-info"><b>${name}</b><span>${micOn?'میک روشن':'میک بسته'}${hasScreen?' • صفحه':''}</span></div><span class="m-status ${micOn?'on':'off'}">${micOn?'●':'○'}</span>`;
    li.title = pid;
    li.style.cursor='pointer';
    li.onclick=()=> copyText(pid);
    memberList.appendChild(li);
  });
  updateCounts();
}

function handlePeerLeave(pid){
  const e = connections.get(pid);
  if(e){
    try{ e.conn && e.conn.close(); }catch{}
    try{ e.call && e.call.close(); }catch{}
    try{ e.screenCall && e.screenCall.close(); }catch{}
    try{ e.screenCallOut && e.screenCallOut.close(); }catch{}
    removeAudio(pid);
    removeScreenStream(pid);
    connections.delete(pid);
    addChatMessage(null, (e.name||pid.slice(0,8)) + ' خارج شد', false, true);
    renderParticipants();
  }
}

function addChatMessage(name, text, isMe=false, isSystem=false){
  if(chatBox.querySelector('.chat-empty')) chatBox.innerHTML='';
  const div = document.createElement('div');
  div.className='msg' + (isMe?' me':'') + (isSystem?' system':'');
  if(isSystem){
    div.style.background='transparent';
    div.style.border='1px dashed var(--border)';
    div.style.textAlign='center';
    div.style.color='var(--muted)';
    div.style.fontSize='11px';
    div.innerHTML = `<p>${text}</p>`;
  } else {
    const time = new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});
    div.innerHTML = `<b>${name}</b><p>${escapeHtml(text)}</p><small>${time}</small>`;
  }
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
function escapeHtml(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }

function broadcastUpdate(){
  connections.forEach(e=>{
    try{ e.conn && e.conn.open && e.conn.send({ t:'update', micOn:isMicOn, screenOn:isScreenOn, name:myName }); }catch{}
  });
}
function broadcastChat(text){
  connections.forEach(e=>{ try{ e.conn && e.conn.open && e.conn.send({ t:'chat', name:myName, text }); }catch{} });
}

createBtn.onclick = async ()=>{
  if(!displayNameInput.value.trim()){ displayNameInput.focus(); toast('اول نامت را وارد کن'); return; }
  const id = genId();
  roomInput.value = id;
  await enterRoom(id, true);
};
joinBtn.onclick = async ()=>{
  const id = roomInput.value.trim();
  if(!id){ toast('شناسه اتاق را وارد کن'); return; }
  if(!displayNameInput.value.trim()){ displayNameInput.focus(); toast('نام را وارد کن'); return; }
  await enterRoom(id, false);
};
quickCallBtn.onclick = ()=> doQuickCall();
quickPeerInput.addEventListener('keydown', e=>{ if(e.key==='Enter') doQuickCall(); });
function doQuickCall(){
  const pid = quickPeerInput.value.trim();
  if(!pid) return;
  connectToPeer(pid);
  quickPeerInput.value='';
  toast('در حال اتصال به '+pid.slice(0,12)+'...');
}

copyIdBtn.onclick = ()=> copyText(myIdText.textContent);
copyRoomBtn.onclick = ()=> copyText(roomIdDisplay.textContent);
shareBtn.onclick = async ()=>{
  const link = location.origin + location.pathname + '?room=' + encodeURIComponent(myIdText.textContent);
  if(navigator.share){
    try{ await navigator.share({ title:'دعوت به ویس‌روم', text:'بیا به ویس وصل شو', url:link }); }catch{}
  } else copyText(link);
};

micBtn.onclick = toggleMic;
function toggleMic(){
  isMicOn = !isMicOn;
  if(localStream) localStream.getAudioTracks().forEach(t=> t.enabled = isMicOn);
  else if(isMicOn) ensureMic();
  micBtn.classList.toggle('off', !isMicOn);
  micBtn.classList.toggle('on', isMicOn);
  micBtn.querySelector('span').textContent = isMicOn ? 'میکروفون روشن' : 'میکروفون بسته';
  micBtn.querySelector('i').className = isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
  broadcastUpdate(); renderParticipants();
  toast(isMicOn? 'میکروفون روشن':'میکروفون بسته');
}
deafenBtn.onclick = ()=>{
  isDeafened = !isDeafened;
  deafenBtn.classList.toggle('active', isDeafened);
  deafenBtn.querySelector('span').textContent = isDeafened ? 'صدا قطع' : 'صدا روشن';
  document.querySelectorAll('audio').forEach(a=> { a.muted = isDeafened; if(!isDeafened) a.play().catch(()=>{}); });
  toast(isDeafened ? 'صدای دیگران قطع شد' : 'صدای دیگران وصل شد');
};
screenBtn.onclick = toggleScreen;
async function toggleScreen(){
  if(isScreenOn){
    stopScreen();
  } else {
    try{
      // تلاش با صدا، اگر نشد فقط ویدیو
      try{
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video:{ displaySurface:'monitor' }, audio:true });
      }catch{
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:false });
      }
      console.log('screenStream', screenStream.getTracks());
      const vTracks = screenStream.getVideoTracks();
      if(!vTracks.length) throw new Error('no video track');
      isScreenOn = true;
      screenBtn.classList.add('active');
      screenBtn.querySelector('span').textContent='توقف اشتراک';
      addMyScreenCard();
      connections.forEach((_, pid)=>{
        try{
          const call = peer.call(pid, screenStream, { metadata:{ type:'screen' } });
          call.on('error', e=> console.error('screen call error',e));
          const entry = connections.get(pid);
          if(entry) entry.screenCallOut = call;
        }catch(e){ console.error(e); }
      });
      broadcastUpdate(); renderParticipants();
      toast('اشتراک صفحه شروع شد');
      if(supaEnabled && roomId) supaLogScreen(roomId, 'start');
      vTracks[0].onended = stopScreen;
      screenStream.getTracks().forEach(t=> t.onended = stopScreen);
    }catch(e){
      console.error('getDisplayMedia fail',e);
      toast('اشتراک صفحه لغو شد: '+(e.message||''));
    }
  }
}
function stopScreen(){
  isScreenOn=false;
  screenBtn.classList.remove('active');
  screenBtn.querySelector('span').textContent='اشتراک صفحه';
  if(screenStream){ screenStream.getTracks().forEach(t=> t.stop()); screenStream=null; }
  addMyScreenCard();
  connections.forEach(e=>{ try{ e.screenCallOut && e.screenCallOut.close(); }catch{} e.screenCallOut=null; });
  broadcastUpdate(); renderParticipants();
  if(supaEnabled && roomId) supaLogScreen(roomId, 'stop');
}

function sendChat(){
  const txt = chatInput.value.trim();
  if(!txt) return;
  addChatMessage(myName, txt, true);
  broadcastChat(txt);
  if(supaEnabled && roomId) supaSendMessage(roomId, txt);
  chatInput.value='';
}
chatSendBtn.onclick = sendChat;
chatInput.addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });

async function leaveRoom(){
  if(screenStream) stopScreen();
  if(localStream) { localStream.getTracks().forEach(t=> t.stop()); localStream=null; }
  connections.forEach((_,pid)=> handlePeerLeave(pid));
  connections.clear();
  if(peer){ try{ peer.destroy(); }catch{} peer=null; }
  room.classList.add('hidden');
  lobby.classList.remove('hidden');
  myIdBox.classList.add('hidden');
  roomId=null; myId=null;
  history.replaceState(null,'',location.pathname);
}
leaveBtn.onclick = leaveRoom;
endBtn.onclick = leaveRoom;

document.addEventListener('keydown', e=>{
  if(room.classList.contains('hidden')) return;
  if(e.key==='m' || e.key==='M' || e.key==='م'){ toggleMic(); }
  if(e.key==='s' || e.key==='S' || e.key==='س'){ toggleScreen(); }
});

helpBtn.onclick = (e)=>{ e.preventDefault(); helpModal.classList.remove('hidden'); };
closeHelp.onclick = ()=> helpModal.classList.add('hidden');
helpModal.onclick = (e)=>{ if(e.target===helpModal) helpModal.classList.add('hidden'); };

const savedName = localStorage.getItem('vr_name');
if(savedName) displayNameInput.value = savedName;
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
if(roomParam) roomInput.value = roomParam;
displayNameInput.addEventListener('input', ()=> localStorage.setItem('vr_name', displayNameInput.value));
window.addEventListener('beforeunload', e=>{
  if(!room.classList.contains('hidden')){ e.preventDefault(); e.returnValue=''; }
});

// دیباگ کمک: لاگ HTTPS
if(location.protocol!=='https:' && location.hostname!=='localhost' && location.hostname!=='127.0.0.1'){
  console.warn('getUserMedia needs HTTPS, current:', location.protocol);
}

