# ویس‌روم — Voice + Screen Share + Database

**لینک سایت (GitHub Pages):** https://dks1920.github.io/voice-room/

## حالت‌ها
1. **استاتیک (فقط PeerJS)** - روی GitHub Pages بدون دیتابیس کار می‌کند (ویس + اسکرین)
2. **با دیتابیس (پیشنهادی)** - همه چیز روی DB ذخیره می‌شود

## دیتابیس - همه چیز ذخیره می‌شود
پوشه `server/` یک بک‌اند Node + Socket.io دارد:
- `users` - کاربران (id, name)
- `rooms` - اتاق‌ها
- `room_members` - عضویت
- `messages` - چت با تاریخچه کامل
- `screen_logs` - لاگ شروع/توقف اشتراک صفحه

دیتا در `server/data/*.json` به صورت فایل JSON ذخیره می‌شود (بدون نیاز به نصب SQLite، سازگار با همه هاست‌ها). برای مقیاس بالا می‌توانی به SQLite/Postgres سوییچ کنی.

### اجرای لوکال با دیتابیس
```bash
cd server
npm install
npm start
# باز کن: http://localhost:3000
# API: http://localhost:3000/api/health
```

### API
- `POST /api/users {name}` → ساخت کاربر
- `POST /api/rooms {name, userId}` → ساخت اتاق
- `GET /api/rooms` → لیست اتاق‌ها
- `POST /api/rooms/:id/join` → عضویت
- `GET /api/rooms/:id/members` → اعضا
- `GET /api/rooms/:id/messages` → تاریخچه چت
- `POST /api/rooms/:id/messages` → ارسال پیام
- `GET /api/rooms/:id/screen-logs` → لاگ اسکرین

### دیپلوی بک‌اند (برای اینکه DB آنلاین باشد)
GitHub Pages فقط فرانت را سرو می‌کند. برای DB آنلاین یکی را انتخاب کن:
- **Render.com (رایگان):** New Web Service → GitHub repo → Build: `npm install` (Root: server) → Start: `npm start`
- **Railway / Fly.io** مشابه

بعد از دیپلوی، آدرس بک‌اند را در `app.js` جایگزین کن (متغیر `API_BASE`).

## فرانت فعلی
`index.html` با PeerJS کار می‌کند و بدون بک‌اند هم ویس می‌دهد. اگر `server` روشن باشد، چت به صورت خودکار روی DB هم ذخیره می‌شود (Socket.io).
