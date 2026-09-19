-- Villa Caetano Property Management
-- Fresh Supabase project schema.
-- Run this entire file in Supabase SQL Editor.
-- Never put a service_role/secret key in the website.

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin
  create type public.app_role as enum ('owner','property_manager','caretaker','contractor','reporter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.issue_status as enum ('open','in_progress','waiting','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.priority_level as enum ('urgent','high','normal','low');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'reporter',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_active_idx on public.profiles(active);

-- ---------- ISSUES ----------
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Other',
  priority public.priority_level not null default 'normal',
  status public.issue_status not null default 'open',
  due_date date,
  estimated_cost numeric(12,2),
  actual_cost numeric(12,2),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_due_date_reasonable check (due_date is null or due_date >= date '2000-01-01'),
  constraint issue_costs_nonnegative check (
    (estimated_cost is null or estimated_cost >= 0) and
    (actual_cost is null or actual_cost >= 0)
  )
);

create index if not exists issues_status_idx on public.issues(status);
create index if not exists issues_priority_idx on public.issues(priority);
create index if not exists issues_due_date_idx on public.issues(due_date);
create index if not exists issues_created_at_idx on public.issues(created_at desc);

-- ---------- ISSUE ASSIGNMENTS ----------
create table if not exists public.issue_assignments (
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(issue_id,user_id)
);

create index if not exists issue_assignments_user_idx on public.issue_assignments(user_id);

-- ---------- RECURRING ----------
create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  task_name text not null,
  description text,
  category text not null default 'Other',
  frequency text not null check (frequency in ('weekly','twice_monthly','monthly','quarterly','half_yearly','yearly')),
  expected_cost numeric(12,2),
  last_completed date,
  last_actual_cost numeric(12,2),
  next_due date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_costs_nonnegative check (
    (expected_cost is null or expected_cost >= 0) and
    (last_actual_cost is null or last_actual_cost >= 0)
  )
);

create index if not exists recurring_next_due_idx on public.recurring_tasks(next_due);

-- ---------- BILLS ----------
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_name text not null,
  category text not null default 'Other',
  frequency text not null check (frequency in ('monthly','quarterly','yearly','other')),
  expected_amount numeric(12,2),
  next_due date,
  last_paid date,
  last_paid_amount numeric(12,2),
  status text not null default 'active' check(status in ('active','inactive')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_amounts_nonnegative check (
    (expected_amount is null or expected_amount >= 0) and
    (last_paid_amount is null or last_paid_amount >= 0)
  )
);

create index if not exists bills_next_due_idx on public.bills(next_due);
create index if not exists bills_status_idx on public.bills(status);

-- ---------- EXPENSES ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  description text not null,
  category text not null default 'Other',
  amount numeric(12,2) not null check(amount >= 0),
  source_type text not null default 'manual' check(source_type in ('manual','maintenance','recurring_task','bill')),
  source_id uuid,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses(date desc);
create index if not exists expenses_source_idx on public.expenses(source_type,source_id);

-- ---------- ATTACHMENTS ----------
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check(record_type in ('issue','recurring_task','bill','expense')),
  record_id uuid not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check(file_size > 0 and file_size <= 10485760),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists attachments_record_idx on public.attachments(record_type,record_id);
create index if not exists attachments_uploaded_by_idx on public.attachments(uploaded_by);

-- ---------- HELPER FUNCTIONS ----------
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('owner','property_manager'), false);
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,full_name,role,active)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    'reporter',
    true
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger touch_profiles before update on public.profiles for each row execute procedure public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_issues before update on public.issues for each row execute procedure public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_recurring before update on public.recurring_tasks for each row execute procedure public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_bills before update on public.bills for each row execute procedure public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_expenses before update on public.expenses for each row execute procedure public.touch_updated_at();
exception when duplicate_object then null; end $$;

create or replace function public.set_issue_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists issue_completed_at on public.issues;
create trigger issue_completed_at
before update on public.issues
for each row execute procedure public.set_issue_completed_at();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.issues enable row level security;
alter table public.issue_assignments enable row level security;
alter table public.recurring_tasks enable row level security;
alter table public.bills enable row level security;
alter table public.expenses enable row level security;
alter table public.attachments enable row level security;

-- Profiles
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated
using (true);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Issues
drop policy if exists issues_select_authenticated on public.issues;
create policy issues_select_authenticated on public.issues
for select to authenticated
using (true);

drop policy if exists issues_insert_authenticated on public.issues;
create policy issues_insert_authenticated on public.issues
for insert to authenticated
with check (
  public.current_user_role() in ('owner','property_manager','caretaker','reporter')
);

drop policy if exists issues_update_allowed on public.issues;
create policy issues_update_allowed on public.issues
for update to authenticated
using (
  public.current_user_role() in ('owner','property_manager')
  or (
    public.current_user_role() in ('caretaker','contractor')
    and exists (
      select 1 from public.issue_assignments ia
      where ia.issue_id = issues.id and ia.user_id = auth.uid()
    )
  )
  or (
    public.current_user_role() = 'reporter'
    and issues.created_by = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner','property_manager')
  or (
    public.current_user_role() in ('caretaker','contractor')
    and exists (
      select 1 from public.issue_assignments ia
      where ia.issue_id = issues.id and ia.user_id = auth.uid()
    )
  )
  or (
    public.current_user_role() = 'reporter'
    and issues.created_by = auth.uid()
  )
);

drop policy if exists issues_delete_admin on public.issues;
create policy issues_delete_admin on public.issues
for delete to authenticated
using (public.is_admin());

-- Issue assignments
drop policy if exists assignments_select_authenticated on public.issue_assignments;
create policy assignments_select_authenticated on public.issue_assignments
for select to authenticated using (true);

drop policy if exists assignments_insert_admin on public.issue_assignments;
create policy assignments_insert_admin on public.issue_assignments
for insert to authenticated
with check (public.is_admin());

drop policy if exists assignments_delete_admin on public.issue_assignments;
create policy assignments_delete_admin on public.issue_assignments
for delete to authenticated using (public.is_admin());

-- Recurring
drop policy if exists recurring_select_authenticated on public.recurring_tasks;
create policy recurring_select_authenticated on public.recurring_tasks
for select to authenticated using (true);

drop policy if exists recurring_insert_allowed on public.recurring_tasks;
create policy recurring_insert_allowed on public.recurring_tasks
for insert to authenticated
with check (public.current_user_role() in ('owner','property_manager','caretaker'));

drop policy if exists recurring_update_admin_or_caretaker on public.recurring_tasks;
create policy recurring_update_admin_or_caretaker on public.recurring_tasks
for update to authenticated
using (public.current_user_role() in ('owner','property_manager','caretaker'))
with check (public.current_user_role() in ('owner','property_manager','caretaker'));

drop policy if exists recurring_delete_admin on public.recurring_tasks;
create policy recurring_delete_admin on public.recurring_tasks
for delete to authenticated using (public.is_admin());

-- Bills
drop policy if exists bills_select_authenticated on public.bills;
create policy bills_select_authenticated on public.bills
for select to authenticated using (true);

drop policy if exists bills_insert_admin on public.bills;
create policy bills_insert_admin on public.bills
for insert to authenticated with check (public.is_admin());

drop policy if exists bills_update_admin on public.bills;
create policy bills_update_admin on public.bills
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists bills_delete_admin on public.bills;
create policy bills_delete_admin on public.bills
for delete to authenticated using (public.is_admin());

-- Expenses
drop policy if exists expenses_select_authenticated on public.expenses;
create policy expenses_select_authenticated on public.expenses
for select to authenticated using (true);

drop policy if exists expenses_insert_admin on public.expenses;
create policy expenses_insert_admin on public.expenses
for insert to authenticated with check (public.is_admin());

drop policy if exists expenses_update_admin on public.expenses;
create policy expenses_update_admin on public.expenses
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_delete_admin on public.expenses;
create policy expenses_delete_admin on public.expenses
for delete to authenticated using (public.is_admin());

-- Attachments
drop policy if exists attachments_select_authenticated on public.attachments;
create policy attachments_select_authenticated on public.attachments
for select to authenticated using (true);

drop policy if exists attachments_insert_authenticated on public.attachments;
create policy attachments_insert_authenticated on public.attachments
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.current_user_role() in ('owner','property_manager','caretaker','contractor','reporter')
);

drop policy if exists attachments_delete_admin on public.attachments;
create policy attachments_delete_admin on public.attachments
for delete to authenticated using (public.is_admin() or uploaded_by = auth.uid());

-- ---------- STORAGE ----------
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'property-attachments',
  'property-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists attachments_storage_select on storage.objects;
create policy attachments_storage_select on storage.objects
for select to authenticated
using (bucket_id = 'property-attachments');

drop policy if exists attachments_storage_insert on storage.objects;
create policy attachments_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists attachments_storage_delete on storage.objects;
create policy attachments_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- ---------- GRANTS ----------
grant usage on schema public to authenticated;
grant select,insert,update,delete on
  public.profiles,
  public.issues,
  public.issue_assignments,
  public.recurring_tasks,
  public.bills,
  public.expenses,
  public.attachments
to authenticated;

-- IMPORTANT FIRST-USER SETUP:
-- After creating/inviting your first user in Authentication → Users,
-- run ONE of these commands as the database owner in SQL Editor:
--
-- update public.profiles
-- set role = 'owner', full_name = 'Your Name'
-- where email = 'YOUR_EMAIL';
--
-- Then sign in normally.
