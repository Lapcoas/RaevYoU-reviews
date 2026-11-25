/* ============================================================
   RaevYoU — подключение к Supabase
   ------------------------------------------------------------
   Проект: «RaevYou review». Сайт работает через готовые функции
   базы get_reviews_v2 и add_review_v2 (таблицы напрямую закрыты).
   Ключ ниже — публичный (publishable), его безопасно держать в коде сайта.
   НИКОГДА не вставляйте сюда service_role key.
   ============================================================ */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://vlkwavhzujcrnrwoejyc.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_3xigkNqFMl6GdOTIQ6TXdg_9vuKclzz';

  /* ------------------------------------------------------------ */

  const PREVIEW = !!window.RAEV_PREVIEW;
  const BASE = SUPABASE_URL.replace(/\/+$/, '');
  const configured = /^https:\/\/.+/.test(BASE) && SUPABASE_ANON_KEY.length > 20;

  const fail = (code, message) => Object.assign(new Error(message || code), { code });

  function headers(extra) {
    const h = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    // Старые ключи (JWT) передаются и как Bearer. Новые sb_publishable_ — только в apikey.
    if (SUPABASE_ANON_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SUPABASE_ANON_KEY;
    return Object.assign(h, extra || {});
  }

  function normalize(r) {
    const rating = Number(r.rating);
    if (!(rating >= 1 && rating <= 5)) return null;
    const nick = r.author_name !== undefined ? r.author_name : (r.nick !== undefined ? r.nick : r.name);
    const anon = !!(r.legacy_is_anon !== undefined ? r.legacy_is_anon : (r.is_anon !== undefined ? r.is_anon : r.is_anonymous)) || !nick || nick === 'Аноним';
    const body = r.body !== undefined ? r.body : r.text;
    return {
      id: r.id,
      name: anon ? null : String(nick),
      anonymous: anon,
      rating: Math.round(rating),
      text: body ? String(body) : '',
      created_at: r.created_at,
      reply: r.reply || null,
      reply_admin_name: r.reply_admin_name || null
    };
  }

  /* ---------- Локальный демо-режим (только для предпросмотра) ---------- */
  const LS_KEY = 'raev_preview_reviews_v1';

  function demoSeed() {
    const day = 86400000, now = Date.now();
    const mk = (name, rating, text, ago) => ({
      id: 'demo-' + Math.random().toString(36).slice(2),
      name, is_anonymous: !name, rating, text,
      created_at: new Date(now - ago * day).toISOString()
    });
    return [
      mk('Демо · Алексей', 5, 'Пример отзыва. Всё отлично, быстро и честно.', 1),
      mk(null, 5, '', 2),
      mk('Демо · Мария', 4, 'Пример отзыва. Хорошая коммуникация, небольшая задержка по срокам.', 4),
      mk('Демо · Игорь', 5, 'Пример отзыва с длинным текстом, чтобы показать, как выглядит карточка с несколькими строками комментария.', 6),
      mk(null, 3, 'Пример анонимного отзыва.', 9)
    ];
  }
  function localRead() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const seed = demoSeed();
    localWrite(seed);
    return seed;
  }
  function localWrite(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  /* ---------- Unified Supabase API: admin_reviews + anonymous visitor auth ---------- */
  let sb = null;
  function client() {
    if (PREVIEW) return null;
    if (!window.supabase || !window.supabase.createClient) throw fail('sdk', 'Supabase SDK не загружен');
    if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'raev-review-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return sb;
  }

  async function ensureVisitor() {
    if (PREVIEW) return { id: 'preview-visitor' };
    const c = client();
    const { data: sessionData, error: sessionError } = await c.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData && sessionData.session && sessionData.session.user) return sessionData.session.user;
    const { data, error } = await c.auth.signInAnonymously();
    if (error) throw fail('auth', 'Не удалось создать анонимную сессию. Включите Anonymous Sign-Ins в Supabase Auth.');
    return data.user;
  }

  async function list() {
    if (PREVIEW) {
      await new Promise(r => setTimeout(r, 250));
      return localRead().map(normalize).filter(Boolean)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (!configured) throw fail('not_configured', 'Supabase не подключён');
    const { data, error } = await client().from('admin_reviews')
      .select('id,author_name,rating,body,reply,reply_admin_name,created_at,legacy_is_anon')
      .eq('status', 'published').order('created_at', { ascending: false }).limit(1000);
    if (error) throw fail('http', error.message || 'Ошибка загрузки отзывов');
    return (data || []).map(normalize).filter(Boolean);
  }

  async function mine() {
    if (PREVIEW) return null;
    const user = await ensureVisitor();
    const { data, error } = await client().from('admin_reviews')
      .select('id,author_name,rating,body,legacy_is_anon')
      .eq('author_id', user.id).maybeSingle();
    if (error) throw fail('mine', error.message || 'Не удалось проверить ваш отзыв');
    return data ? normalize(data) : null;
  }

  async function create(input) {
    const rating = Math.round(Number(input.rating));
    const anonymous = !!input.anonymous;
    const name = anonymous ? 'Аноним' : String(input.name || '').trim().slice(0, 40);
    const body = String(input.text || '').trim().slice(0, 1500);
    if (!(rating >= 1 && rating <= 5)) throw fail('invalid', 'Поставьте оценку');
    if (!anonymous && !name) throw fail('invalid', 'Введите имя или отметьте «анонимно»');
    if (!body) throw fail('invalid', 'Напишите текст отзыва');

    if (PREVIEW) {
      const arr = localRead();
      arr.push({ id: 'local-' + Date.now(), name: anonymous ? null : name, anonymous, rating, text: body, created_at: new Date().toISOString() });
      localWrite(arr);
      return { pending: false };
    }
    const user = await ensureVisitor();
    const { data: existing, error: lookupError } = await client().from('admin_reviews')
      .select('id').eq('author_id', user.id).maybeSingle();
    if (lookupError) throw fail('lookup', lookupError.message);
    if (existing) throw fail('already_exists', 'Вы уже оставили отзыв. Откройте редактирование своего отзыва.');
    const { error } = await client().from('admin_reviews').insert({
      author_id: user.id, author_name: name, rating, body, status: 'published'
    });
    if (error) {
      if (/one_review_per_user|duplicate key|unique/i.test(error.message || '')) throw fail('already_exists', 'Вы уже оставили отзыв. Измените существующий.');
      throw fail('insert', error.message || 'Не удалось отправить отзыв');
    }
    return { pending: false };
  }

  async function update(input) {
    const rating = Math.round(Number(input.rating));
    const anonymous = !!input.anonymous;
    const name = anonymous ? 'Аноним' : String(input.name || '').trim().slice(0, 40);
    const body = String(input.text || '').trim().slice(0, 1500);
    if (!(rating >= 1 && rating <= 5)) throw fail('invalid', 'Поставьте оценку');
    if (!anonymous && !name) throw fail('invalid', 'Введите имя или отметьте «анонимно»');
    if (!body) throw fail('invalid', 'Напишите текст отзыва');
    const user = await ensureVisitor();
    const { data, error } = await client().from('admin_reviews')
      .update({ author_name: name, rating, body })
      .eq('id', input.id).eq('author_id', user.id)
      .select('id').maybeSingle();
    if (error) throw fail('update', error.message || 'Не удалось сохранить изменения');
    if (!data) throw fail('not_owner', 'Не удалось найти ваш отзыв для редактирования');
    return { pending: false };
  }

  window.ReviewsAPI = { list, create, update, mine, client, ensureVisitor, configured, preview: PREVIEW };
})();
