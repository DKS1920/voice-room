// Voice Room — PeerJS Mesh + Screen Share
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

// state
let peer = null;
let myId = null;
let myName = 'مهمان';
let roomId = null;
let localStream = null;
let screenStream = null;
let isMicOn = true;
let isDeafened = false;
let isScreenOn = false;
const connections = new Map(); // peerId -> { conn, call, mediaCall, screenCall, name, micOn, screenOn }
let audioContext, analyser;
let speaking = false;

function genId(){
  return 'v-' + Math.random().toString(36).slice(2,6) + '-' + Math.random().toString(36).slice(2,6);
}
function toast(msg){
  toastGlobal.textContent = msg;
  toastGlobal.classList.add('show');
  setTimeout(()=>toastGlobal.classList.remove('show'),2200);
}
function showCopyToast(){
  copyToast.classList.add('show');
  setTimeout(()=>copyToast.classList.remove('show'),1400);
}
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); toast('کپی شد ✓'); showCopyToast(); }catch{ toast('کپی نشد، دستی کپی کن'); }
}
function getName(){ return displayNameInput.value.trim() || 'مهمان-' + Math.floor(Math.random()*900+100) }

function updateCounts(){
  const n = connections.size + 1;
  peerCount.textContent = n + ' نفر آنلاین';
  sideCount.textContent = n;
}

// Peer setup
async function ensureMic(){
  if(localStream) return localStream;
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
    isMicOn = true;
    setupAudioAnalyser(localStream);
    return localStream;
  }catch(e){
    toast('دسترسی میکروفون رد شد — بدون میک دسترسی ادامه می‌دهیم');
    // create empty audio track? continue without mic
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
  }catch{}
}

function initPeer(id){
  return new Promise((resolve,reject)=>{
    const p = new Peer(id, { debug: 1 });
    p.on('open', oid=> resolve(p));
    p.on('error', err=>{
      console.error(err);
      if(err.type==='unavailable-id'){ toast('این شناسه قبلاً استفاده شده — یکی دیگر بساز'); }
      else toast('خطا: '+ err.type);
    });
  });
}

async function enterRoom(id, isCreator){
  myName = getName();
  roomId = id;
  myId = id; // for creator, peer id == room id. For joiner, we generate unique id
  if(!isCreator){
    myId = id + '-' + Math.random().toString(36).slice(2,5);
  }
  // persist name
  localStorage.setItem('vr_name', myName);

  lobby.classList.add('hidden');
  room.classList.remove('hidden');
  roomIdDisplay.textContent = isCreator ? myId : id;
  myIdText.textContent = myId;
  myIdBox.classList.remove('hidden');
  history.replaceState(null,'','?room='+encodeURIComponent(isCreator?myId:id));

  await ensureMic();
  peer = await initPeer(myId);
  myIdText.textContent = peer.id;
  roomIdDisplay.textContent = isCreator ? peer.id : id;

  attachPeerHandlers();
  renderParticipants();
  updateCounts();

  if(!isCreator){
    // connect to room host
    await connectToPeer(id);
  }
  toast(isCreator ? 'اتاق ساخته شد — لینک را بفرست' : 'وصل شدی ✓');
}

function attachPeerHandlers(){
  peer.on('connection', conn=>{
    handleDataConnection(conn);
  });
  peer.on('call', async call=>{
    // incoming media call
    const peerId = call.peer;
    // answer with appropriate stream
    if(call.metadata && call.metadata.type==='screen'){
      // screen call — answer without stream, just receive
      call.answer();
      call.on('stream', stream=>{
        addScreenStream(peerId, stream, getPeerName(peerId));
      });
      // track
      if(!connections.has(peerId)) connections.set(peerId,{});
      const c = connections.get(peerId);
      c.screenCall = call;
      c.screenOn = true;
      call.on('close', ()=> removeScreenStream(peerId));
    } else {
      // voice call
      try{ await ensureMic(); }catch{}
      call.answer(localStream || undefined);
      handleMediaCall(call);
    }
    // if new peer, also connect data to exchange peers
    if(!connections.has(peerId) || !connections.get(peerId).conn){
      const dc = peer.connect(peerId, { reliable:true });
      handleDataConnection(dc);
    }
  });
  peer.on('disconnected', ()=>{ peer.reconnect(); });
  peer.on('close', ()=>{ toast('ارتباط قطع شد'); });
}

function handleDataConnection(conn){
  const peerId = conn.peer;
  if(!connections.has(peerId)) connections.set(peerId,{});
  const entry = connections.get(peerId);
  entry.conn = conn;
  entry.name = entry.name || peerId.slice(0,8);
  conn.on('open', ()=>{
    // handshake: send my info + peer list
    conn.send({ t:'hello', name: myName, micOn:isMicOn, screenOn:isScreenOn, peers: [...connections.keys(), peer.id] });
    conn.send({ t:'chat', system:true, text: myName + ' وارد شد' });
    // mesh: auto connect to peers that this new peer knows but we don't
    updateCounts(); renderParticipants();
  });
  conn.on('data', data=>{
    if(!data||!data.t) return;
    if(data.t==='hello'){
      entry.name = data.name || entry.name;
      entry.micOn = data.micOn;
      entry.screenOn = data.screenOn;
      // mesh discovery
      if(data.peers && Array.isArray(data.peers)){
        data.peers.forEach(pid=>{
          if(pid===peer.id) return;
          if(pid===peerId) return;
          if(connections.has(pid)) return;
          // connect to discovered peer
          connectToPeer(pid);
        });
      }
      renderParticipants();
    } else if(data.t==='update'){
      if('micOn' in data) entry.micOn = data.micOn;
      if('screenOn' in data) entry.screenOn = data.screenOn;
      if(data.name) entry.name = data.name;
      renderParticipants();
    } else if(data.t==='chat'){
      addChatMessage(data.name||entry.name, data.text, false, data.system);
    } else if(data.t==='peers'){
      data.list.forEach(pid=>{ if(pid!==peer.id && !connections.has(pid)) connectToPeer(pid); });
    }
  });
  conn.on('close', ()=>{ handlePeerLeave(peerId); });
  conn.on('error', ()=>{ handlePeerLeave(peerId); });
}

function handleMediaCall(call){
  const peerId = call.peer;
  if(!connections.has(peerId)) connections.set(peerId,{});
  const entry = connections.get(peerId);
  entry.call = call;
  call.on('stream', stream=>{
    entry.stream = stream;
    attachAudio(peerId, stream);
    renderParticipants();
  });
  call.on('close', ()=>{ removeAudio(peerId); });
  call.on('error', ()=>{ removeAudio(peerId); });
}

async function connectToPeer(peerId){
  if(!peer || !peerId || peerId===peer.id) return;
  if(connections.has(peerId) && connections.get(peerId).conn && connections.get(peerId).conn.open) return;
  // data
  const conn = peer.connect(peerId, { reliable:true });
  handleDataConnection(conn);
  // media
  await ensureMic();
  if(localStream){
    const call = peer.call(peerId, localStream, { metadata:{ type:'voice' } });
    handleMediaCall(call);
  } else {
    // call without stream? need at least empty, so skip?
    // create dummy: still call to signal presence
    const call = peer.call(peerId, undefined);
    if(call) handleMediaCall(call);
  }
  // if we are screen sharing, also call with screen
  if(screenStream){
    const sCall = peer.call(peerId, screenStream, { metadata:{ type:'screen' } });
    sCall.on('close', ()=>{});
    if(!connections.has(peerId)) connections.set(peerId,{});
    connections.get(peerId).screenCallOut = sCall;
  }
}

function getPeerName(pid){
  const e = connections.get(pid);
  return e?.name || pid.slice(0,8);
}

function attachAudio(peerId, stream){
  let el = document.getElementById('audio-'+peerId);
  if(!el){
    el = document.createElement('audio');
    el.id = 'audio-'+peerId;
    el.autoplay = true;
    el.playsInline = true;
    el.style.display='none';
    document.body.appendChild(el);
  }
  el.srcObject = stream;
  el.muted = isDeafened;
  el.play().catch(()=>{});
  // simple speaking detection for remote? use audio element volume?
}

function removeAudio(peerId){
  const el = document.getElementById('audio-'+peerId);
  if(el){ el.srcObject=null; el.remove(); }
}

function addScreenStream(peerId, stream, name){
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
  v.srcObject = stream;
  v.play().catch(()=>{});
  v.onloadedmetadata = ()=> v.play();
  stream.getTracks().forEach(t=> t.onended = ()=> removeScreenStream(peerId));
  const e = connections.get(peerId);
  if(e){ e.screenStream = stream; e.screenOn = true; }
  renderParticipants();
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
      card.innerHTML=`<video autoplay playsinline muted></video><div class="label"><i class="fa-solid fa-display"></i> <span>صفحه تو</span></div>`;
      screenGrid.prepend(card);
      screenGrid.classList.remove('hidden');
    }
    const v = card.querySelector('video');
    v.srcObject = screenStream;
    v.play().catch(()=>{});
  } else {
    if(card) card.remove();
    if(screenGrid.children.length===0) screenGrid.classList.add('hidden');
  }
}

function renderParticipants(){
  // main grid + member list
  participantsGrid.innerHTML='';
  memberList.innerHTML='';

  // me
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
    const micOn = entry.micOn !== false; // default true
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

// Actions
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
  micBtn.classList.toggle('off', !isMicOn);
  micBtn.classList.toggle('on', isMicOn);
  micBtn.querySelector('span').textContent = isMicOn ? 'میکروفون روشن' : 'میکروفون بسته';
  micBtn.querySelector('i').className = isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
  broadcastUpdate(); renderParticipants();
}
deafenBtn.onclick = ()=>{
  isDeafened = !isDeafened;
  deafenBtn.classList.toggle('active', isDeafened);
  deafenBtn.querySelector('span').textContent = isDeafened ? 'صدا قطع' : 'صدا روشن';
  document.querySelectorAll('audio').forEach(a=> a.muted = isDeafened);
  toast(isDeafened ? 'صدای دیگران قطع شد' : 'صدای دیگران وصل شد');
};
screenBtn.onclick = toggleScreen;
async function toggleScreen(){
  if(isScreenOn){
    stopScreen();
  } else {
    try{
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video:{ displaySurface:'monitor' }, audio:true });
      isScreenOn = true;
      screenBtn.classList.add('active');
      screenBtn.querySelector('span').textContent='توقف اشتراک';
      addMyScreenCard();
      // call all peers with screen
      connections.forEach((_, pid)=>{
        const call = peer.call(pid, screenStream, { metadata:{ type:'screen' } });
        const entry = connections.get(pid);
        if(entry) entry.screenCallOut = call;
      });
      broadcastUpdate(); renderParticipants();
      toast('اشتراک صفحه شروع شد');
      screenStream.getVideoTracks()[0].onended = stopScreen;
    }catch(e){
      toast('اشتراک صفحه لغو شد');
      console.error(e);
    }
  }
}
function stopScreen(){
  isScreenOn=false;
  screenBtn.classList.remove('active');
  screenBtn.querySelector('span').textContent='اشتراک صفحه';
  if(screenStream){ screenStream.getTracks().forEach(t=> t.stop()); screenStream=null; }
  addMyScreenCard();
  // close outgoing screen calls
  connections.forEach(e=>{ try{ e.screenCallOut && e.screenCallOut.close(); }catch{} e.screenCallOut=null; });
  broadcastUpdate(); renderParticipants();
}

function sendChat(){
  const txt = chatInput.value.trim();
  if(!txt) return;
  addChatMessage(myName, txt, true);
  broadcastChat(txt);
  chatInput.value='';
}
chatSendBtn.onclick = sendChat;
chatInput.addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });

async function leaveRoom(){
  if(screenStream) stopScreen();
  if(localStream) localStream.getTracks().forEach(t=> t.stop());
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

// keyboard shortcuts
document.addEventListener('keydown', e=>{
  if(room.classList.contains('hidden')) return;
  if(e.key==='m' || e.key==='M' || e.key==='م'){ toggleMic(); }
  if(e.key==='s' || e.key==='S' || e.key==='س'){ toggleScreen(); }
});

// help
helpBtn.onclick = (e)=>{ e.preventDefault(); helpModal.classList.remove('hidden'); };
closeHelp.onclick = ()=> helpModal.classList.add('hidden');
helpModal.onclick = (e)=>{ if(e.target===helpModal) helpModal.classList.add('hidden'); };

// auto-fill name & room from URL/localStorage
const savedName = localStorage.getItem('vr_name');
if(savedName) displayNameInput.value = savedName;
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
if(roomParam) roomInput.value = roomParam;

// persist name on change
displayNameInput.addEventListener('input', ()=> localStorage.setItem('vr_name', displayNameInput.value));

// warn before unload if in room
window.addEventListener('beforeunload', e=>{
  if(!room.classList.contains('hidden')){ e.preventDefault(); e.returnValue=''; }
});
