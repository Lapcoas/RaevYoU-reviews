-- =========================================================
-- RaevYoU — отзывы: настройка базы в Supabase
-- Вставьте весь файл в Supabase → SQL Editor → Run (один раз).
-- =========================================================

-- 1. Таблица отзывов.
--    token — секретный код автора (лежит только в его браузере),
--    по нему он может изменить свой отзыв. Наружу не отдаётся.
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  nick       text        not null check (char_length(nick) between 1 and 24),
  rating     smallint    not null check (rating between 1 and 5),
  body       text        not null default '' check (char_length(body) <= 500),
  token      text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- 2. Закрываем таблицу от прямого доступа: читать и писать можно
--    только через три функции ниже.
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

-- 3. Список отзывов (без token).
create or replace function public.get_reviews(p_limit int default 500)
returns table (
  id uuid, nick text, rating smallint, body text,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.nick, r.rating, r.body, r.created_at, r.updated_at
  from public.reviews r
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

-- 4. Новый отзыв.
create or replace function public.add_review(
  p_nick text, p_rating int, p_body text, p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'bad token';
  end if;

  insert into public.reviews (nick, rating, body, token)
  values (
    left(btrim(coalesce(p_nick, '')), 24),
    p_rating,
    left(btrim(coalesce(p_body, '')), 500),
    p_token
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- 5. Изменение отзыва — только с правильным token.
create or replace function public.edit_review(
  p_id uuid, p_token text, p_nick text, p_rating int, p_body text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reviews
     set nick       = left(btrim(coalesce(p_nick, '')), 24),
         rating     = p_rating,
         body       = left(btrim(coalesce(p_body, '')), 500),
         updated_at = now()
   where id = p_id
     and token = p_token;

  return found;
end;
$$;

-- 6. Права: сайт (роль anon) может вызывать только эти функции.
revoke all on function public.get_reviews(int)                          from public;
revoke all on function public.add_review(text, int, text, text)         from public;
revoke all on function public.edit_review(uuid, text, text, int, text)  from public;

grant execute on function public.get_reviews(int)                         to anon, authenticated;
grant execute on function public.add_review(text, int, text, text)        to anon, authenticated;
grant execute on function public.edit_review(uuid, text, text, int, text) to anon, authenticated;
