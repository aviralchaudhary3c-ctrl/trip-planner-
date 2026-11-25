-- Run in Supabase Dashboard → SQL Editor. Keep role changes admin-controlled.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'name','')) on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_tripmate on auth.users;
create trigger on_auth_user_created_tripmate after insert on auth.users for each row execute procedure public.create_profile_for_user();

create table if not exists public.destinations (
  id text primary key, name text not null, country text not null, tagline text not null,
  latitude double precision not null, longitude double precision not null,
  image_url text not null default '', description text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.hotels (
  id text primary key, name text not null, destination text not null, area text not null default '', rating numeric(2,1) not null default 0,
  price_per_night numeric(12,2) not null, currency text not null default 'INR', latitude double precision not null,
  longitude double precision not null, description text not null default '', provider text not null default 'demo', created_at timestamptz not null default now()
);
create table if not exists public.attractions (
  id text primary key, name text not null, destination text not null, category text not null default '',
  latitude double precision not null, longitude double precision not null, created_at timestamptz not null default now()
);
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 80), destination text not null, trip_date date not null, notes text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 80), amount numeric(12,2) not null check(amount > 0),
  category text not null default 'Other', expense_date date not null default current_date, created_at timestamptz not null default now()
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  hotel_id text not null references public.hotels(id), check_in date not null, check_out date not null check(check_out > check_in),
  guests int not null check(guests between 1 and 12), status text not null default 'demo-confirmed', provider text not null default 'demo',
  reference text not null unique, total numeric(12,2) not null, currency text not null default 'INR', created_at timestamptz not null default now()
);

-- TripMate's Express server checks each user and admin role before using this backend key.
grant select, insert, update, delete on table
  public.profiles, public.destinations, public.hotels, public.attractions,
  public.itineraries, public.expenses, public.bookings
to service_role;

alter table public.profiles enable row level security;
alter table public.destinations enable row level security;
alter table public.hotels enable row level security;
alter table public.attractions enable row level security;
alter table public.itineraries enable row level security;
alter table public.expenses enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Update own profile name" on public.profiles;
create policy "Update own profile name" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update(display_name) on public.profiles to authenticated;
drop policy if exists "Authenticated read destinations" on public.destinations;
create policy "Authenticated read destinations" on public.destinations for select to authenticated using (true);
drop policy if exists "Authenticated read hotels" on public.hotels;
create policy "Authenticated read hotels" on public.hotels for select to authenticated using (true);
drop policy if exists "Authenticated read attractions" on public.attractions;
create policy "Authenticated read attractions" on public.attractions for select to authenticated using (true);
drop policy if exists "Users manage own itineraries" on public.itineraries;
create policy "Users manage own itineraries" on public.itineraries for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users manage own expenses" on public.expenses;
create policy "Users manage own expenses" on public.expenses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users read own bookings" on public.bookings;
create policy "Users read own bookings" on public.bookings for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users create own demo bookings" on public.bookings;
create policy "Users create own demo bookings" on public.bookings for insert to authenticated with check (user_id = auth.uid() and provider = 'demo' and status = 'demo-confirmed');

-- Seed sample discovery data. Demo app also includes these records locally.
insert into public.destinations(id,name,country,tagline,latitude,longitude,image_url,description) values
('jaipur','Jaipur','India','Palaces, pink sandstone and lively bazaars',26.9124,75.7873,'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1000&q=85','Explore Rajasthan’s Pink City.'),
('kyoto','Kyoto','Japan','Quiet temples and timeless streets',35.0116,135.7681,'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000&q=85','Temple paths, historic lanes and gardens.'),
('lisbon','Lisbon','Portugal','Coastal light, tiled lanes and great food',38.7223,-9.1393,'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1000&q=85','Discover viewpoints and the Atlantic coast.')
on conflict(id) do nothing;
insert into public.hotels(id,name,destination,area,rating,price_per_night,currency,latitude,longitude,description) values
('h-jaipur-1','Hawa Mahal House','Jaipur','Old City',4.8,4200,'INR',26.9239,75.8267,'Boutique stay near Jaipur’s historic bazaars.'),
('h-jaipur-2','Amber Garden Stay','Jaipur','Amer',4.6,3600,'INR',26.9855,75.8513,'Courtyard stay close to Amber Fort.'),
('h-kyoto-1','Gion Lane Inn','Kyoto','Gion',4.9,12500,'INR',35.0037,135.7788,'Design-led inn in Gion.'),
('h-kyoto-2','Higashiyama Garden','Kyoto','Higashiyama',4.7,9800,'INR',34.9972,135.7808,'Guesthouse beside temple walks.'),
('h-lisbon-1','Alfama View Rooms','Lisbon','Alfama',4.7,8500,'INR',38.711,-9.129,'Sunny rooms in the old quarter.'),
('h-lisbon-2','Bairro Alto House','Lisbon','Bairro Alto',4.5,7900,'INR',38.713,-9.144,'Modern stay close to cafés and trams.') on conflict(id) do nothing;
insert into public.attractions(id,name,destination,category,latitude,longitude) values
('a-j1','Hawa Mahal','Jaipur','Landmark',26.9239,75.8267),('a-j2','Amber Fort','Jaipur','Historic site',27.1795,75.8398),('a-j3','City Palace','Jaipur','Museum',26.9258,75.8237),
('a-k1','Fushimi Inari Taisha','Kyoto','Shrine',34.9671,135.7727),('a-k2','Kiyomizu-dera','Kyoto','Temple',34.9949,135.785),('a-k3','Arashiyama Bamboo Grove','Kyoto','Nature',35.017,135.671),
('a-l1','Belém Tower','Lisbon','Landmark',38.6916,-9.216),('a-l2','São Jorge Castle','Lisbon','Historic site',38.7139,-9.1335),('a-l3','Praça do Comércio','Lisbon','Square',38.7076,-9.1365) on conflict(id) do nothing;

-- Promote a trusted account manually after creating it in Auth → Users:
-- update public.profiles set role='admin' where id='AUTH_USER_UUID';
