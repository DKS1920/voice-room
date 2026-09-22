-- Supabase SQL - کپی کن داخل SQL Editor و Run بزن
-- 1. برو به Supabase Dashboard -> SQL Editor -> New query

-- جدول کاربران
create table if not exists users (
  id text primary key,
  name text not null,
  created_at timestamp with time zone default now()
);

-- جدول اتاق‌ها
create table if not exists rooms (
  id text primary key,
  name text,
  created_by text references users(id),
  created_at timestamp with time zone default now()
);

-- عضویت
create table if not exists room_members (
  room_id text references rooms(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  joined_at timestamp with time zone default now(),
  primary key (room_id, user_id)
);

-- چت
create table if not exists messages (
  id text primary key,
  room_id text references rooms(id) on delete cascade,
  user_id text,
  user_name text,
  text text not null,
  created_at timestamp with time zone default now()
);

-- لاگ اسکرین
create table if not exists screen_logs (
  id text primary key,
  room_id text references rooms(id) on delete cascade,
  user_id text,
  user_name text,
  action text,
  created_at timestamp with time zone default now()
);

-- فعال کردن Realtime برای چت زنده
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_members;
alter publication supabase_realtime add table screen_logs;

-- دسترسی عمومی (برای تست ساده بدون لاگین)
alter table users enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table messages enable row level security;
alter table screen_logs enable row level security;

create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all rooms" on rooms for all using (true) with check (true);
create policy "allow all members" on room_members for all using (true) with check (true);
create policy "allow all messages" on messages for all using (true) with check (true);
create policy "allow all screen_logs" on screen_logs for all using (true) with check (true);
