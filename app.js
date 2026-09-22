// Voice Room â€” Fixed PeerJS Mesh + Screen Share (ظˆغŒط³ + ط§ط³ع©ط±غŒظ† ط¨ط¯ظˆظ† ط³غŒط§ظ‡غŒ)
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
let myName = 'ظ…ظ‡ظ…ط§ظ†';
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

// ===== Supabase (ط§ع¯ط± ع©ط§ظ†ظپغŒع¯ ظ¾ط± ط¨ط§ط´ط¯طŒ DB ط§ط¨ط±غŒ ظپط¹ط§ظ„ ظ…غŒâ€Œط´ظˆط¯) =====
let supaClient = null;
let supaUserId = null;
let supaEnabled = false;
try{
  if(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_PROJECT') && typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY.includes('eyJ')){
    supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supaEnabled = true;
    console.log('âœ… Supabase enabled', SUPABASE_URL);
  } else {
    console.log('â„¹ï¸ڈ Supabase disabled - PeerJS only mode');
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
    if(m.user_id===supaUserId) return; // ط®ظˆط¯ظ… ظ‚ط¨ظ„ط§ظ‹ ط§ط¶ط§ظپظ‡ ع©ط±ط¯ظ…
    addChatMessage(m.user_name, m.text, false, false);
  }).subscribe();
}

function genId(){ return 'v-' + Math.random().toString(36).slice(2,6) + '-' + Math.random().toString(36).slice(2,6); }
function toast(msg){ toastGlobal.textContent = msg; toastGlobal.classList.add('show'); setTimeout(()=>toastGlobal.classList.remove('show'),2600); console.log('[toast]',msg); }
function showCopyToast(){ copyToast.classList.add('show'); setTimeout(()=>copyToast.classList.remove('show'),1400); }
async function copyText(t){ try{ await navigator.clipboard.writeText(t); toast('ع©ظ¾غŒ ط´ط¯ âœ“'); showCopyToast(); }catch{ toast('ع©ظ¾غŒ ظ†ط´ط¯طŒ ط¯ط³طھغŒ ع©ظ¾غŒ ع©ظ†: '+t); } }
function getName(){ return displayNameInput.value.trim() || 'ظ…ظ‡ظ…ط§ظ†-' + Math.floor(Math.random()*900+100) }
function updateCounts(){ const n = connections.size + 1; peerCount.textContent = n + ' ظ†ظپط± ط¢ظ†ظ„ط§غŒظ†'; sideCount.textContent = n; }

// unlock audio on first interaction (ط¨ط±ط§غŒ ط±ظپط¹ ط¨ظ„ط§ع© autoplay)
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
    localStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, sampleRate:48000 }, video:false });
    console.log('mic granted', localStream.getTracks());
    isMicOn = true;
    setupAudioAnalyser(localStream);
    // ط§ع¯ط± ظ‚ط¨ظ„ط§ظ‹ ط¨ظ‡ ع©ط³غŒ ظˆطµظ„ ط¨ظˆط¯غŒظ… ظˆظ„غŒ ط¨ط¯ظˆظ† ظ…غŒع©طŒ ط­ط§ظ„ط§ ط§ط³طھط±غŒظ… ط±ط§ ط¬ط§غŒع¯ط²غŒظ† ع©ظ† (renegotiate ط¨ط§ reconnect ط³ط§ط¯ظ‡)
    connections.forEach((entry,pid)=>{
      if(entry.call) {
        try{
          // ط¨ط±ط§غŒ ط³ط§ط¯ظ‡â€Œط³ط§ط²غŒ: طھظ…ط§ط³ ط¬ط¯غŒط¯ ط¨ط²ظ†
          const newCall = peer.call(pid, localStream, { metadata:{ type:'voice' } });
          handleMediaCall(newCall);
        }catch(e){ console.warn('re-call failed',e); }
      }
    });
    return localStream;
  }catch(e){
    console.error('mic error',e);
    toast('ط¯ط³طھط±ط³غŒ ظ…غŒع©ط±ظˆظپظˆظ† ط±ط¯ ط´ط¯ â€” ط±ظˆغŒ Allow ط¨ط²ظ† ظˆ ط±ظپط±ط´ ع©ظ†. ط¨ط¯ظˆظ† ظ…غŒع© طµط¯ط§طھ ظ†ظ…غŒط±ظ‡.');
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
          // TURN ط±ط§غŒع¯ط§ظ† ط¨ط±ط§غŒ ط¹ط¨ظˆط± ط§ط² NAT ط³ط®طھ
          { urls: 'turn:openrelay.metered.ca:80', username:'openrelayproject', credential:'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject' }
        ]
      }
    });
    p.on('open', oid=> { console.log('peer open',oid); resolve(p); });
    p.on('error', err=>{
      console.error('peer error',err);
      if(err.type==='unavailable-id'){ toast('ط§غŒظ† ط´ظ†ط§ط³ظ‡ ظ‚ط¨ظ„ط§ظ‹ ط§ط³طھظپط§ط¯ظ‡ ط´ط¯ظ‡ â€” غŒع©غŒ ط¯غŒع¯ط± ط¨ط³ط§ط²'); }
      else if(err.type==='peer-unavailable'){ toast('ط´ظ†ط§ط³ظ‡ غŒط§ظپطھ ظ†ط´ط¯ â€” ظ…ط·ظ…ط¦ظ† ط´ظˆ ط·ط±ظپ ظ…ظ‚ط§ط¨ظ„ ط§طھط§ظ‚ ط±ط§ ط³ط§ط®طھظ‡'); }
      else toast('ط®ط·ط§: '+ (err.message||err.type));
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
  // Supabase: ط°ط®غŒط±ظ‡ ع©ط§ط±ط¨ط± ظˆ ط§طھط§ظ‚ (ط§ع¯ط± ط¬ط¯ظˆظ„â€Œظ‡ط§ ط³ط§ط®طھظ‡ ظ†ط´ط¯ظ‡ ط¨ط§ط´ظ‡طŒ ع¯غŒط± ظ†ع©ظ†)
  if(supaEnabled){
    try{
      // طھط³طھ ط³ط±غŒط¹ ع©ظ‡ ط¬ط¯ظˆظ„ ظˆط¬ظˆط¯ ط¯ط§ط±ظ‡ غŒط§ ظ†ظ‡ - ط§ع¯ط± 404 طŒ ط؛غŒط±ظپط¹ط§ظ„ ع©ظ† ظˆ ط§ط¯ط§ظ…ظ‡ ط¨ط¯ظ‡
      const test = await Promise.race([
        supaClient.from('users').select('id').limit(1),
        new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), 2500))
      ]);
      if(test && test.error && test.error.code==='PGRST205'){
        console.warn('Supabase tables not created yet - running in PeerJS only mode');
        toast('âڑ ï¸ڈ ط¬ط¯ظˆظ„â€Œظ‡ط§غŒ Supabase ظ‡ظ†ظˆط² ط³ط§ط®طھظ‡ ظ†ط´ط¯ظ‡ â€” ظ„ط·ظپط§ظ‹ supabase.sql ط±ظˆ ط¯ط± SQL Editor ط§ط¬ط±ط§ ع©ظ† (ظپط¹ظ„ط§ظ‹ ط¨ط§ PeerJS ع©ط§ط± ظ…غŒâ€Œع©ظ†ظ‡)');
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
      // ط§ط¯ط§ظ…ظ‡ ط¨ط¯ظ‡ ط¨ط§ PeerJS
    }
  }
  // ظ…ظ‡ظ…: ظ‚ط¨ظ„ ط§ط² Peer ط­طھظ…ط§ ظ…غŒع© ط±ط§ ط¨ع¯غŒط± طھط§ طµط¯ط§ ظ‚ط·ط¹ ظ†ط¨ط§ط´ط¯
  await ensureMic();
  unlockAudio();
  peer = await initPeer(myId);
  myIdText.textContent = peer.id;
  roomIdDisplay.textContent = isCreator ? peer.id : id;
  attachPeerHandlers();
  renderParticipants();
  updateCounts();
  if(!isCreator){
    toast('ط¯ط± ط­ط§ظ„ ط§طھطµط§ظ„ ط¨ظ‡ '+id+' ...');
    await connectToPeer(id);
    setTimeout(()=>{
      if(connections.size===0) toast('ظˆطµظ„ ظ†ط´ط¯ â€” ظ…ط·ظ…ط¦ظ† ط´ظˆ ط³ط§ط²ظ†ط¯ظ‡ ط¢ظ†ظ„ط§غŒظ† ط§ط³طھ ظˆ ط´ظ†ط§ط³ظ‡ ط¯ط±ط³طھ ط§ط³طھ');
    }, 3500);
  } else {
    toast('ط§طھط§ظ‚ ط³ط§ط®طھظ‡ ط´ط¯ â€” ظ„غŒظ†ع© ط±ط§ ط¨ظپط±ط³طھ');
  }
}

function attachPeerHandlers(){
  peer.on('connection', conn=> handleDataConnection(conn));
  peer.on('call', async call=>{
    const peerId = call.peer;
    console.log('incoming call', peerId, call.metadata);
    if(call.metadata && call.metadata.type==='screen'){
      call.answer(); // ط¨ط¯ظˆظ† ط§ط³طھط±غŒظ…طŒ ظپظ‚ط· ط¯ط±غŒط§ظپطھ
      call.on('stream', stream=>{
        console.log('screen stream received', peerId, stream.getTracks());
        if(!stream.getVideoTracks().length) {
          console.warn('screen stream has no video track');
          toast('ط§ط³ع©ط±غŒظ† ط¨ط¯ظˆظ† ظˆغŒط¯غŒظˆ ط¯ط±غŒط§ظپطھ ط´ط¯');
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
    // ط§ع¯ط± ظ…ظ† ط¯ط± ط­ط§ظ„ ط§ط³ع©ط±غŒظ† ظ‡ط³طھظ…طŒ ط¨ظ‡ طھط§ط²ظ‡â€Œظˆط§ط±ط¯ ظ‡ظ… ط¨ظپط±ط³طھ (ط±ظپط¹ ط³غŒط§ظ‡غŒ ط¨ط±ط§غŒ ظˆط±ظˆط¯غŒ ط¬ط¯غŒط¯)
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
      // ط§ع¯ط± ط·ط±ظپ ظ…ظ‚ط§ط¨ظ„ ط¯ط± ط­ط§ظ„ ط§ط³ع©ط±غŒظ† ط§ط³طھ ظˆظ„غŒ ظ…ط§ ظ‡ظ†ظˆط² ط§ط³طھط±غŒظ… ظ†ط¯ط§ط±غŒظ…طŒ ع†غŒط²غŒ ظ†ظپط±ط³طھ â€” ط§ظˆ ط®ظˆط¯ط´ ط¨ط±ط§غŒ ظ…ط§ call ظ…غŒâ€Œط²ظ†ط¯ (ط¯ط± open ط®ظˆط¯ط´)
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
  // ط§ع¯ط± ع©ط§ظ„ ظ‚ط¨ظ„غŒ ط¨ظˆط¯ ط¨ط¨ظ†ط¯
  if(entry.call && entry.call !== call) { try{ entry.call.close(); }catch{} }
  entry.call = call;
  call.on('stream', stream=>{
    console.log('voice stream from',peerId, stream.getAudioTracks());
    entry.stream = stream;
    attachAudio(peerId, stream);
    renderParticipants();
    toast('ظˆغŒط³ '+getPeerName(peerId)+' ظˆطµظ„ ط´ط¯ âœ“');
    unlockAudio();
  });
  call.on('close', ()=>{ console.log('voice call close',peerId); removeAudio(peerId); });
  call.on('error', (e)=>{ console.error('voice call error',peerId,e); toast('ط®ط·ط§غŒ ظˆغŒط³ ط¨ط§ '+getPeerName(peerId)); removeAudio(peerId); });
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
  // ع©ظ…غŒ طµط¨ط± ط¨ط±ط§غŒ open ط´ط¯ظ† data ظ‚ط¨ظ„ ط§ط² call
  await new Promise(r=> setTimeout(r, 300));
  if(localStream){
    try{
      const call = peer.call(peerId, localStream, { metadata:{ type:'voice' } });
      if(call) handleMediaCall(call);
      else console.warn('peer.call returned null',peerId);
    }catch(e){ console.error('call failed',e); toast('طھظ…ط§ط³ طµظˆطھغŒ ط¨ط±ظ‚ط±ط§ط± ظ†ط´ط¯'); }
  } else {
    console.warn('no localStream, skipping voice call');
    toast('ظ…غŒع©ط±ظˆظپظˆظ† ظ†ط¯ط§ط±غŒ â€” طµط¯ط§طھ ظ†ظ…غŒط±ظ‡طŒ ظˆظ„غŒ طµط¯ط§غŒ ط¨ظ‚غŒظ‡ ط±ط§ ظ…غŒâ€Œط´ظ†ظˆغŒ');
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
  // ط¨ط±ط§غŒ ط¯غŒط¨ط§ع¯: ط§ع¯ط± ط§ط³طھط±غŒظ… ط¨غŒâ€Œطµط¯ط§ ط¨ظˆط¯
  const tracks = stream.getAudioTracks();
  console.log('attachAudio',peerId,'tracks',tracks.map(t=> `${t.label} enabled=${t.enabled} muted=${t.muted}`));
  if(tracks.length===0) toast('طµط¯ط§غŒغŒ ط§ط² '+getPeerName(peerId)+' ط¯ط±غŒط§ظپطھ ظ†ط´ط¯ (ظ…غŒع© ط§ظˆ ط®ط§ظ…ظˆط´ ط§ط³طھ)');
  // طھظ„ط§ط´ ط¨ط±ط§غŒ ظ¾ط®ط´
  const playPromise = el.play();
  if(playPromise) playPromise.then(()=> console.log('audio play ok',peerId)).catch(e=>{
    console.warn('audio play blocked',e);
    toast('ط¨ط±ط§غŒ ط´ظ†غŒط¯ظ† طµط¯ط§ غŒع© ط¨ط§ط± ط±ظˆغŒ طµظپط­ظ‡ ع©ظ„غŒع© ع©ظ†');
    // ظ…ظ†طھط¸ط± ع©ظ„غŒع© ط¨ظ…ط§ظ†
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
  card.querySelector('span').textContent = name + ' â€” ط§ط´طھط±ط§ع© طµظپط­ظ‡';
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
      toast('ط¨ط±ط§غŒ ط¯غŒط¯ظ† ط§ط³ع©ط±غŒظ† غŒع© ط¨ط§ط± ع©ظ„غŒع© ع©ظ†');
    });
  };
  // ط§ع¯ط± ظ‚ط¨ظ„ط§ظ‹ metadata ظ„ظˆط¯ ط´ط¯ظ‡ ط¨ظˆط¯
  if(v.readyState >= 1) v.play().catch(()=>{});
  // ط¯ط± طµظˆط±طھ ط³غŒط§ظ‡ ط¨ظˆط¯ظ†طŒ ظ„ط§ع¯ طھط±ع©â€Œظ‡ط§
  const vTracks = stream.getVideoTracks();
  console.log('screen video tracks', vTracks.map(t=> `${t.label} readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
  if(vTracks.length===0) toast('ط§ط³ع©ط±غŒظ† ط¨ط¯ظˆظ† طھطµظˆغŒط± ط¯ط±غŒط§ظپطھ ط´ط¯');
  // ط§ع¯ط± طھط±ع© ended ط´ط¯ ط­ط°ظپ ع©ظ†
  stream.getTracks().forEach(t=> t.onended = ()=> { console.log('screen track ended',peerId); removeScreenStream(peerId); });
  vTracks.forEach(t=> t.onmute = ()=> console.log('track mute',peerId));
  vTracks.forEach(t=> t.onunmute = ()=> console.log('track unmute',peerId));

  const e = connections.get(peerId);
  if(e){ e.screenStream = stream; e.screenOn = true; }
  renderParticipants();
  // ط±ظپط¹ ط³غŒط§ظ‡غŒ ط¨ط§ ع©ظ…غŒ طھط§ط®غŒط±: ط¨ط¹ط¶غŒ ظ…ط±ظˆط±ع¯ط±ظ‡ط§ ط§ظˆظ„ ط³غŒط§ظ‡ ظ…غŒâ€Œظ…ظˆظ†ظ†
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
      card.innerHTML=`<video autoplay playsinline muted></video><div class="label"><i class="fa-solid fa-display"></i> <span>طµظپط­ظ‡ طھظˆ (ظ¾غŒط´â€Œظ†ظ…ط§غŒط´)</span></div>`;
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
    <h4>${myName} <span style="font-size:10px;background:var(--primary);color:white;padding:2px 6px;border-radius:999px">طھظˆ</span></h4>
    <p>${isScreenOn ? 'ط¯ط± ط­ط§ظ„ ط§ط´طھط±ط§ع© طµظپط­ظ‡' : 'ط¯ط± ظˆغŒط³'}</p>
    <span class="badge ${isMicOn?'mic-on':'mic-off'}"><i class="fa-solid ${isMicOn?'fa-microphone':'fa-microphone-slash'}"></i> ${isMicOn?'ط±ظˆط´ظ†':'ط³ط§ع©طھ'}</span>
    ${isScreenOn?'<span class="badge screen-on"><i class="fa-solid fa-display"></i> طµظپط­ظ‡</span>':''}
  `;
  participantsGrid.appendChild(meCard);
  const meLi = document.createElement('li');
  meLi.innerHTML=`<div class="m-avatar">${myName.slice(0,1).toUpperCase()}</div><div class="m-info"><b>${myName} (طھظˆ)</b><span>${isMicOn?'ظ…غŒع© ط±ظˆط´ظ†':'ظ…غŒع© ط¨ط³طھظ‡'}</span></div><span class="m-status ${isMicOn?'on':'off'}">${isMicOn?'â—ڈ': 'â—‹'}</span>`;
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
      <p>${hasScreen?'ط§ط´طھط±ط§ع© طµظپط­ظ‡ ظپط¹ط§ظ„':'ط¯ط± ظˆغŒط³'}</p>
      <span class="badge ${micOn?'mic-on':'mic-off'}"><i class="fa-solid ${micOn?'fa-microphone':'fa-microphone-slash'}"></i> ${micOn?'ط±ظˆط´ظ†':'ط³ط§ع©طھ'}</span>
      ${hasScreen?'<span class="badge screen-on"><i class="fa-solid fa-display"></i> طµظپط­ظ‡</span>':''}
    `;
    participantsGrid.appendChild(card);
    const li = document.createElement('li');
    li.innerHTML=`<div class="m-avatar">${name.slice(0,1).toUpperCase()}</div><div class="m-info"><b>${name}</b><span>${micOn?'ظ…غŒع© ط±ظˆط´ظ†':'ظ…غŒع© ط¨ط³طھظ‡'}${hasScreen?' â€¢ طµظپط­ظ‡':''}</span></div><span class="m-status ${micOn?'on':'off'}">${micOn?'â—ڈ':'â—‹'}</span>`;
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
    addChatMessage(null, (e.name||pid.slice(0,8)) + ' ط®ط§ط±ط¬ ط´ط¯', false, true);
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
  if(!displayNameInput.value.trim()){ displayNameInput.focus(); toast('ط§ظˆظ„ ظ†ط§ظ…طھ ط±ط§ ظˆط§ط±ط¯ ع©ظ†'); return; }
  const id = genId();
  roomInput.value = id;
  await enterRoom(id, true);
};
joinBtn.onclick = async ()=>{
  const id = roomInput.value.trim();
  if(!id){ toast('ط´ظ†ط§ط³ظ‡ ط§طھط§ظ‚ ط±ط§ ظˆط§ط±ط¯ ع©ظ†'); return; }
  if(!displayNameInput.value.trim()){ displayNameInput.focus(); toast('ظ†ط§ظ… ط±ط§ ظˆط§ط±ط¯ ع©ظ†'); return; }
  await enterRoom(id, false);
};
quickCallBtn.onclick = ()=> doQuickCall();
quickPeerInput.addEventListener('keydown', e=>{ if(e.key==='Enter') doQuickCall(); });
function doQuickCall(){
  const pid = quickPeerInput.value.trim();
  if(!pid) return;
  connectToPeer(pid);
  quickPeerInput.value='';
  toast('ط¯ط± ط­ط§ظ„ ط§طھطµط§ظ„ ط¨ظ‡ '+pid.slice(0,12)+'...');
}

copyIdBtn.onclick = ()=> copyText(myIdText.textContent);
copyRoomBtn.onclick = ()=> copyText(roomIdDisplay.textContent);
shareBtn.onclick = async ()=>{
  const link = location.origin + location.pathname + '?room=' + encodeURIComponent(myIdText.textContent);
  if(navigator.share){
    try{ await navigator.share({ title:'ط¯ط¹ظˆطھ ط¨ظ‡ ظˆغŒط³â€Œط±ظˆظ…', text:'ط¨غŒط§ ط¨ظ‡ ظˆغŒط³ ظˆطµظ„ ط´ظˆ', url:link }); }catch{}
  } else copyText(link);
};

micBtn.onclick = toggleMic;
function toggleMic(){
  isMicOn = !isMicOn;
  if(localStream) localStream.getAudioTracks().forEach(t=> t.enabled = isMicOn);
  else if(isMicOn) ensureMic();
  micBtn.classList.toggle('off', !isMicOn);
  micBtn.classList.toggle('on', isMicOn);
  micBtn.querySelector('span').textContent = isMicOn ? 'ظ…غŒع©ط±ظˆظپظˆظ† ط±ظˆط´ظ†' : 'ظ…غŒع©ط±ظˆظپظˆظ† ط¨ط³طھظ‡';
  micBtn.querySelector('i').className = isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
  broadcastUpdate(); renderParticipants();
  toast(isMicOn? 'ظ…غŒع©ط±ظˆظپظˆظ† ط±ظˆط´ظ†':'ظ…غŒع©ط±ظˆظپظˆظ† ط¨ط³طھظ‡');
}
deafenBtn.onclick = ()=>{
  isDeafened = !isDeafened;
  deafenBtn.classList.toggle('active', isDeafened);
  deafenBtn.querySelector('span').textContent = isDeafened ? 'طµط¯ط§ ظ‚ط·ط¹' : 'طµط¯ط§ ط±ظˆط´ظ†';
  document.querySelectorAll('audio').forEach(a=> { a.muted = isDeafened; if(!isDeafened) a.play().catch(()=>{}); });
  toast(isDeafened ? 'طµط¯ط§غŒ ط¯غŒع¯ط±ط§ظ† ظ‚ط·ط¹ ط´ط¯' : 'طµط¯ط§غŒ ط¯غŒع¯ط±ط§ظ† ظˆطµظ„ ط´ط¯');
};
screenBtn.onclick = toggleScreen;
async function toggleScreen(){
  if(isScreenOn){
    stopScreen();
  } else {
    try{
      // طھظ„ط§ط´ ط¨ط§ طµط¯ط§طŒ ط§ع¯ط± ظ†ط´ط¯ ظپظ‚ط· ظˆغŒط¯غŒظˆ
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
      screenBtn.querySelector('span').textContent='طھظˆظ‚ظپ ط§ط´طھط±ط§ع©';
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
      toast('ط§ط´طھط±ط§ع© طµظپط­ظ‡ ط´ط±ظˆط¹ ط´ط¯');
      if(supaEnabled && roomId) supaLogScreen(roomId, 'start');
      vTracks[0].onended = stopScreen;
      screenStream.getTracks().forEach(t=> t.onended = stopScreen);
    }catch(e){
      console.error('getDisplayMedia fail',e);
      toast('ط§ط´طھط±ط§ع© طµظپط­ظ‡ ظ„ط؛ظˆ ط´ط¯: '+(e.message||''));
    }
  }
}
function stopScreen(){
  isScreenOn=false;
  screenBtn.classList.remove('active');
  screenBtn.querySelector('span').textContent='ط§ط´طھط±ط§ع© طµظپط­ظ‡';
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
  if(e.key==='m' || e.key==='M' || e.key==='ظ…'){ toggleMic(); }
  if(e.key==='s' || e.key==='S' || e.key==='ط³'){ toggleScreen(); }
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

// ط¯غŒط¨ط§ع¯ ع©ظ…ع©: ظ„ط§ع¯ HTTPS
if(location.protocol!=='https:' && location.hostname!=='localhost' && location.hostname!=='127.0.0.1'){
  console.warn('getUserMedia needs HTTPS, current:', location.protocol);
}

