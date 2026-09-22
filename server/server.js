const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ===== API =====
app.post('/api/users', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'u-' + uuid().slice(0, 8);
  db.createUser(id, name);
  res.json({ id, name });
});

app.post('/api/rooms', (req, res) => {
  const { name, userId } = req.body;
  const id = 'v-' + uuid().slice(0, 4) + '-' + uuid().slice(0, 4);
  db.createRoom(id, name || id, userId);
  if (userId) db.addMember(id, userId);
  res.json({ id, name: name || id });
});

app.get('/api/rooms', (req, res) => {
  res.json(db.getRooms());
});

app.post('/api/rooms/:id/join', (req, res) => {
  const { userId } = req.body;
  const room = db.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'room not found' });
  db.addMember(req.params.id, userId);
  res.json(room);
});

app.get('/api/rooms/:id/members', (req, res) => {
  res.json(db.getMembers(req.params.id));
});

app.get('/api/rooms/:id/messages', (req, res) => {
  res.json(db.getMessages(req.params.id));
});

app.post('/api/rooms/:id/messages', (req, res) => {
  const { userId, userName, text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const msg = { id: uuid(), room_id: req.params.id, user_id: userId, user_name: userName, text, created_at: new Date().toISOString() };
  db.addMessage(msg);
  io.to(req.params.id).emit('chat', msg);
  res.json(msg);
});

app.get('/api/rooms/:id/screen-logs', (req, res) => {
  res.json(db.getScreenLogs(req.params.id));
});

app.get('/api/health', (req,res)=> res.json({ ok:true, time: new Date().toISOString() }));

// ===== Socket.io =====
io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userId, userName }) => {
    socket.join(roomId);
    socket.data = { roomId, userId, userName };
    db.addMember(roomId, userId);
    socket.to(roomId).emit('user-joined', { userId, userName, socketId: socket.id });
    io.in(roomId).fetchSockets().then(sockets => {
      const online = sockets.map(s => s.data);
      io.to(roomId).emit('online-list', online);
    });
  });

  socket.on('chat', ({ roomId, userId, userName, text }) => {
    const msg = { id: uuid(), room_id: roomId, user_id: userId, user_name: userName, text, created_at: new Date().toISOString() };
    db.addMessage(msg);
    io.to(roomId).emit('chat', msg);
  });

  socket.on('screen', ({ roomId, userId, userName, action }) => {
    const log = { id: uuid(), room_id: roomId, user_id: userId, user_name: userName, action, created_at: new Date().toISOString() };
    db.addScreenLog(log);
    io.to(roomId).emit('screen', { userId, userName, action, at: log.created_at });
  });

  socket.on('signal', ({ roomId, to, from, data }) => {
    if (to) io.to(to).emit('signal', { from, data });
    else socket.to(roomId).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    const { roomId, userId, userName } = socket.data || {};
    if (roomId) socket.to(roomId).emit('user-left', { userId, userName, socketId: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Voice DB Server on http://localhost:${PORT}`));
