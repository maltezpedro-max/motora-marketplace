-- MOTORA integrated MVP upgrade. Run on the existing MOTORA Supabase project.
-- Does not delete existing users, vehicles or enquiries.

-- Additional statuses for moderation and completed sales.
alter table public.vehicles drop constraint if exists vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check check (status in ('pending','published','sold','rejected'));

-- Only administrators may assign administrator access. No browser policy permits inserts.
create table if not exists public.motora_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.motora_admins enable row level security;
drop policy if exists "Admins can see their membership" on public.motora_admins;
create policy "Admins can see their membership" on public.motora_admins for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.motora_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.motora_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.motora_is_admin() from public;
grant execute on function public.motora_is_admin() to authenticated;

-- Dealer accounts: any authenticated user may apply; only admins approve.
create table if not exists public.motora_dealers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  company_number text,
  website text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.motora_dealers enable row level security;
drop policy if exists "Dealer owners and admins view" on public.motora_dealers;
create policy "Dealer owners and admins view" on public.motora_dealers for select to authenticated
using (user_id = (select auth.uid()) or (select public.motora_is_admin()));
drop policy if exists "Users apply as dealers" on public.motora_dealers;
create policy "Users apply as dealers" on public.motora_dealers for insert to authenticated
with check (user_id = (select auth.uid()) and status='pending');
-- No update policy: an applicant cannot approve themselves.

-- Offers can only be created by approved dealers, on published cars owned by others.
create table if not exists public.motora_offers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  dealer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists motora_offers_seller_idx on public.motora_offers(seller_id,created_at desc);
create index if not exists motora_offers_dealer_idx on public.motora_offers(dealer_id,created_at desc);
alter table public.motora_offers enable row level security;
drop policy if exists "Offer participants can read" on public.motora_offers;
create policy "Offer participants can read" on public.motora_offers for select to authenticated
using (seller_id = (select auth.uid()) or dealer_id = (select auth.uid()) or (select public.motora_is_admin()));
drop policy if exists "Approved dealers can offer" on public.motora_offers;
create policy "Approved dealers can offer" on public.motora_offers for insert to authenticated
with check (dealer_id = (select auth.uid()) and status='open'
 and exists(select 1 from public.motora_dealers d where d.user_id=(select auth.uid()) and d.status='approved')
 and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.status='published' and v.seller_id<>(select auth.uid())));
-- No direct update policy. Decisions go through secured functions.
create or replace function public.motora_offer_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
 if tg_op='INSERT' then
   select v.seller_id into owner_id from public.vehicles v where v.id=new.vehicle_id and v.status='published';
   if owner_id is null or owner_id=new.dealer_id or new.dealer_id is distinct from auth.uid() then
     raise exception 'Invalid offer target';
   end if;
   if not exists(select 1 from public.motora_dealers d where d.user_id=new.dealer_id and d.status='approved') then
     raise exception 'Dealer account is not approved';
   end if;
   new.seller_id:=owner_id; new.status:='open'; new.decided_at:=null; new.created_at:=now();
 end if;
 return new;
end;
$$;
drop trigger if exists motora_offer_guard_trigger on public.motora_offers;
create trigger motora_offer_guard_trigger before insert on public.motora_offers
for each row execute function public.motora_offer_guard();

-- Seller decisions are explicitly authorised, not trusted from browser updates.
create or replace function public.motora_decide_offer(p_offer_id uuid,p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_decision not in ('accepted','declined') then raise exception 'Invalid decision'; end if;
 update public.motora_offers set status=p_decision,decided_at=now()
 where id=p_offer_id and seller_id=auth.uid() and status='open';
 if not found then raise exception 'Offer not found or cannot be decided'; end if;
end;
$$;
revoke all on function public.motora_decide_offer(uuid,text) from public;
grant execute on function public.motora_decide_offer(uuid,text) to authenticated;

create or replace function public.motora_mark_sold(p_vehicle_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.vehicles set status='sold' where id=p_vehicle_id and seller_id=auth.uid() and status='published';
 if not found then raise exception 'Only your published vehicle can be marked sold'; end if;
end;
$$;
revoke all on function public.motora_mark_sold(uuid) from public;
grant execute on function public.motora_mark_sold(uuid) to authenticated;

-- Admin moderation: only users manually added to motora_admins may call.
create or replace function public.motora_moderate_vehicle(p_vehicle_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.motora_is_admin() then raise exception 'Administrator access required'; end if;
 if p_status not in ('published','rejected','pending') then raise exception 'Invalid status'; end if;
 update public.vehicles set status=p_status where id=p_vehicle_id and status in ('pending','published','rejected');
 if not found then raise exception 'Listing not found or sold'; end if;
end;
$$;
revoke all on function public.motora_moderate_vehicle(uuid,text) from public;
grant execute on function public.motora_moderate_vehicle(uuid,text) to authenticated;

create or replace function public.motora_moderate_dealer(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.motora_is_admin() then raise exception 'Administrator access required'; end if;
 if p_status not in ('approved','rejected','pending') then raise exception 'Invalid status'; end if;
 update public.motora_dealers set status=p_status where user_id=p_user_id;
 if not found then raise exception 'Dealer application not found'; end if;
end;
$$;
revoke all on function public.motora_moderate_dealer(uuid,text) from public;
grant execute on function public.motora_moderate_dealer(uuid,text) to authenticated;

-- Admins must be able to read pending adverts, including those owned by other users.
drop policy if exists "Admins can view all vehicles" on public.vehicles;
create policy "Admins can view all vehicles" on public.vehicles for select to authenticated
using ((select public.motora_is_admin()));

-- Vehicle reports: users can flag adverts, admins can review reports.
create table if not exists public.motora_reports (
 id uuid primary key default gen_random_uuid(),
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 reporter_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check (char_length(btrim(reason)) between 10 and 1000),
 created_at timestamptz not null default now()
);
alter table public.motora_reports enable row level security;
drop policy if exists "Reporters and admins can read reports" on public.motora_reports;
create policy "Reporters and admins can read reports" on public.motora_reports for select to authenticated
using (reporter_id=(select auth.uid()) or (select public.motora_is_admin()));
drop policy if exists "Signed in users can report" on public.motora_reports;
create policy "Signed in users can report" on public.motora_reports for insert to authenticated
with check (reporter_id=(select auth.uid()) and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.status='published'));

-- IMPORTANT: manually grant YOUR user administrator access after running the upgrade:
-- 1. Supabase > Authentication > Users > copy your own User UID.
-- 2. Run: insert into public.motora_admins(user_id) values ('YOUR-USER-UUID-HERE');
-- Never put a service-role key or administrator credentials in browser JavaScript.
