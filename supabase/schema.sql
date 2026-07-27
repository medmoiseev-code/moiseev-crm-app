-- Схема подготовлена для будущего подключения общей облачной базы.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  stomx_id text unique,
  full_name text not null,
  phones jsonb not null default '[]'::jsonb,
  doctors jsonb not null default '[]'::jsonb,
  appointment_date date,
  doctor_comment text,
  next_action text,
  status text,
  admin_note text,
  urgent boolean not null default false,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  task_type text not null,
  title text not null,
  due_date date not null,
  assignee text,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  completed_at timestamptz,
  completed_by text
);

create index if not exists tasks_due_date_idx on public.tasks(due_date, status);
create index if not exists tasks_patient_idx on public.tasks(patient_id);

-- Учёт рабочего времени. Для production подключите Supabase Auth и ограничьте
-- доступ RLS-политиками по ролям; текущий выбор пользователя в браузере не является авторизацией.
create table if not exists public.work_shifts (
  id uuid primary key,
  user_id text not null,
  user_name text not null,
  work_date date not null,
  start_at timestamptz not null,
  end_at timestamptz,
  worked_minutes integer,
  status text not null check (status in ('active','completed','needs_review')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  started_offline boolean not null default false,
  ended_offline boolean not null default false,
  sync_status text not null default 'synchronized',
  device_id text,
  constraint one_active_shift_per_user exclude using gist (user_id with =)
    where (status = 'active')
);
create index if not exists work_shifts_user_date_idx on public.work_shifts(user_id, work_date);

create table if not exists public.work_time_correction_requests (
  id uuid primary key,
  shift_id uuid not null references public.work_shifts(id),
  requested_end_at timestamptz not null,
  reason text not null,
  requested_by text not null,
  requested_at timestamptz not null,
  status text not null check (status in ('pending','approved','rejected')),
  reviewed_by text,
  reviewed_at timestamptz
);

create table if not exists public.work_hourly_rates (
  user_id text primary key,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_time_audit (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.work_shifts(id),
  old_start_at timestamptz,
  old_end_at timestamptz,
  new_start_at timestamptz,
  new_end_at timestamptz,
  reason text not null,
  requested_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
