# Voice Room - Backend (Node + SQLite + Socket.io)

## نصب و اجرا لوکال
```bash
cd server
npm install
npm start
# http://localhost:3000
```

## دیتابیس
فایل `voice.db` (SQLite) خودکار ساخته می‌شود با جدول‌ها:
- `users` - کاربران
- `rooms` - اتاق‌ها
- `room_members` - عضویت
- `messages` - چت (ذخیره دائمی)
- `screen_logs` - لاگ شروع/توقف اشتراک صفحه

## API
- `POST /api/users {name}` → ساخت کاربر
- `POST /api/rooms {name, userId}` → ساخت اتاق
- `GET /api/rooms` → لیست اتاق‌ها
- `POST /api/rooms/:id/join {userId}` → عضویت
- `GET /api/rooms/:id/messages` → تاریخچه چت
- `POST /api/rooms/:id/messages` → ارسال پیام

## Socket.io
- `join-room {roomId, userId, userName}`
- `chat {roomId, text}`
- `screen {action: 'start'|'stop'}`
- `signal` برای WebRTC

## دیپلوی
- Render.com: New Web Service → Build: `npm install` → Start: `npm start`
- Railway, Fly.io هم مشابه
