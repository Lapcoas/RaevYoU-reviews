/* =========================================================
   RaevYoU — отзывы
   ---------------------------------------------------------
   Чтобы отзывы видели ВСЕ посетители, им нужна общая база.
   Сайт на GitHub Pages — статичный, своей базы у него нет,
   поэтому используется бесплатный Supabase.
   Как подключить — в README.md (5 минут).

   Пока SUPABASE_URL и SUPABASE_ANON_KEY пустые, сайт работает
   в ДЕМО-режиме: отзывы сохраняются только в этом браузере.
   ========================================================= */

const CONFIG = {
  SUPABASE_URL: 'https://vlkwavhzujcrnrwoejyc.supabase.co', // например: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_3xigkNqFMl6GdOTIQ6TXdg_9vuKclzz', // публичный ключ (anon / publishable) — его можно хранить в коде
};

(() => {
  'use strict';

  /* ---------- константы ---------- */
  const LS_MINE = 'raevyou:my-review:v1';
  const LS_DEMO = 'raevyou:demo-reviews:v1';
  const POLL_MS = 30000;      // как часто подтягивать новые отзывы
  const PAGE_SIZE = 24;       // сколько карточек показывать за раз
  const MAX_NICK = 24;
  const MAX_TEXT = 500;
  const REMOTE = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  const HINTS = ['', 'Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
  const STAR_PATH = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z';
  const PENCIL_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/></svg>';

  /* ---------- утилиты ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const canHover = window.matchMedia('(hover: hover)').matches;

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* приватный режим */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ничего */ } },
  };

  const makeToken = () => {
    const a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  const plural = (n, [one, few, many]) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };

  const node = (cls, text, tag = 'div') => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* =========================================================
     Хранилище: Supabase (для всех) или демо (только браузер)
     ========================================================= */
  function createRemoteApi() {
    const base = CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/';
    const headers = { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY };
    // Старые ключи — JWT (начинаются с eyJ), их отправляют ещё и в Authorization.
    if (CONFIG.SUPABASE_ANON_KEY.startsWith('eyJ')) {
      headers.Authorization = 'Bearer ' + CONFIG.SUPABASE_ANON_KEY;
    }

    async function rpc(name, body) {
      const res = await fetch(base + name, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) throw new Error('Supabase ' + name + ': ' + res.status);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }

    return {
      list: () => rpc('get_reviews', { p_limit: 500 }),
      add: (r, token) => rpc('add_review', { p_nick: r.nick, p_rating: r.rating, p_body: r.body, p_token: token }),
      edit: (id, token, r) => rpc('edit_review', { p_id: id, p_token: token, p_nick: r.nick, p_rating: r.rating, p_body: r.body }),
    };
  }

  function createDemoApi() {
    const read = () => store.get(LS_DEMO) || [];
    const write = (rows) => store.set(LS_DEMO, rows);
    return {
      async list() {
        return read().map(({ token, ...pub }) => pub);
      },
      async add(r, token) {
        const id = 'demo-' + token.slice(0, 16);
        const rows = read();
        rows.push({ id, nick: r.nick, rating: r.rating, body: r.body, token, created_at: new Date().toISOString(), updated_at: null });
        write(rows);
        return id;
      },
      async edit(id, token, r) {
        const rows = read();
        const row = rows.find((x) => x.id === id && x.token === token);
        if (!row) return false;
        Object.assign(row, { nick: r.nick, rating: r.rating, body: r.body, updated_at: new Date().toISOString() });
        write(rows);
        return true;
      },
    };
  }

  const api = REMOTE ? createRemoteApi() : createDemoApi();

  /* =========================================================
     Состояние
     ========================================================= */
  let reviews = [];            // все отзывы, новые первыми
  let mine = store.get(LS_MINE); // { id, token, snapshot:{nick,rating,body}, at }
  let shown = PAGE_SIZE;
  let loaded = false;
  let refreshing = false;
  let busy = false;            // идёт отправка
  let localVersion = 0;        // растёт при локальных правках, чтобы не затирать их устаревшим ответом
  let isOpen = false;
  let mode = 'new';            // 'new' | 'edit'
  let lastFocus = null;
  const form = { rating: 0 };
  const cardCache = new Map(); // id -> { el, sig }

  /* ---------- элементы ---------- */
  const el = {
    html: document.documentElement,
    hero: $('#heroInner'),
    grid: $('#grid'),
    empty: $('#empty'),
    error: $('#error'),
    retry: $('#retry'),
    sentinel: $('#sentinel'),
    summary: $('#summary'),
    sumAvg: $('#sumAvg'),
    sumStars: $('#sumStars'),
    sumCount: $('#sumCount'),
    fab: $('#fab'),
    fabText: $('#fabText'),
    modal: $('#modal'),
    close: $('#close'),
    back: $('#back'),
    submit: $('#submit'),
    submitText: $('#submitText'),
    title: $('#modalTitle'),
    lead: $('#modalLead'),
    nick: $('#nick'),
    text: $('#text'),
    counter: $('#counter'),
    stars: $('#stars'),
    starBtns: $$('.star'),
    hint: $('#hint'),
    toast: $('#toast'),
  };

  /* =========================================================
     Отрисовка
     ========================================================= */
  const starRow = (n) => {
    const wrap = node('rating', null, 'span');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', 'Оценка ' + n + ' из 5');
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += '<svg class="rating__star' + (i <= n ? ' is-on' : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
    }
    wrap.innerHTML = html;
    return wrap;
  };

  const fmtDate = (r) => {
    const d = new Date(r.created_at);
    const base = isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    return r.updated_at ? (base ? base + ', изменён' : 'изменён') : base;
  };

  const initial = (nick) => (Array.from(nick.trim())[0] || '?').toUpperCase();

  const isMine = (id) => Boolean(mine && mine.id === id);

  function buildCard(r) {
    const mineCard = isMine(r.id);
    const card = node('card' + (mineCard ? ' card--mine' : ''), null, 'article');
    card.dataset.id = r.id;

    const head = node('card__head');
    const avatar = node('card__avatar', initial(r.nick));
    avatar.setAttribute('aria-hidden', 'true');

    const who = node('card__who');
    const name = node('card__name');
    name.append(node(null, r.nick, 'span'));
    if (mineCard) name.append(node('chip', 'ваш отзыв', 'span'));
    who.append(name, node('card__date', fmtDate(r)));
    head.append(avatar, who);

    if (mineCard) {
      const edit = node('card__edit', null, 'button');
      edit.type = 'button';
      edit.setAttribute('aria-label', 'Изменить мой отзыв');
      edit.innerHTML = PENCIL_SVG;
      edit.addEventListener('click', () => openModal(true));
      head.append(edit);
    }

    card.append(head, starRow(r.rating));
    if (r.body) card.append(node('card__text', r.body));
    return card;
  }

  /* Появление карточек при прокрутке */
  const revealIO = new IntersectionObserver((entries) => {
    let i = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.style.transitionDelay = Math.min(i++ * 70, 420) + 'ms';
      entry.target.classList.add('is-in');
      revealIO.unobserve(entry.target);
    });
  }, { threshold: 0.08 });

  function renderGrid() {
    const list = reviews.slice(0, shown);
    const keep = new Set();
    const els = [];

    list.forEach((r) => {
      keep.add(r.id);
      const sig = [r.nick, r.rating, r.body, r.updated_at, isMine(r.id)].join('\u0001');
      let c = cardCache.get(r.id);
      if (!c || c.sig !== sig) {
        const fresh = buildCard(r);
        if (c) {
          revealIO.unobserve(c.el);
          if (c.el.classList.contains('is-in')) fresh.classList.add('is-in');
        }
        if (!fresh.classList.contains('is-in')) revealIO.observe(fresh);
        c = { el: fresh, sig };
        cardCache.set(r.id, c);
      }
      els.push(c.el);
    });

    cardCache.forEach((c, id) => {
      if (!keep.has(id)) { revealIO.unobserve(c.el); cardCache.delete(id); }
    });

    el.grid.replaceChildren(...els);
    queueMoreCheck();
  }

  function renderSummary() {
    if (!reviews.length) { el.summary.hidden = true; return; }
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    el.summary.hidden = false;
    el.sumAvg.textContent = avg.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const stars = starRow(Math.round(avg));
    el.sumStars.replaceChildren(...stars.childNodes);
    el.sumStars.setAttribute('aria-label', 'Средняя оценка ' + avg.toFixed(1) + ' из 5');
    el.sumCount.textContent = reviews.length + ' ' + plural(reviews.length, ['отзыв', 'отзыва', 'отзывов']);
  }

  function syncFab() {
    const editing = Boolean(mine);
    el.fab.dataset.mode = editing ? 'edit' : 'new';
    el.fabText.textContent = editing ? 'Изменить мой отзыв' : 'Написать свой отзыв';
  }

  function renderAll() {
    renderSummary();
    renderGrid();
    syncFab();
    el.error.hidden = true;
    el.empty.hidden = reviews.length > 0;
  }

  function showSkeleton() {
    const frag = [];
    for (let i = 0; i < 6; i++) frag.push(node('card card--skeleton'));
    el.grid.replaceChildren(...frag);
  }

  /* Подгрузка по мере прокрутки */
  const moreIO = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) loadMore();
  }, { rootMargin: '600px 0px' });
  moreIO.observe(el.sentinel);

  function loadMore() {
    if (shown >= reviews.length) return;
    shown += PAGE_SIZE;
    renderGrid();
  }

  let moreQueued = false;
  function queueMoreCheck() {
    if (moreQueued) return;
    moreQueued = true;
    requestAnimationFrame(() => {
      moreQueued = false;
      if (shown < reviews.length && el.sentinel.getBoundingClientRect().top < innerHeight + 600) loadMore();
    });
  }

  /* =========================================================
     Загрузка отзывов
     ========================================================= */
  const normalize = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        id: String(r.id),
        nick: String(r.nick || ''),
        rating: Math.min(5, Math.max(1, Number(r.rating) || 1)),
        body: String(r.body || ''),
        created_at: r.created_at || '',
        updated_at: r.updated_at || null,
      }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  function validateMine() {
    // Если отзыв удалили из базы (модерация) — человек снова может написать новый.
    if (!mine || reviews.some((r) => r.id === mine.id)) return;
    if (Date.now() - (mine.at || 0) < 120000) return; // только что отправлен — база могла не успеть
    mine = null;
    store.del(LS_MINE);
  }

  async function refresh() {
    if (refreshing || busy) return;
    refreshing = true;
    const version = localVersion;
    try {
      const rows = await api.list();
      if (version !== localVersion) return; // за время запроса отзыв был изменён локально
      reviews = normalize(rows);
      loaded = true;
      validateMine();
      renderAll();
    } catch (err) {
      console.error(err);
      if (!loaded) {
        el.grid.replaceChildren();
        el.summary.hidden = true;
        el.empty.hidden = true;
        el.error.hidden = false;
      }
    } finally {
      refreshing = false;
    }
  }

  /* =========================================================
     Окно отзыва
     ========================================================= */
  function currentMineData() {
    if (!mine) return null;
    return reviews.find((r) => r.id === mine.id) || mine.snapshot || null;
  }

  function updateCounter() {
    el.counter.textContent = el.text.value.length + ' / ' + MAX_TEXT;
  }

  function syncSubmit() {
    const ready = el.nick.value.trim().length > 0 && form.rating > 0;
    el.submit.classList.toggle('is-visible', ready);
    el.submit.tabIndex = ready ? 0 : -1;
    el.submit.setAttribute('aria-hidden', String(!ready));
  }

  function setRating(n, pop) {
    form.rating = n;
    el.starBtns.forEach((btn, i) => {
      const on = i < n;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', String(i + 1 === n));
      btn.classList.remove('pop');
      if (pop && on) {
        void btn.offsetWidth; // перезапуск анимации
        btn.style.animationDelay = i * 45 + 'ms';
        btn.classList.add('pop');
      }
    });
    el.hint.textContent = HINTS[n] || '';
    syncSubmit();
  }

  function previewRating(n) {
    el.stars.classList.toggle('is-previewing', n > 0);
    el.starBtns.forEach((btn, i) => btn.classList.toggle('is-hover', i < n));
    el.hint.textContent = HINTS[n || form.rating] || '';
  }

  function openModal(editing) {
    if (isOpen) return;
    // защита: вторая вкладка уже могла сохранить отзыв
    mine = store.get(LS_MINE) || mine;
    if (!editing && mine) editing = true;

    lastFocus = document.activeElement;
    mode = editing ? 'edit' : 'new';
    const data = editing ? currentMineData() : null;

    el.nick.value = data ? data.nick : '';
    el.text.value = data ? data.body : '';
    updateCounter();
    setRating(data ? data.rating : 0, false);

    el.title.textContent = editing ? 'Изменить отзыв' : 'Новый отзыв';
    el.lead.textContent = editing
      ? 'Поправьте никнейм, оценку или текст.'
      : 'Придумайте любой никнейм и поставьте оценку.';
    el.submitText.textContent = editing ? 'Сохранить' : 'Оставить отзыв';

    el.modal.inert = false;
    el.modal.setAttribute('aria-hidden', 'false');
    el.modal.classList.add('is-open');
    el.html.classList.add('is-locked');
    isOpen = true;

    if (canHover && !editing) setTimeout(() => el.nick.focus({ preventScroll: true }), 260);
  }

  function closeModal() {
    if (!isOpen) return;
    isOpen = false;
    el.modal.classList.remove('is-open');
    el.modal.setAttribute('aria-hidden', 'true');
    el.modal.inert = true;
    el.html.classList.remove('is-locked');
    previewRating(0);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  }

  let toastTimer = 0;
  function toast(message, ms = 3400) {
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), ms);
  }

  function showCard(id) {
    const idx = reviews.findIndex((r) => r.id === id);
    if (idx === -1) return;
    shown = Math.max(shown, idx + 1);
    renderGrid();
    const c = cardCache.get(id);
    if (!c) return;
    revealIO.unobserve(c.el);
    c.el.classList.add('is-in', 'flash');
    setTimeout(() => c.el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 380);
    setTimeout(() => c.el.classList.remove('flash'), 2800);
  }

  async function submit() {
    if (busy) return;
    const nick = el.nick.value.trim().slice(0, MAX_NICK);
    const body = el.text.value.trim().slice(0, MAX_TEXT);
    const rating = form.rating;
    if (!nick || !rating) return;

    busy = true;
    el.submit.classList.add('is-busy');
    el.submitText.textContent = 'Отправляем…';
    const payload = { nick, rating, body };

    try {
      let id;
      let message;

      if (mode === 'edit' && mine) {
        const ok = await api.edit(mine.id, mine.token, payload);
        if (ok === false) {
          // отзыва больше нет в базе — разрешаем написать новый
          mine = null;
          store.del(LS_MINE);
          closeModal();
          syncFab();
          toast('Этот отзыв уже удалён. Можно написать новый.');
          refresh();
          return;
        }
        id = mine.id;
        mine.snapshot = payload;
        store.set(LS_MINE, mine);
        const i = reviews.findIndex((r) => r.id === id);
        if (i !== -1) reviews[i] = { ...reviews[i], ...payload, updated_at: new Date().toISOString() };
        message = 'Отзыв обновлён';
      } else {
        const token = makeToken();
        id = String(await api.add(payload, token));
        mine = { id, token, snapshot: payload, at: Date.now() };
        store.set(LS_MINE, mine);
        reviews.unshift({ id, ...payload, created_at: new Date().toISOString(), updated_at: null });
        message = 'Спасибо! Ваш отзыв опубликован';
      }

      localVersion++;
      closeModal();
      renderAll();
      toast(message);
      showCard(id);
      setTimeout(refresh, 1200); // сверяемся с базой, подтягиваем чужие отзывы
    } catch (err) {
      console.error(err);
      toast('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.', 4200);
    } finally {
      busy = false;
      el.submit.classList.remove('is-busy');
      el.submitText.textContent = mode === 'edit' ? 'Сохранить' : 'Оставить отзыв';
    }
  }

  /* =========================================================
     События
     ========================================================= */
  el.fab.addEventListener('click', () => openModal(Boolean(mine)));
  el.close.addEventListener('click', closeModal);
  el.back.addEventListener('click', closeModal);
  el.submit.addEventListener('click', submit);
  el.retry.addEventListener('click', () => { showSkeleton(); el.error.hidden = true; refresh(); });

  el.nick.addEventListener('input', syncSubmit);
  el.nick.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.text.focus(); }
  });
  el.text.addEventListener('input', updateCounter);
  el.text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && el.submit.classList.contains('is-visible')) submit();
  });

  // звёзды: клик закрашивает все до выбранной
  el.starBtns.forEach((btn) => {
    const v = Number(btn.dataset.v);
    btn.addEventListener('click', () => setRating(v, true));
    if (canHover) {
      btn.addEventListener('mouseenter', () => previewRating(v));
    }
  });
  if (canHover) el.stars.addEventListener('mouseleave', () => previewRating(0));
  el.stars.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, (form.rating || 0) + (e.key === 'ArrowRight' ? 1 : -1)));
    setRating(next, true);
    el.starBtns[next - 1].focus();
  });

  // Esc и «ловушка» фокуса внутри окна
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const items = $$('button, input, textarea', el.modal).filter(
      (n) => !n.disabled && n.tabIndex >= 0 && getComputedStyle(n).visibility !== 'hidden'
    );
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // лёгкий «уход» первого экрана при прокрутке
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const p = Math.min(1, Math.max(0, scrollY / (innerHeight * 0.7)));
      el.hero.parentElement.style.setProperty('--p', p.toFixed(3)); // .hero; дети наследуют
      ticking = false;
    });
  }, { passive: true });

  // новые отзывы других людей подтягиваются сами
  setInterval(() => { if (!document.hidden && !isOpen) refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  addEventListener('online', refresh);

  /* =========================================================
     Старт
     ========================================================= */
  syncFab();
  showSkeleton();
  refresh();

  if (!REMOTE) {
    console.warn('[RaevYoU] Демо-режим: заполните CONFIG в script.js, чтобы отзывы видели все.');
    setTimeout(() => toast('Демо-режим: отзывы видны только в этом браузере. Подключите базу — см. README.', 7000), 1800);
  }
})();
