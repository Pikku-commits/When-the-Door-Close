-- Run in Supabase SQL Editor once. Enable anonymous sign-ins first.
begin;
create table if not exists public.journal_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid(),
 pen text not null check (char_length(pen) between 1 and 80),
 chapter text not null check (char_length(chapter) between 1 and 100),
 title text not null check (char_length(title) between 1 and 200),
 words text not null check (char_length(words) between 1 and 20000),
 link text not null default '' check (char_length(link)<=2000 and (link='' or link ~ '^https?://')),
 media text not null default '' check (char_length(media)<=2800000 and (media='' or media ~ '^data:(image/(jpeg|png|webp|gif)|audio/[a-zA-Z0-9.+-]+|video/[a-zA-Z0-9.+-]+);base64,[A-Za-z0-9+/=]+$')),
 unlock date,
 created_at timestamptz not null default now()
);
create table if not exists public.journal_notes (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null references public.journal_entries(id) on delete cascade,
 owner_id uuid not null default auth.uid(),
 pen text not null check (char_length(pen) between 1 and 80),
 body text not null check (char_length(body) between 1 and 3000),
 created_at timestamptz not null default now()
);
alter table public.journal_entries enable row level security;
alter table public.journal_notes enable row level security;
revoke all on public.journal_entries, public.journal_notes from anon, authenticated;
grant select on public.journal_entries, public.journal_notes to anon, authenticated;
grant insert (id,pen,chapter,title,words,link,media,unlock) on public.journal_entries to authenticated;
grant update (pen,chapter,title,words,link,media,unlock) on public.journal_entries to authenticated;
grant delete on public.journal_entries to authenticated;
grant insert (entry_id,pen,body) on public.journal_notes to authenticated;
drop policy if exists journal_read on public.journal_entries;
create policy journal_read on public.journal_entries for select to anon,authenticated using (unlock is null or unlock <= (now() at time zone 'UTC')::date or owner_id=auth.uid());
drop policy if exists journal_insert on public.journal_entries;
create policy journal_insert on public.journal_entries for insert to authenticated with check (owner_id=auth.uid());
drop policy if exists journal_update on public.journal_entries;
create policy journal_update on public.journal_entries for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists journal_delete on public.journal_entries;
create policy journal_delete on public.journal_entries for delete to authenticated using (owner_id=auth.uid());
drop policy if exists notes_read on public.journal_notes;
create policy notes_read on public.journal_notes for select to anon,authenticated using (exists(select 1 from public.journal_entries e where e.id=entry_id and (e.unlock is null or e.unlock <= (now() at time zone 'UTC')::date)));
drop policy if exists notes_insert on public.journal_notes;
create policy notes_insert on public.journal_notes for insert to authenticated with check (owner_id=auth.uid() and exists(select 1 from public.journal_entries e where e.id=entry_id and (e.unlock is null or e.unlock <= (now() at time zone 'UTC')::date)));
create index if not exists journal_notes_entry_idx on public.journal_notes(entry_id);
commit;