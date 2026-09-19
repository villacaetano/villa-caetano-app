-- Villa Caetano Maintenance - Supabase database + security
-- Run this whole file once in Supabase -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'reporter' check (role in ('owner','property manager','caretaker','contractor','reporter')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  priority text not null default 'Normal',
  assigned_to text,
  due_date date,
  cost numeric(12,2) not null default 0,
  description text,
  status text not null default 'Open',
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  frequency text not null check (frequency in ('weekly','twice_monthly','monthly','quarterly','half_yearly','yearly')),
  next_due date not null,
  expected_cost numeric(12,2) not null default 0,
  assigned_to text,
  notes text,
  last_completed date,
  last_cost numeric(12,2),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  frequency text not null check (frequency in ('monthly','quarterly','yearly','other')),
  next_due date not null,
  expected_amount numeric(12,2) not null default 0,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  description text not null,
  category text not null,
  amount numeric(12,2) not null default 0,
  source_type text not null default 'one_off' check (source_type in ('issue','recurring_task','bill','one_off')),
  source_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('issue','recurring_task','bill','expense')),
  entity_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- First signed-up user becomes owner automatically. All later users start as reporter.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
begin
  select count(*) into user_count from public.profiles;
  insert into public.profiles(id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.email,
    case when user_count = 0 then 'owner' else 'reporter' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('owner','property manager')
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists issues_touch on public.issues;
create trigger issues_touch before update on public.issues for each row execute procedure public.touch_updated_at();
drop trigger if exists recurring_touch on public.recurring_tasks;
create trigger recurring_touch before update on public.recurring_tasks for each row execute procedure public.touch_updated_at();
drop trigger if exists bills_touch on public.bills;
create trigger bills_touch before update on public.bills for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.issues enable row level security;
alter table public.recurring_tasks enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.attachments enable row level security;

-- Profiles: signed-in users can see users; only admins can change roles.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_admin() and id <> auth.uid());

-- Issues: everyone signed in can view/create; only admins can edit/delete.
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues for select to authenticated using (true);
drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues for insert to authenticated with check (created_by = auth.uid());
drop policy if exists issues_update on public.issues;
create policy issues_update on public.issues for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists issues_delete on public.issues;
create policy issues_delete on public.issues for delete to authenticated using (public.is_admin());

-- Admin-managed financial/recurring data.
create policy recurring_select on public.recurring_tasks for select to authenticated using (true);
create policy recurring_insert on public.recurring_tasks for insert to authenticated with check (public.is_admin());
create policy recurring_update on public.recurring_tasks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy recurring_delete on public.recurring_tasks for delete to authenticated using (public.is_admin());

create policy bills_select on public.bills for select to authenticated using (true);
create policy bills_insert on public.bills for insert to authenticated with check (public.is_admin());
create policy bills_update on public.bills for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bills_delete on public.bills for delete to authenticated using (public.is_admin());

create policy expenses_select on public.expenses for select to authenticated using (true);
create policy expenses_insert on public.expenses for insert to authenticated with check (public.is_admin());
create policy expenses_update on public.expenses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_admin());

create policy attachments_select on public.attachments for select to authenticated using (true);
create policy attachments_insert on public.attachments for insert to authenticated with check (uploaded_by = auth.uid() or public.is_admin());
create policy attachments_delete on public.attachments for delete to authenticated using (uploaded_by = auth.uid() or public.is_admin());

-- Least-privilege Data API grants.
revoke all on table public.profiles, public.issues, public.recurring_tasks, public.bills, public.expenses, public.attachments from anon;
grant select, insert, update, delete on public.profiles, public.issues, public.recurring_tasks, public.bills, public.expenses, public.attachments to authenticated;

-- Storage bucket. Private bucket: files are served with signed URLs.
insert into storage.buckets (id, name, public)
values ('property-files', 'property-files', false)
on conflict (id) do update set public = false;

-- Storage security: authenticated users can upload/read; only uploader/admin can delete.
drop policy if exists property_files_select on storage.objects;
create policy property_files_select on storage.objects for select to authenticated using (bucket_id = 'property-files');
drop policy if exists property_files_insert on storage.objects;
create policy property_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'property-files');
drop policy if exists property_files_delete on storage.objects;
create policy property_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'property-files' and ((owner_id = auth.uid()::text) or public.is_admin())
);
