/* ============================================================
   RaevYoU — логика сайта
   ============================================================ */
(function () {
  'use strict';

  const API = window.ReviewsAPI;
  const PREVIEW = !!window.RAEV_PREVIEW;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const STAR_PATH = 'M12 2.5l2.95 6.1 6.7.9-4.9 4.65 1.2 6.65L12 17.5l-5.95 3.3 1.2-6.65-4.9-4.65 6.7-.9z';
  const star = on => '<svg class="star' + (on ? ' on' : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
  const starsHTML = v => { const r = Math.round(v); let s = ''; for (let i = 1; i <= 5; i++) s += star(i <= r); return s; };
  const plural = (n, a, b, c) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
    return c;
  };
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     Звёздное небо на фоне
     ============================================================ */
  (function sky() {
    const c = $('#sky'); if (!c) return;
    const ctx = c.getContext('2d');
    let w, h, stars = [], shoot = null, nextShoot = performance.now() + 5000;
    const LINK = 130;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      c.width = w * dpr; c.height = h * dpr;
      c.style.width = w + 'px'; c.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(110, Math.floor(w * h / 14000));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .14, vy: (Math.random() - .5) * .14,
        r: Math.random() * 1.1 + .35,
        t: Math.random() * 6.28, ts: .006 + Math.random() * .014
      }));
      if (reduceMotion) draw(performance.now());
    }

    function draw(now) {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (!reduceMotion) {
          s.x += s.vx; s.y += s.vy; s.t += s.ts;
          if (s.x < -10) s.x = w + 10; else if (s.x > w + 10) s.x = -10;
          if (s.y < -10) s.y = h + 10; else if (s.y > h + 10) s.y = -10;
        }
        const a = .3 + .25 * Math.sin(s.t);
        ctx.fillStyle = 'rgba(255,205,72,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.strokeStyle = 'rgba(255,255,255,' + ((1 - d / LINK) * .13).toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(stars[i].x, stars[i].y); ctx.lineTo(stars[j].x, stars[j].y); ctx.stroke();
          }
        }
      }
      if (!reduceMotion) {
        if (!shoot && now > nextShoot) {
          shoot = { x: Math.random() * w * .8, y: Math.random() * h * .4, vx: 7, vy: 3.2, life: 0 };
          nextShoot = now + 8000 + Math.random() * 9000;
        }
        if (shoot) {
          shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life++;
          const a = Math.max(0, 1 - shoot.life / 50) * .5;
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 9, shoot.y - shoot.vy * 9);
          g.addColorStop(0, 'rgba(255,205,72,' + a + ')'); g.addColorStop(1, 'rgba(255,205,72,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 9, shoot.y - shoot.vy * 9); ctx.stroke();
          if (shoot.life > 50) shoot = null;
        }
      }
    }

    function loop(now) { draw(now); requestAnimationFrame(loop); }
    window.addEventListener('resize', resize);
    resize();
    if (!reduceMotion) requestAnimationFrame(loop);
  })();

  /* ============================================================
     Вкладки
     ============================================================ */
  const TABS = ['home', 'reviews', 'guarantees', 'how', 'faq'];
  const panels = {};
  TABS.forEach(t => { panels[t] = $('#tab-' + t); });
  const navLinks = $$('#nav a');
  const navInd = $('#navInd');
  let current = null, timer = null;

  function moveInd() {
    const a = $('#nav a.active');
    if (!a) return;
    navInd.style.width = a.offsetWidth + 'px';
    navInd.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    const nav = $('#nav');
    if (nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: a.offsetLeft - 24, behavior: 'smooth' });
    }
  }

  function show(name) {
    const next = panels[name];
    if (!next || next === current) return;
    clearTimeout(timer);
    TABS.forEach(t => {
      const p = panels[t];
      if (p !== current && p !== next) { p.hidden = true; p.classList.remove('active', 'leaving'); }
    });
    const prev = current;
    current = next;
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.tab === name));
    moveInd();
    document.title = (name === 'home' ? '' : $('#nav a.active').textContent + ' — ') + 'RaevYoU';

    const enter = () => {
      next.hidden = false;
      next.classList.remove('leaving');
      void next.offsetWidth;
      next.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    if (prev) {
      prev.classList.remove('active');
      prev.classList.add('leaving');
      timer = setTimeout(() => { prev.hidden = true; prev.classList.remove('leaving'); enter(); }, reduceMotion ? 0 : 190);
    } else enter();
  }

  function route() {
    const h = (location.hash || '#home').slice(1);
    show(TABS.includes(h) ? h : 'home');
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', moveInd);

  /* ============================================================
     Анимированные числа
     ============================================================ */
  function countTo(el, to, dec, suffix) {
    suffix = suffix || '';
    const from = el._v || 0;
    el._v = to;
    if (reduceMotion || from === to) { el.textContent = to.toFixed(dec).replace('.', ',') + suffix; return; }
    const t0 = performance.now(), dur = 1000;
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * e;
      el.textContent = v.toFixed(dec).replace('.', ',') + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ============================================================
     Отзывы и статистика
     ============================================================ */
  const PAGE = 10;
  const state = { all: [], filter: 0, limit: PAGE, loading: true, error: null };
  const listEl = $('#list');
  const moreBtn = $('#moreBtn');

  // Строки гистограммы
  const barsEl = $('#statBars');
  for (let n = 5; n >= 1; n--) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = '<b>' + n + ' ★</b><div class="bar-track"><div class="bar-fill" data-bar="' + n + '"></div></div><span class="cnt" data-cnt="' + n + '">0</span>';
    barsEl.appendChild(row);
  }

  function calc() {
    const c = [0, 0, 0, 0, 0, 0];
    let sum = 0;
    state.all.forEach(r => { c[r.rating]++; sum += r.rating; });
    const t = state.all.length;
    return { t, c, avg: t ? sum / t : 0, pos: t ? Math.round((c[4] + c[5]) / t * 100) : 0 };
  }

  function renderStats() {
    const s = calc();
    const set = (k, fn) => $$('[data-stat="' + k + '"]').forEach(fn);
    set('avg', el => s.t ? countTo(el, s.avg, 1) : (el.textContent = '—'));
    set('avg-mini', el => (el.textContent = s.t ? s.avg.toFixed(1).replace('.', ',') : '—'));
    set('stars', el => (el.innerHTML = starsHTML(s.avg)));
    set('count', el => (el.textContent = s.t ? s.t + ' ' + plural(s.t, 'отзыв', 'отзыва', 'отзывов') : 'Пока нет отзывов'));
    set('count-mini', el => (el.textContent = s.t + ' ' + plural(s.t, 'отзыв', 'отзыва', 'отзывов')));
    set('pct', el => s.t ? countTo(el, s.pos, 0, '%') : (el.textContent = '—'));
    set('five', el => s.t ? countTo(el, s.c[5], 0) : (el.textContent = '—'));
    $$('[data-bar]').forEach(el => {
      const n = +el.dataset.bar;
      el.style.width = (s.t ? s.c[n] / s.t * 100 : 0) + '%';
    });
    $$('[data-cnt]').forEach(el => { el.textContent = s.c[+el.dataset.cnt]; });
  }

  const USER_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-4 3.8-6 7.5-6s6.9 2 7.5 6"/></svg>';

  function card(r, i) {
    const el = document.createElement('article');
    el.className = 'review';
    el.style.animationDelay = Math.min(i, 8) * 55 + 'ms';

    const head = document.createElement('div'); head.className = 'r-head';
    const av = document.createElement('div');
    av.className = 'avatar' + (r.anonymous ? ' anon' : '');
    if (r.anonymous) av.innerHTML = USER_SVG;
    else av.textContent = (Array.from(r.name)[0] || '?').toUpperCase();
    const meta = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'r-name'; nm.textContent = r.anonymous ? 'Аноним' : r.name;
    const dt = document.createElement('div'); dt.className = 'r-date';
    const d = new Date(r.created_at);
    dt.textContent = isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    meta.append(nm, dt); head.append(av, meta);

    const st = document.createElement('div'); st.className = 'r-stars'; st.innerHTML = starsHTML(r.rating);
    st.setAttribute('aria-label', 'Оценка ' + r.rating + ' из 5');

    const tx = document.createElement('p');
    tx.className = 'r-text' + (r.text ? '' : ' empty');
    tx.textContent = r.text || 'Оценка без комментария';

    el.append(head, st, tx);
    return el;
  }

  function renderList() {
    listEl.replaceChildren();
    moreBtn.hidden = true;

    if (state.loading) {
      for (let i = 0; i < 4; i++) { const s = document.createElement('div'); s.className = 'skel'; listEl.appendChild(s); }
      return;
    }
    if (state.error) {
      const box = document.createElement('div'); box.className = 'state';
      const notCfg = state.error.code === 'not_configured';
      box.innerHTML = '<h3>' + (notCfg ? 'Supabase не подключён' : 'Не удалось загрузить отзывы') + '</h3><p></p>';
      $('p', box).textContent = notCfg
        ? 'Откройте файл supabase.js и вставьте URL проекта и публичный ключ.'
        : (state.error.message || 'Попробуйте обновить страницу.');
      if (!notCfg) {
        const b = document.createElement('button'); b.className = 'btn btn-ghost'; b.type = 'button'; b.textContent = 'Повторить';
        b.addEventListener('click', load); box.appendChild(b);
      }
      listEl.appendChild(box);
      return;
    }

    const items = state.all.filter(r => !state.filter || r.rating === state.filter);
    if (!items.length) {
      const box = document.createElement('div'); box.className = 'state';
      box.innerHTML = '<h3>' + (state.all.length ? 'Нет отзывов с такой оценкой' : 'Пока нет отзывов') + '</h3><p>' +
        (state.all.length ? 'Попробуйте выбрать другой фильтр.' : 'Станьте первым, кто поделится впечатлением.') + '</p>';
      if (!state.all.length) {
        const b = document.createElement('button'); b.className = 'btn btn-white'; b.type = 'button'; b.textContent = 'Написать отзыв';
        b.addEventListener('click', openModal); box.appendChild(b);
      }
      listEl.appendChild(box);
      return;
    }
    items.slice(0, state.limit).forEach((r, i) => listEl.appendChild(card(r, i)));
    moreBtn.hidden = items.length <= state.limit;
  }

  async function load() {
    state.loading = true; state.error = null; renderList();
    try { state.all = await API.list(); }
    catch (e) { state.error = e; state.all = []; }
    state.loading = false;
    renderStats(); renderList();
  }

  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    $$('.chip').forEach(x => x.classList.toggle('active', x === b));
    state.filter = +b.dataset.f; state.limit = PAGE; renderList();
  });
  moreBtn.addEventListener('click', () => { state.limit += PAGE; renderList(); });

  /* ============================================================
     FAQ
     ============================================================ */
  $('#faq').addEventListener('click', e => {
    const q = e.target.closest('.q'); if (!q) return;
    const qa = q.parentElement, open = !qa.classList.contains('open');
    qa.classList.toggle('open', open);
    q.setAttribute('aria-expanded', String(open));
  });

  /* ============================================================
     Поля с анимацией появления букв
     ============================================================ */
  function animatedField(field) {
    const mirror = document.createElement('div');
    mirror.className = 'mirror' + (field.tagName === 'INPUT' ? ' single' : '');
    mirror.setAttribute('aria-hidden', 'true');
    field.parentElement.appendChild(mirror);
    let prev = field.value;

    function render(from, to) {
      const v = field.value;
      const frag = document.createDocumentFragment();
      let buf = '', idx = 0;
      const flush = () => { if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; } };
      for (const ch of v) {
        const fresh = !reduceMotion && idx >= from && idx < to && ch !== ' ' && ch !== '\n';
        if (fresh) {
          flush();
          const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; frag.appendChild(s);
        } else buf += ch;
        idx += ch.length;
      }
      flush();
      if (v.endsWith('\n')) frag.appendChild(document.createTextNode('\u200b'));
      mirror.replaceChildren(frag);
      sync();
    }
    function sync() { mirror.scrollTop = field.scrollTop; mirror.scrollLeft = field.scrollLeft; }

    field.addEventListener('input', () => {
      const a = prev, b = field.value;
      const min = Math.min(a.length, b.length);
      let s = 0; while (s < min && a[s] === b[s]) s++;
      let e = 0; while (e < min - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
      prev = b;
      render(s, b.length - e);
    });
    ['scroll', 'keyup', 'click', 'focus'].forEach(ev => field.addEventListener(ev, sync));
    field.reset = () => { prev = ''; field.value = ''; render(0, 0); };
  }

  /* ============================================================
     Окно «Написать отзыв»
     ============================================================ */
  const modal = $('#modal');
  const fName = $('#fName'), fText = $('#fText'), fAnon = $('#fAnon');
  const nameBox = $('#nameBox');
  const detailsWrap = $('#detailsWrap'), submitWrap = $('#submitWrap');
  const fHint = $('#fHint'), fError = $('#fError'), fSubmit = $('#fSubmit');
  const rateLabel = $('#rateLabel'), counter = $('#counter');
  const starsIn = $('#starsIn');
  const LABELS = ['', 'Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
  let rating = 0, hover = 0, lastFocus = null, sending = false, editingReview = null;

  animatedField(fName);
  animatedField(fText);

  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sbtn'; b.dataset.v = i;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.setAttribute('aria-label', i + ' ' + plural(i, 'звезда', 'звезды', 'звёзд') + ' — ' + LABELS[i]);
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + STAR_PATH + '"/></svg>';
    starsIn.appendChild(b);
  }
  const sbtns = $$('.sbtn', starsIn);

  function paintStars() {
    const v = hover || rating;
    sbtns.forEach((b, i) => {
      b.classList.toggle('lit', i < v);
      b.setAttribute('aria-checked', String(i + 1 === rating));
    });
    const shown = hover || rating;
    rateLabel.textContent = shown ? LABELS[shown] : 'Нажмите на звезду';
    rateLabel.classList.toggle('set', !!shown);
  }

  function setOpen(wrap, open) {
    wrap.classList.toggle('open', open);
    if (open) wrap.removeAttribute('inert'); else wrap.setAttribute('inert', '');
  }

  function canSubmit() { return rating > 0 && (fAnon.checked || fName.value.trim().length > 0); }

  function update() {
    setOpen(detailsWrap, rating > 0);
    const ok = canSubmit();
    setOpen(submitWrap, ok);
    fHint.classList.toggle('show', rating > 0 && !ok);
    counter.textContent = fText.value.length + ' / 500';
  }

  starsIn.addEventListener('mouseover', e => {
    const b = e.target.closest('.sbtn'); if (!b) return;
    hover = +b.dataset.v; paintStars();
  });
  starsIn.addEventListener('mouseleave', () => { hover = 0; paintStars(); });
  starsIn.addEventListener('click', e => {
    const b = e.target.closest('.sbtn'); if (!b) return;
    rating = +b.dataset.v; hover = 0;
    sbtns.forEach(x => x.classList.remove('pop'));
    void b.offsetWidth; b.classList.add('pop');
    paintStars(); update();
    if (!fText.value && detailsWrap.classList.contains('open')) {
      setTimeout(() => { if (modal.classList.contains('open') && fAnon.checked !== undefined) fText.focus({ preventScroll: true }); }, 450);
    }
  });
  starsIn.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); rating = Math.min(5, (rating || 0) + 1); paintStars(); update(); sbtns[rating - 1].focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); rating = Math.max(1, (rating || 2) - 1); paintStars(); update(); sbtns[rating - 1].focus(); }
  });

  fName.addEventListener('input', update);
  fText.addEventListener('input', update);
  fAnon.addEventListener('change', () => {
    nameBox.classList.toggle('disabled', fAnon.checked);
    fName.disabled = fAnon.checked;
    update();
  });

  function resetForm() {
    rating = 0; hover = 0; sending = false; editingReview = null;
    fName.reset(); fText.reset();
    fAnon.checked = false; fName.disabled = false; nameBox.classList.remove('disabled');
    fError.hidden = true; fSubmit.disabled = false; fSubmit.textContent = 'Оставить отзыв';
    $('#mForm').hidden = false; $('#mDone').hidden = true;
    $('#mDone h2').textContent = 'Спасибо за отзыв!';
    $('#mDone p').textContent = 'Он уже появился на странице.';
    setOpen(detailsWrap, false); setOpen(submitWrap, false);
    paintStars(); update();
  }

  function showAlready() {
    $('#mForm').hidden = true; $('#mDone').hidden = false;
    $('#mDone h2').textContent = 'Вы уже оставили отзыв';
    $('#mDone p').textContent = 'С одного устройства можно оставить только один отзыв. Спасибо!';
  }

  async function openModal() {
    lastFocus = document.activeElement;
    resetForm();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lock');
    try {
      const mine = await API.mine();
      if (mine) {
        editingReview = mine;
        fName.value = mine.anonymous ? '' : (mine.name || '');
        fName.dispatchEvent(new Event('input'));
        fText.value = mine.text || '';
        fText.dispatchEvent(new Event('input'));
        fAnon.checked = !!mine.anonymous;
        fAnon.dispatchEvent(new Event('change'));
        rating = mine.rating || 0;
        paintStars(); update();
        fSubmit.textContent = 'Сохранить изменения';
        $('#mDone h2').textContent = 'Редактирование отзыва';
      }
    } catch (e) {
      fError.textContent = e.message || 'Не удалось проверить ваш отзыв';
      fError.hidden = false;
    }
    setTimeout(() => fName.focus({ preventScroll: true }), 350);
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-review]')) { e.preventDefault(); openModal(); }
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  // Один отзыв на анонимного пользователя Supabase; существующий отзыв можно редактировать.
  fSubmit.addEventListener('click', async () => {
    if (sending || !canSubmit()) return;
    fError.hidden = true;
    sending = true; fSubmit.disabled = true; fSubmit.textContent = 'Сохраняем…';
    try {
      const payload = { name: fName.value, anonymous: fAnon.checked, rating, text: fText.value };
      const editing = !!editingReview;
      if (editing) await API.update({ ...payload, id: editingReview.id });
      else await API.create(payload);
      $('#mForm').hidden = true; $('#mDone').hidden = false;
      $('#mDone h2').textContent = editing ? 'Изменения сохранены' : 'Спасибо за отзыв!';
      $('#mDone p').textContent = editing ? 'Ваш отзыв обновлён.' : 'Ваш отзыв опубликован.';
      load();
      setTimeout(() => { closeModal(); toast(editing ? 'Изменения сохранены' : 'Отзыв опубликован'); }, 1400);
    } catch (e) {
      fError.textContent = e.message || 'Не удалось сохранить отзыв';
      fError.hidden = false;
      fSubmit.disabled = false;
      fSubmit.textContent = editingReview ? 'Сохранить изменения' : 'Оставить отзыв';
      sending = false;
    }
  });

  /* ============================================================
     Уведомление
     ============================================================ */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ============================================================
     Запуск
     ============================================================ */
  $('#year').textContent = new Date().getFullYear();
  if (PREVIEW) {
    const b = document.createElement('div');
    b.className = 'preview-badge';
    b.textContent = 'Демо · сбросить';
    b.style.cursor = 'pointer';
    b.addEventListener('click', () => {
      try { localStorage.removeItem('raev_preview_reviews_v1'); localStorage.removeItem('raev_preview_reviewed'); } catch (e) {}
      document.cookie = 'raev_preview_reviewed=; max-age=0; path=/';
      location.reload();
    });
    document.body.appendChild(b);
  }
  resetForm();
  route();
  load();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);
  window.addEventListener('load', moveInd);
})();
