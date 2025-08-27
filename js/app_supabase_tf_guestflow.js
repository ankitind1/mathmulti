import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://nsbtkmmifzrlonbwguac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zYnRrbW1pZnpybG9uYndndWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyNjY3NzIsImV4cCI6MjA3MTg0Mjc3Mn0.NUu_PnxltH4noJ-5e0m6NwTbyzKMQBdC6kmNwVM9peI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const uid = (() => {
  let u = localStorage.getItem('fm_uid');
  if (!u) { u = crypto.randomUUID(); localStorage.setItem('fm_uid', u); }
  return u;
})();

function genRoomCode(len=6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out='';
  for (let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

let room = {
  code: '',
  isHost: false,
  me: { name: '' },
  duration: 30,
  difficulty: 'easy',
  seed: null,
  startAt: null,
  status: 'lobby',
  index: 0,
  score: 0,
  eliminated: false,
  channel: null,
  players: new Map()
};

function seededRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return x / 0xFFFFFFFF;
  };
}
function questionOperands(index, seed, difficulty) {
  const rng = seededRng(seed + index*2654435761);
  let min, max;
  if (difficulty === 'easy') { min=1; max=9; }
  else if (difficulty==='normal') { min=2; max=19; }
  else { min=10; max=50; }
  const a = Math.floor(rng()*(max-min+1))+min;
  const b = Math.floor(rng()*(max-min+1))+min;
  return { a,b, correct: a+b };
}
function statementAt(index, seed, difficulty) {
  const base = questionOperands(index, seed, difficulty);
  const rng = seededRng(seed ^ (index*1103515245));
  const isCorrect = rng() < 0.55;
  let shown = base.correct;
  if (!isCorrect) {
    const delta = [1,2,3][Math.floor(rng()*3)] * (rng()<0.5 ? -1 : 1);
    shown = base.correct + delta;
  }
  return { a: base.a, b: base.b, shown, isCorrect };
}
function fmtTime(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft/1000));
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${mm}:${ss}`;
}
function show(viewId) {
  for (const v of ['viewHome','viewLobby','viewGame','viewResults']) $(v).classList.add('hidden');
  $(viewId).classList.remove('hidden');
}

// Dialog
$('howLink').addEventListener('click', (e)=>{ e.preventDefault(); $('howDialog').showModal(); });
$('closeHowBtn').addEventListener('click', ()=> $('howDialog').close());

// Host-only creation (disabled for guests coming via ?room)
$('createRoomBtn').addEventListener('click', async ()=>{
  if ($('createRoomBtn').disabled) return;
  const name = $('hostName').value.trim();
  if (!name) return alert('Enter your name');
  const code = genRoomCode();
  room.code = code; room.isHost = true; room.me.name = name;
  room.duration = parseInt($('duration').value,10);
  room.difficulty = $('difficulty').value;
  await joinChannel(code);
  enterLobby();
});

// Guest join
$('joinRoomBtn').addEventListener('click', async ()=>{
  const name = $('joinName').value.trim();
  const code = $('joinCode').value.trim().toUpperCase();
  if (!name || code.length!==6) return alert('Enter name and valid code');
  room.code = code; room.isHost = false; room.me.name = name;
  await joinChannel(code);
  enterLobby();
});

async function joinChannel(code) {
  if (room.channel) await room.channel.unsubscribe();
  room.channel = supabase.channel(`room-${code}`, {
    config: { broadcast: { self: true }, presence: { key: uid } }
  });

  room.channel.on('presence', { event: 'sync' }, ()=>{
    const state = room.channel.presenceState();
    room.players.clear();
    Object.entries(state).forEach(([k, metas])=>{
      const m = metas[0];
      room.players.set(k, { name: m.name, score: m.score||0, eliminated: !!m.eliminated, present: true });
    });
    renderPlayerList();
  });

  room.channel.on('broadcast', { event: 'settings' }, ({payload})=>{
    room.duration = payload.duration;
    room.difficulty = payload.difficulty;
    syncLobbyControls();
  });
  room.channel.on('broadcast', { event: 'start' }, ({payload})=>{
    room.seed = payload.seed;
    room.startAt = payload.startAt;
    room.status = 'in_progress';
    startGame();
  });
  room.channel.on('broadcast', { event: 'score' }, ({payload})=>{
    const p = room.players.get(payload.uid) || { name: payload.name, present: true };
    p.score = payload.score; p.eliminated = payload.eliminated;
    room.players.set(payload.uid, p);
  });
  room.channel.on('broadcast', { event: 'ended' }, ()=>{ room.status='ended'; showResults(); });

  await room.channel.subscribe(async (status)=>{
    if (status==='SUBSCRIBED') {
      await room.channel.track({ name: room.me.name, score: 0, eliminated: false });
    }
  });
}

function enterLobby() {
  show('viewLobby');
  $('roomCodeLabel').textContent = room.code;
  new QRCode('qrWrap', { text: `${location.origin}${location.pathname}?room=${room.code}`, width: 128, height: 128 });
  $('startGameBtn').classList.toggle('hidden', !room.isHost);
  syncLobbyControls();
  $('lobbyDuration').onchange = ()=>{
    if (!room.isHost) return;
    room.duration = parseInt($('lobbyDuration').value,10);
    room.channel.send({ type: 'broadcast', event: 'settings', payload: { duration: room.duration, difficulty: room.difficulty }});
  };
  $('lobbyDifficulty').onchange = ()=>{
    if (!room.isHost) return;
    room.difficulty = $('lobbyDifficulty').value;
    room.channel.send({ type: 'broadcast', event: 'settings', payload: { duration: room.duration, difficulty: room.difficulty }});
  };
  $('startGameBtn').onclick = ()=>{
    if (!room.isHost) return;
    const seed = Math.floor(Math.random()*2**31);
    const startAt = Date.now() + 2500;
    room.channel.send({ type: 'broadcast', event: 'start', payload: { seed, startAt }});
  };
  renderPlayerList();
}

function syncLobbyControls() {
  $('lobbyDuration').value = String(room.duration);
  $('lobbyDifficulty').value = room.difficulty;
}

function renderPlayerList() {
  $('playerCount').textContent = room.players.size;
  $('playerList').innerHTML = Array.from(room.players.entries()).map(([k,p])=>{
    const hostStar = room.isHost && k===uid ? '⭐' : '';
    return `<li class="p-2 flex justify-between"><span>${p.name}${hostStar}</span><span class="text-sm text-slate-600">score ${p.score||0}</span></li>`;
  }).join('');
}

let rafId = null;
function startGame() {
  show('viewGame');
  room.index = 0; room.score = 0; room.eliminated = false;
  $('roomCodeLabelGame').textContent = room.code;
  $('meName').textContent = room.me.name;
  $('elimText').classList.add('hidden');
  $('scoreText').textContent = '0';
  $('indexText').textContent = '0';
  $('statusMsg').textContent = 'Get ready...';

  const tick = () => {
    const msLeft = (room.startAt + room.duration*1000) - Date.now();
    $('timeLeft').textContent = fmtTime(msLeft);
    if (msLeft <= 0) { finishGame(); return; }
    rafId = requestAnimationFrame(tick);
  };
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);

  const pre = room.startAt - Date.now();
  setTimeout(()=>{
    $('statusMsg').textContent = 'Go!';
    renderStatement();
    hookButtons();
  }, Math.max(0, pre-50));
}

function renderStatement() {
  const s = statementAt(room.index, room.seed, room.difficulty);
  $('questionBox').textContent = `${s.a} + ${s.b} = ${s.shown}`;
}

function hookButtons() {
  $('btnCorrect').onclick = ()=> submitTF(true);
  $('btnWrong').onclick = ()=> submitTF(false);
}

function submitTF(choseCorrect) {
  if (room.eliminated) return;
  const s = statementAt(room.index, room.seed, room.difficulty);
  const isRight = (choseCorrect === s.isCorrect);
  if (!isRight) { room.eliminated = true; $('elimText').classList.remove('hidden'); }
  else { room.score += 1; room.index += 1; }
  $('scoreText').textContent = String(room.score);
  $('indexText').textContent = String(room.index);
  broadcastScore();
  if (!room.eliminated) renderStatement();
}

function broadcastScore() {
  room.channel.send({ type: 'broadcast', event: 'score', payload: { uid, name: room.me.name, score: room.score, eliminated: room.eliminated }});
}

function finishGame() {
  if (rafId) cancelAnimationFrame(rafId);
  $('statusMsg').textContent = 'Time!';
  if (room.isHost) setTimeout(()=> room.channel.send({ type: 'broadcast', event: 'ended', payload: {} }), 1000);
}

function showResults() {
  show('viewResults');
  $('roomCodeLabelResults').textContent = room.code;
  const arr = Array.from(room.players.values()).map(p=>({ name: p.name, score: p.score||0, eliminated: !!p.eliminated })).sort((a,b)=> b.score - a.score);
  $('leaderboard').innerHTML = arr.map((p,i)=>{
    const rank = i+1;
    const badge = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
    const elim = p.eliminated ? ' • eliminated' : '';
    return `<li class="p-2 flex justify-between"><span>${rank}. ${p.name} ${badge}</span><span>score ${p.score}${elim}</span></li>`;
  }).join('');
  $('playAgainBtn').onclick = ()=>{ room.status='lobby'; show('viewLobby'); };
  $('newRoomBtn').onclick = ()=>{ location.href = location.pathname; };
}

// Auto-join mode: hide host creation if ?room is present
(function initFromUrl(){
  const params = new URLSearchParams(location.search);
  const code = params.get('room');
  if (code) {
    $('joinCode').value = code.toUpperCase();
    $('hostPanel').classList.add('hidden');
    $('createRoomBtn').disabled = True;  # disable safeguard
    $('guestHint').classList.remove('hidden');
  }
  show('viewHome');
})();
