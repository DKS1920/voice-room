// JSON File DB - بدون نیاز به SQLite native (سازگار با همه هاست‌ها)
// دیتا در پوشه data/ ذخیره می‌شود
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const files = {
  users: path.join(DATA_DIR, 'users.json'),
  rooms: path.join(DATA_DIR, 'rooms.json'),
  members: path.join(DATA_DIR, 'members.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  screen_logs: path.join(DATA_DIR, 'screen_logs.json'),
};

function load(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return []; }
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// init files
Object.values(files).forEach(f => { if (!fs.existsSync(f)) save(f, []); });

const db = {
  // users
  createUser: (id, name) => {
    const users = load(files.users);
    users.push({ id, name, created_at: new Date().toISOString() });
    save(files.users, users);
  },
  getUsers: () => load(files.users),

  // rooms
  createRoom: (id, name, created_by) => {
    const rooms = load(files.rooms);
    rooms.push({ id, name, created_by, created_at: new Date().toISOString() });
    save(files.rooms, rooms);
  },
  getRooms: () => load(files.rooms).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,50),
  getRoom: (id) => load(files.rooms).find(r=>r.id===id),

  // members
  addMember: (room_id, user_id) => {
    const members = load(files.members);
    if (members.find(m=>m.room_id===room_id && m.user_id===user_id)) return;
    members.push({ room_id, user_id, joined_at: new Date().toISOString() });
    save(files.members, members);
  },
  getMembers: (room_id) => {
    const members = load(files.members).filter(m=>m.room_id===room_id);
    const users = load(files.users);
    return members.map(m => {
      const u = users.find(x=>x.id===m.user_id);
      return { id: m.user_id, name: u?u.name:m.user_id, joined_at: m.joined_at };
    });
  },

  // messages
  addMessage: (msg) => {
    const msgs = load(files.messages);
    msgs.push(msg);
    save(files.messages, msgs);
  },
  getMessages: (room_id) => load(files.messages).filter(m=>m.room_id===room_id).slice(-200),

  // screen logs
  addScreenLog: (log) => {
    const logs = load(files.screen_logs);
    logs.push(log);
    save(files.screen_logs, logs);
  },
  getScreenLogs: (room_id) => load(files.screen_logs).filter(l=>l.room_id===room_id).slice(-100),
};

module.exports = db;
