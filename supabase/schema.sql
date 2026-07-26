-- Схема подготовлена для будущего подключения общей облачной базы.
create extension if not exists pgcrypto;

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
