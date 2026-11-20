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

// ====== О продавце и контакты: впиши своё (можно оставить пустым) ======
const SELLER = {
  about: 'RaevYoU — честные сделки и быстрые ответы. Все отзывы на этой странице оставляют реальные покупатели.',
  telegram: '', // например: 'raevyou' (без @)
  discord: '',  // например: 'raevyou'
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
  const ROLES = {
    first:    ['🥇', 'Первый покупатель'],
    regular:  ['🔁', 'Постоянный покупатель'],
    vip:      ['💎', 'VIP'],
    newbie:   ['🌱', 'Новичок'],
    verified: ['✅', 'Проверенный'],
    wholesale: ['📦', 'Оптовик'],
    friend:   ['🤝', 'Друг магазина'],
  };
  const EMO = ['', '😡', '😕', '😐', '🙂', '🤩'];
  const HINTS = ['', '😡 Ужасно', '😕 Плохо', '😐 Нормально', '🙂 Хорошо', '🤩 Отлично'];
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

  const voterId = () => {
    let v = store.get('raevyou:voter:v1');
    if (!v) { v = makeToken(); store.set('raevyou:voter:v1', v); }
    return v;
  };
  const photoUrl = (n) => CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1/object/public/review-photos/' + n;

  // фото → JPEG до ~1 МБ
  async function toJpeg(file) {
    const bmp = await createImageBitmap(file);
    let k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    for (let q = .85, t = 0; t < 6; t++, q -= .1, k *= .88) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size < 950000) return blob;
    }
    throw new Error('photo too big');
  }

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
      async list() {
        const [rows, rx] = await Promise.all([
          rpc('get_reviews_v2', { p_limit: 500, p_voter: voterId(), p_mine_id: mine ? mine.id : null, p_mine_token: mine ? mine.token : null }),
          rpc('get_reactions', { p_voter: voterId() }).catch(() => []),
        ]);
        const m = {};
        (rx || []).forEach((x) => { (m[x.review_id] = m[x.review_id] || {})[x.emoji] = x; });
        return (rows || []).map((r) => {
          const a = m[r.id] || {};
          return { ...r, fire: a.fire ? a.fire.cnt : 0, fireMine: Boolean(a.fire && a.fire.mine), heart: a.heart ? a.heart.cnt : 0, heartMine: Boolean(a.heart && a.heart.mine) };
        });
      },
      react: (id, emoji) => rpc('react_review', { p_id: id, p_voter: voterId(), p_emoji: emoji }),
      vote: (id) => rpc('vote_review', { p_id: id, p_voter: voterId() }),
      async upload(blob) {
        const name = makeToken().slice(0, 32) + '.jpg';
        const h = { apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'image/jpeg' };
        if (CONFIG.SUPABASE_ANON_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + CONFIG.SUPABASE_ANON_KEY;
        const res = await fetch(CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1/object/review-photos/' + name, { method: 'POST', headers: h, body: blob });
        if (!res.ok) throw new Error('upload ' + res.status);
        return name;
      },
      add: (r, token) => rpc('add_review_v2', { p_nick: r.nick, p_rating: r.rating, p_body: r.body, p_token: token, p_anon: r.anon, p_product: r.product || null, p_photo: r.photo || null }),
      edit: (id, token, r) => rpc('edit_review_v2', { p_id: id, p_token: token, p_nick: r.nick, p_rating: r.rating, p_body: r.body, p_anon: r.anon, p_product: r.product || null, p_photo: r.photo || null }),
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
        rows.push({ id, nick: r.nick, rating: r.rating, body: r.body, is_anon: r.anon, product: r.product, token, created_at: new Date().toISOString(), updated_at: null });
        write(rows);
        return id;
      },
      async edit(id, token, r) {
        const rows = read();
        const row = rows.find((x) => x.id === id && x.token === token);
        if (!row) return false;
        Object.assign(row, { nick: r.nick, rating: r.rating, body: r.body, is_anon: r.anon, product: r.product, updated_at: new Date().toISOString() });
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
  const form = { rating: 0, photo: null, file: null, preview: '' };
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
    anon: $('#anon'),
    product: $('#product'),
    sumBars: $('#sumBars'),
    sky: $('#sky'),
    photoField: $('#photoField'),
    photo: $('#photo'),
    photoPick: $('#photoPick'),
    photoPrev: $('#photoPrev'),
    photoImg: $('#photoImg'),
    photoDel: $('#photoDel'),
    about: $('#aboutBtn'),
    contact: $('#contactBtn'),
    themeBtn: $('#themeBtn'),
    soundBtn: $('#soundBtn'),
    noresults: $('#noresults'),
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
    const card = node('card' + (mineCard ? ' card--mine' : '') + (r.is_anon ? ' card--anon' : '') + (r.pinned ? ' card--pinned' : ''), null, 'article');
    card.dataset.id = r.id;

    const head = node('card__head');
    const avatar = node('card__avatar', r.is_anon ? '🕶' : initial(r.nick));
    avatar.setAttribute('aria-hidden', 'true');

    const who = node('card__who');
    const name = node('card__name');
    name.append(node(null, r.is_anon ? 'Аноним' : r.nick, 'span'));
    if (mineCard) name.append(node('chip', 'ваш отзыв', 'span'));
    if (r.pinned) name.append(node('chip', '📌', 'span'));
    if (r.pending) name.append(node('chip', 'на проверке', 'span'));

    who.append(name, node('card__date', fmtDate(r)));
    if (r.is_anon) who.append(node('role role--anon', '🕶 Аноним', 'span'));
    else {
      const tags = node('card__tags');
      const rl = ROLES[r.role] ? r.role : (early.has(r.id) ? 'first' : '');
      if (rl) tags.append(node('role role--' + rl, ROLES[rl][0] + ' ' + ROLES[rl][1], 'span'));
      if (r.photo && r.body.length >= 80) tags.append(node('role role--detail', '📸 Подробный отзыв', 'span'));
      if (Date.now() - new Date(r.created_at) > 30 * 864e5) tags.append(node('role role--old', '🕰 Старожил', 'span'));
      if (tags.childNodes.length) who.append(tags);
    }
    head.append(avatar, who);

    if (mineCard) {
      const edit = node('card__edit', null, 'button');
      edit.type = 'button';
      edit.setAttribute('aria-label', 'Изменить мой отзыв');
      edit.innerHTML = PENCIL_SVG;
      edit.addEventListener('click', () => openModal(true));
      head.append(edit);
    }

    const sr = starRow(r.rating);
    sr.append(node('rating__emoji', ' ' + EMO[r.rating], 'span'));
    card.append(head, sr);
    if (r.product) card.append(node('card__product', '🛒 ' + r.product));
    if (r.body) card.append(node('card__text', r.body));
    if (r.photo && REMOTE) {
      const im = node('card__photo', null, 'img');
      im.src = photoUrl(r.photo); im.loading = 'lazy'; im.alt = 'Фото к отзыву';
      im.addEventListener('click', () => openLightbox(im.src));
      card.append(im);
    }
    if (r.reply) {
      const rp = node('card__reply');
      rp.append(node('card__reply-h', '↳ Ответ продавца', 'span'), node('card__reply-t', r.reply, 'p'));
      card.append(rp);
    }
    const acts = node('card__acts');
    if (REMOTE && !r.pending) {
      [['like', '👍', r.helpful, r.voted], ['fire', '🔥', r.fire, r.fireMine], ['heart', '❤️', r.heart, r.heartMine]].forEach(([k, e, n, on]) => {
        const b = node('card__helpful' + (on ? ' is-on' : ''), e + (n ? ' ' + n : ''), 'button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Реакция');
        b.addEventListener('click', () => react(r.id, k));
        acts.append(b);
      });
    }
    if (!r.pending) {
      const sh = node('card__helpful', '↗ Поделиться', 'button');
      sh.type = 'button';
      sh.addEventListener('click', () => share(r));
      acts.append(sh);
    }
    card.append(acts);
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

  function openLightbox(src) {
    const box = node('lightbox');
    const im = node(null, null, 'img');
    im.src = src;
    box.append(im);
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.append(box);
  }

  async function vote(id) {
    const r = reviews.find((x) => x.id === id);
    if (!r) return;
    const prev = { helpful: r.helpful, voted: r.voted };
    r.voted = !r.voted;
    r.helpful += r.voted ? 1 : -1;
    localVersion++;
    renderGrid();
    try {
      const out = await api.vote(id);
      const o = Array.isArray(out) ? out[0] : out;
      if (o) { r.helpful = o.helpful; r.voted = o.voted; renderGrid(); }
    } catch (err) {
      console.error(err);
      Object.assign(r, prev);
      renderGrid();
      toast('Не получилось. Попробуйте ещё раз.');
    }
  }

  let query = '';
  let early = new Set();
  let soundOn = store.get('raevyou:sound') !== false;
  let actx = null;
  let sumShown = false;
  let deepDone = false;

  async function react(id, kind) {
    if (kind === 'like') return vote(id);
    const r = reviews.find((x) => x.id === id);
    if (!r) return;
    const m = kind + 'Mine', prev = { n: r[kind], on: r[m] };
    r[m] = !r[m];
    r[kind] += r[m] ? 1 : -1;
    localVersion++;
    renderGrid();
    try {
      const out = await api.react(id, kind);
      const o = Array.isArray(out) ? out[0] : out;
      if (o) { r[kind] = o.cnt; r[m] = o.mine; renderGrid(); }
    } catch (err) {
      console.error(err);
      r[kind] = prev.n; r[m] = prev.on;
      renderGrid();
      toast('Не получилось. Попробуйте ещё раз.');
    }
  }

  async function share(r) {
    const link = location.origin + location.pathname + '#r-' + r.id;
    try { await document.fonts.ready; } catch (e) { /* ничего */ }
    const W = 1080, c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#fff';
    for (let i = 0; i < 150; i++) {
      g.globalAlpha = Math.random() * .8 + .1;
      g.beginPath(); g.arc(Math.random() * W, Math.random() * W, Math.random() * 1.6 + .4, 0, 6.3); g.fill();
    }
    g.globalAlpha = 1;
    g.font = '700 56px Onest, sans-serif';
    g.fillText(r.is_anon ? 'Аноним' : r.nick, 90, 190);
    g.font = '64px sans-serif'; g.fillStyle = '#ffc928';
    g.fillText('★'.repeat(r.rating) + '☆'.repeat(5 - r.rating), 90, 290);
    g.fillStyle = '#fff'; g.font = '500 44px Onest, sans-serif';
    const lines = []; let line = '';
    (r.body || 'Без текста').split(/\s+/).forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (line && g.measureText(t).width > 900) { lines.push(line); line = w; } else line = t;
    });
    lines.push(line);
    lines.slice(0, 9).forEach((l, i) => g.fillText(l + (i === 8 && lines.length > 9 ? '…' : ''), 90, 400 + i * 64));
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 40px Onest, sans-serif';
    g.fillText('RaevYoU — отзывы', 90, 990);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'raevyou-review.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], url: link, title: 'Отзыв о RaevYoU' });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(link); } catch (e) { /* ничего */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'raevyou-review.png'; a.click();
    toast('Картинка сохранена, ссылка скопирована');
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = node('fx', null, 'canvas');
    c.width = innerWidth; c.height = innerHeight;
    document.body.append(c);
    const g = c.getContext('2d');
    const cols = ['#ffc928', '#fff', '#ff6eaa', '#5aa0ff', '#50dc82', '#c084fc'];
    const ps = Array.from({ length: 120 }, () => ({
      x: c.width / 2, y: c.height * .78, vx: (Math.random() - .5) * 16, vy: -Math.random() * 17 - 6,
      w: Math.random() * 7 + 4, h: Math.random() * 4 + 3, a: Math.random() * 6, va: (Math.random() - .5) * .4,
      col: cols[(Math.random() * cols.length) | 0],
    }));
    const t0 = performance.now();
    const tick = (t) => {
      g.clearRect(0, 0, c.width, c.height);
      ps.forEach((p) => {
        p.vy += .38; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.va;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        g.globalAlpha = Math.max(0, 1 - (t - t0) / 2600);
        g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      });
      if (t - t0 < 2600) requestAnimationFrame(tick); else c.remove();
    };
    requestAnimationFrame(tick);
  }

  function warmAudio() {
    if (!soundOn) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* ничего */ }
  }

  function ping() {
    if (!soundOn || !actx) return;
    try {
      [880, 1320].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * .11;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(.12, t + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t + .35);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + .4);
      });
    } catch (e) { /* ничего */ }
  }

  function contactLinks() {
    const out = [];
    if (SELLER.telegram) {
      const a = node('pill', '✈ Telegram', 'a');
      a.href = 'https://t.me/' + SELLER.telegram.replace(/^@/, ''); a.target = '_blank'; a.rel = 'noopener';
      out.push(a);
    }
    if (SELLER.discord) {
      const b = node('pill', '💬 Discord: ' + SELLER.discord, 'button');
      b.type = 'button';
      b.addEventListener('click', () => { navigator.clipboard.writeText(SELLER.discord).then(() => toast('Ник скопирован')).catch(() => {}); });
      out.push(b);
    }
    return out;
  }

  function openAbout() {
    const box = node('lightbox lightbox--about'), p = node('about');
    const row = node('about__links');
    contactLinks().forEach((l) => row.append(l));
    const x = node('pill', 'Закрыть', 'button');
    x.type = 'button';
    p.append(node(null, 'О продавце', 'h3'), node(null, SELLER.about, 'p'), row, x);
    box.append(p);
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    x.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.append(box);
  }

  const THEME_BG = { black: '#000000', navy: '#050a1a', violet: '#0b0618' };
  function applyTheme(t) {
    if (!THEME_BG[t]) t = 'black';
    el.html.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = THEME_BG[t];
    store.set('raevyou:theme', t);
  }

  let sortMode = 'new';
  function view() {
    let l = reviews.slice();
    if (sortMode === 'best') l.sort((a, b) => b.rating - a.rating);
    const q = query.trim().toLowerCase();
    if (q) l = l.filter((r) => (r.nick + ' ' + r.body + ' ' + r.product + ' ' + r.reply).toLowerCase().includes(q));
    if (sortMode === 'helpful') l.sort((a, b) => (b.helpful + b.fire + b.heart) - (a.helpful + a.fire + a.heart));
    if (sortMode === 'photo') l = l.filter((r) => r.photo);
    if (sortMode === 'text') l = l.filter((r) => r.body);
    if (sortMode === 'reply') l = l.filter((r) => r.reply);
    return l.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  function renderGrid() {
    const list = view().slice(0, shown);
    el.noresults.hidden = list.length > 0 || !reviews.length;
    early = new Set(reviews.filter((x) => !x.is_anon && !x.pending).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, 3).map((x) => x.id));
    const keep = new Set();
    const els = [];

    list.forEach((r) => {
      keep.add(r.id);
      const sig = [r.nick, r.rating, r.body, r.updated_at, isMine(r.id), r.is_anon, r.product, r.role, r.reply, r.pinned, r.photo, r.helpful, r.voted, r.pending, r.fire, r.heart, r.fireMine, r.heartMine, early.has(r.id)].join('\u0001');
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

  function countUp(node_, to) {
    const fmt = (v) => v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (sumShown || matchMedia('(prefers-reduced-motion: reduce)').matches) { sumShown = true; node_.textContent = fmt(to); return; }
    sumShown = true;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1000);
      node_.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderSummary() {
    if (!reviews.length) { el.summary.hidden = true; $('#stats').hidden = true; return; }
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    el.summary.hidden = false;
    countUp(el.sumAvg, avg);
    const stars = starRow(Math.round(avg));
    el.sumStars.replaceChildren(...stars.childNodes);
    el.sumStars.setAttribute('aria-label', 'Средняя оценка ' + avg.toFixed(1) + ' из 5');
    const happy = Math.round(reviews.filter((r) => r.rating >= 4).length / reviews.length * 100);
    el.sumCount.textContent = reviews.length + ' ' + plural(reviews.length, ['отзыв', 'отзыва', 'отзывов']) + ' · ' + happy + '% довольны · 5★ — ' + Math.round(reviews.filter((r) => r.rating === 5).length / reviews.length * 100) + '%';
    const cnt = [0, 0, 0, 0, 0, 0];
    reviews.forEach((r) => cnt[r.rating]++);
    el.sumBars.replaceChildren(...[5, 4, 3, 2, 1].map((n) => {
      const row = node('bar'), track = node('bar__track'), fill = node('bar__fill');
      fill.style.width = (cnt[n] / reviews.length * 100) + '%';
      track.append(fill);
      row.append(node('bar__n', n + '★', 'span'), track, node('bar__c', String(cnt[n]), 'span'));
      return row;
    }));
    $('#stats').hidden = false;
    $('#stN').textContent = reviews.length;
    $('#stA').textContent = avg.toFixed(1).replace('.', ',');
    $('#stH').textContent = happy + '%';
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
    if (shown >= view().length) return;
    shown += PAGE_SIZE;
    renderGrid();
  }

  let moreQueued = false;
  function queueMoreCheck() {
    if (moreQueued) return;
    moreQueued = true;
    requestAnimationFrame(() => {
      moreQueued = false;
      if (shown < view().length && el.sentinel.getBoundingClientRect().top < innerHeight + 600) loadMore();
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
        is_anon: Boolean(r.is_anon),
        product: String(r.product || ''),
        role: String(r.badge || r.role || ''),
        reply: String(r.seller_reply || r.reply || ''),
        photo: r.photo || '',
        helpful: Number(r.helpful) || 0,
        voted: Boolean(r.voted),
        pending: Boolean(r.pending),
        fire: Number(r.fire) || 0,
        heart: Number(r.heart) || 0,
        fireMine: Boolean(r.fireMine),
        heartMine: Boolean(r.heartMine),
        pinned: Boolean(r.pinned),
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
      if (!deepDone) {
        deepDone = true;
        const m = location.hash.match(/^#r-(.+)$/);
        if (m) showCard(m[1]);
      }
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

  function syncPhoto() {
    const src = form.file ? form.preview : (form.photo ? photoUrl(form.photo) : '');
    el.photoPrev.hidden = !src;
    el.photoPick.hidden = Boolean(src);
    if (src) el.photoImg.src = src;
  }

  function syncAnon() {
    el.nick.disabled = el.anon.checked;
    el.nick.closest('.field').classList.toggle('is-off', el.anon.checked);
    syncSubmit();
  }

  function updateCounter() {
    el.counter.textContent = el.text.value.length + ' / ' + MAX_TEXT;
  }

  function syncSubmit() {
    const ready = (el.anon.checked || el.nick.value.trim().length > 0) && form.rating > 0;
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
    el.anon.checked = Boolean(data && (data.is_anon || data.anon));
    el.product.value = data ? (data.product || '') : '';
    if (el.anon.checked) el.nick.value = '';
    syncAnon();
    if (form.preview) URL.revokeObjectURL(form.preview);
    form.file = null; form.preview = '';
    form.photo = data && data.photo ? data.photo : null;
    el.photo.value = '';
    el.photoField.hidden = !REMOTE;
    syncPhoto();
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
    const idx = view().findIndex((r) => r.id === id);
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
    warmAudio();
    const anon = el.anon.checked;
    const product = el.product.value.trim().slice(0, 40);
    const nick = anon ? 'Аноним' : el.nick.value.trim().slice(0, MAX_NICK);
    const body = el.text.value.trim().slice(0, MAX_TEXT);
    const rating = form.rating;
    if (!nick || !rating) return;

    busy = true;
    el.submit.classList.add('is-busy');
    el.submitText.textContent = 'Отправляем…';
    const payload = { nick, rating, body, anon, product, photo: form.photo };

    try {
      let id;
      let message;
      let pending = false;
      if (form.file) payload.photo = await api.upload(await toJpeg(form.file));

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
        if (i !== -1) reviews[i] = { ...reviews[i], ...payload, is_anon: anon, updated_at: new Date().toISOString() };
        message = 'Отзыв обновлён';
      } else {
        const token = makeToken();
        const res = await api.add(payload, token);
        id = String(res && res.id ? res.id : res);
        pending = Boolean(res && res.pending);
        mine = { id, token, snapshot: payload, at: Date.now() };
        store.set(LS_MINE, mine);
        reviews.unshift({ id, ...payload, is_anon: anon, role: '', reply: '', pinned: false, pending, helpful: 0, voted: false, created_at: new Date().toISOString(), updated_at: null });
        message = pending ? 'Спасибо! Отзыв появится после проверки' : 'Спасибо! Ваш отзыв опубликован';
      }

      localVersion++;
      closeModal();
      renderAll();
      toast(message);
      if (rating === 5) confetti();
      ping();
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
  el.photo.addEventListener('change', () => {
    const f = el.photo.files && el.photo.files[0];
    if (!f) return;
    if (form.preview) URL.revokeObjectURL(form.preview);
    form.file = f; form.preview = URL.createObjectURL(f);
    syncPhoto();
  });
  el.photoDel.addEventListener('click', () => {
    if (form.preview) URL.revokeObjectURL(form.preview);
    form.file = null; form.preview = ''; form.photo = null; el.photo.value = '';
    syncPhoto();
  });
  el.anon.addEventListener('change', () => { syncAnon(); if (!el.anon.checked) el.nick.focus({ preventScroll: true }); });
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
  /* Звёздное небо на фоне */
  (function sky() {
    const c = el.sky, x = c.getContext('2d');
    if (!x) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, d = 1, stars = [], shoot = null;
    const make = () => {
      d = Math.min(window.devicePixelRatio || 1, 2);
      w = c.width = Math.round(innerWidth * d);
      h = c.height = Math.round(innerHeight * d);
      const n = Math.min(240, Math.round(innerWidth * innerHeight / 5000));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: (Math.random() * .8 + .3) * d, a: Math.random() * 6.28, s: Math.random() * .025 + .006,
        vx: (Math.random() - .5) * .1 * d, vy: -(Math.random() * .14 + .03) * d,
      }));
    };
    const draw = () => {
      x.clearRect(0, 0, w, h);
      x.fillStyle = '#fff';
      for (const s of stars) {
        if (!still) {
          s.a += s.s; s.x += s.vx; s.y += s.vy;
          if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
          if (s.x < -4) s.x = w + 4; else if (s.x > w + 4) s.x = -4;
        }
        x.globalAlpha = .2 + .8 * Math.abs(Math.sin(s.a));
        x.beginPath(); x.arc(s.x, s.y, s.r, 0, 6.283); x.fill();
      }
      if (!still) {
        if (!shoot && Math.random() < .003) shoot = { x: Math.random() * w * .8, y: Math.random() * h * .4, t: 0 };
        if (shoot) {
          const k = 1 - shoot.t / 45, tx = shoot.x - 110 * d, ty = shoot.y - 48 * d;
          const g = x.createLinearGradient(shoot.x, shoot.y, tx, ty);
          g.addColorStop(0, 'rgba(255,255,255,' + k + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
          x.globalAlpha = 1; x.strokeStyle = g; x.lineWidth = 1.4 * d;
          x.beginPath(); x.moveTo(shoot.x, shoot.y); x.lineTo(tx, ty); x.stroke();
          shoot.x += 10 * d; shoot.y += 4.4 * d;
          if (++shoot.t > 45) shoot = null;
        }
        requestAnimationFrame(draw);
      }
    };
    make();
    addEventListener('resize', () => { make(); if (still) draw(); });
    draw();
  })();

  // тема, звук, поиск, теги, о продавце, параллакс
  applyTheme(store.get('raevyou:theme') || 'black');
  el.themeBtn.addEventListener('click', () => {
    const names = Object.keys(THEME_BG);
    applyTheme(names[(names.indexOf(el.html.dataset.theme) + 1) % names.length]);
  });
  el.soundBtn.textContent = soundOn ? '🔔' : '🔕';
  el.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    store.set('raevyou:sound', soundOn);
    el.soundBtn.textContent = soundOn ? '🔔' : '🔕';
    if (soundOn) { warmAudio(); ping(); }
  });
  $$('.qtag').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.t, cur = el.text.value.trim();
    if (cur.toLowerCase().includes(t.toLowerCase())) return;
    const next = (cur ? cur + '. ' : '') + t;
    if (next.length <= MAX_TEXT) { el.text.value = next; updateCounter(); }
  }));
  el.about.addEventListener('click', openAbout);
  const cl = contactLinks();
  if (cl.length) {
    el.contact.hidden = false;
    if (SELLER.telegram) { el.contact.href = cl[0].href; el.contact.target = '_blank'; el.contact.rel = 'noopener'; }
    else el.contact.addEventListener('click', (e) => { e.preventDefault(); cl[0].click(); });
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let px = 0, py = 0;
    const par = () => { el.sky.style.transform = 'translate(' + px.toFixed(1) + 'px,' + (py - scrollY * .04).toFixed(1) + 'px) scale(1.08)'; };
    addEventListener('pointermove', (e) => { px = -(e.clientX / innerWidth - .5) * 22; py = -(e.clientY / innerHeight - .5) * 22; par(); }, { passive: true });
    addEventListener('scroll', par, { passive: true });
    par();
  }

  syncFab();
  showSkeleton();
  refresh();

  if (!REMOTE) {
    console.warn('[RaevYoU] Демо-режим: заполните CONFIG в script.js, чтобы отзывы видели все.');
    setTimeout(() => toast('Демо-режим: отзывы видны только в этом браузере. Подключите базу — см. README.', 7000), 1800);
  }
})();
