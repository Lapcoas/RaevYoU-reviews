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
    const nick = r.nick !== undefined ? r.nick : r.name;
    const anon = !!(r.is_anon !== undefined ? r.is_anon : r.is_anonymous) || !nick;
    const body = r.body !== undefined ? r.body : r.text;
    return {
      id: r.id,
      name: anon ? null : String(nick),
      anonymous: anon,
      rating: Math.round(rating),
      text: body ? String(body) : '',
      created_at: r.created_at
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

  /* ---------- Публичный API ---------- */
  async function list() {
    if (PREVIEW) {
      await new Promise(r => setTimeout(r, 450));
      return localRead().map(normalize).filter(Boolean)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (!configured) throw fail('not_configured', 'Supabase не подключён');

    let res;
    try {
      res = await fetch(BASE + '/rest/v1/rpc/get_reviews_v2', {
        method: 'POST', headers: headers(), body: JSON.stringify({ p_limit: 1000 })
      });
    } catch (e) { throw fail('network', 'Нет соединения с сервером'); }
    if (!res.ok) throw fail('http', 'Ошибка загрузки: ' + res.status);
    const data = await res.json();
    return data.map(normalize).filter(Boolean);
  }

  async function create(input) {
    const rating = Math.round(Number(input.rating));
    const anonymous = !!input.anonymous;
    const name = anonymous ? null : String(input.name || '').trim().slice(0, 24);
    const text = String(input.text || '').trim().slice(0, 500);

    if (!(rating >= 1 && rating <= 5)) throw fail('invalid', 'Поставьте оценку');
    if (!anonymous && !name) throw fail('invalid', 'Введите имя или отметьте «анонимно»');

    const row = { name, rating, text: text || null, is_anonymous: anonymous };

    if (PREVIEW) {
      await new Promise(r => setTimeout(r, 600));
      const arr = localRead();
      arr.push(Object.assign({ id: 'local-' + Date.now(), created_at: new Date().toISOString() }, row));
      localWrite(arr);
      return { pending: false };
    }
    if (!configured) throw fail('not_configured', 'Supabase не подключён: вставьте URL и ключ в supabase.js');

    // Секретный токен отзыва (функция базы требует не менее 32 символов)
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

    let res;
    try {
      res = await fetch(BASE + '/rest/v1/rpc/add_review_v2', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          p_nick: name || '', p_rating: rating, p_body: text,
          p_token: token, p_anon: anonymous
        })
      });
    } catch (e) { throw fail('network', 'Нет соединения с сервером'); }

    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) {}
      if (/rate limit/i.test(msg)) throw fail('rate', 'Слишком много отзывов с вашего адреса. Попробуйте позже.');
      throw fail('http', 'Не удалось отправить отзыв (' + res.status + ')');
    }
    let out = {};
    try { out = await res.json(); } catch (e) {}
    return { pending: !!out.pending };
  }

  window.ReviewsAPI = { list, create, configured, preview: PREVIEW };
})();
