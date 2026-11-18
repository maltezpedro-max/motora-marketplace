-- Run in MOTORA Supabase SQL Editor. Safe for the vehicles table created earlier.
alter table public.vehicles add column if not exists fuel text;
alter table public.vehicles add column if not exists gearbox text;
-- The public bucket is for non-sensitive car listing images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos','vehicle-photos',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=2097152, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "Vehicle owners can upload photos" on storage.objects
for insert to authenticated
with check (bucket_id='vehicle-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Vehicle owners can delete their photos" on storage.objects
for delete to authenticated
using (bucket_id='vehicle-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
