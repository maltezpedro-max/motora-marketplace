-- MOTORA v4: Private buyer enquiries and seller replies.
-- Run once in the Supabase SQL Editor before deploying the v4 website.
create table if not exists public.vehicle_enquiries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  seller_reply text check (seller_reply is null or char_length(btrim(seller_reply)) between 2 and 2000),
  created_at timestamptz not null default now(),
  replied_at timestamptz,
  constraint enquiry_not_to_self check (buyer_id <> seller_id)
);

create index if not exists vehicle_enquiries_buyer_idx on public.vehicle_enquiries(buyer_id,created_at desc);
create index if not exists vehicle_enquiries_seller_idx on public.vehicle_enquiries(seller_id,created_at desc);
alter table public.vehicle_enquiries enable row level security;

-- Never trust the seller_id supplied by a browser: derive it from the vehicle.
create or replace function public.motora_enquiry_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; listing_status text;
begin
  if tg_op = 'INSERT' then
    select v.seller_id,v.status into owner_id,listing_status
    from public.vehicles v where v.id = new.vehicle_id;
    if owner_id is null or listing_status <> 'published' then
      raise exception 'Only published vehicles can receive enquiries';
    end if;
    if new.buyer_id is distinct from auth.uid() or new.buyer_id = owner_id then
      raise exception 'Invalid buyer';
    end if;
    new.seller_id := owner_id;
    new.seller_reply := null;
    new.replied_at := null;
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    if auth.uid() is distinct from old.seller_id then
      raise exception 'Only the seller can reply';
    end if;
    if new.id is distinct from old.id or new.vehicle_id is distinct from old.vehicle_id
       or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
       or new.message is distinct from old.message or new.created_at is distinct from old.created_at then
      raise exception 'Enquiry details cannot be changed';
    end if;
    if new.seller_reply is null or char_length(btrim(new.seller_reply)) not between 2 and 2000 then
      raise exception 'Reply must contain 2 to 2000 characters';
    end if;
    new.replied_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists motora_enquiry_guard_trigger on public.vehicle_enquiries;
create trigger motora_enquiry_guard_trigger before insert or update on public.vehicle_enquiries
for each row execute function public.motora_enquiry_guard();

-- Ensure existing policies can be safely re-applied.
drop policy if exists "Participants can view enquiries" on public.vehicle_enquiries;
create policy "Participants can view enquiries" on public.vehicle_enquiries
for select to authenticated
using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

drop policy if exists "Buyers can enquire" on public.vehicle_enquiries;
create policy "Buyers can enquire" on public.vehicle_enquiries
for insert to authenticated
with check (buyer_id = (select auth.uid()) and exists (
  select 1 from public.vehicles v where v.id = vehicle_id and v.status = 'published' and v.seller_id <> (select auth.uid())
));

drop policy if exists "Sellers can reply" on public.vehicle_enquiries;
create policy "Sellers can reply" on public.vehicle_enquiries
for update to authenticated
using (seller_id = (select auth.uid()))
with check (seller_id = (select auth.uid()));

-- No public access or delete policy. Enquiries remain private to participants.
