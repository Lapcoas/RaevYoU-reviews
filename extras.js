/* RaevYoU — интерфейс: вкладки, переходы, меню, акценты, эффекты.
   Логика отзывов (Supabase) остаётся в script.js без изменений. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
  };
  const VIEWS = ['home', 'reviews', 'trust', 'how', 'faq', 'contact'];
  const tabs = $$('.tab'), ind = $('#ind'), wipe = $('#wipe'), menu = $('#menu'), menuBtn = $('#menuBtn');
  const canHover = matchMedia('(hover: hover)').matches;
  let cur = 'home', busy = false;
  let calm = ls.get('rv:calm') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm) root.classList.add('calm');

  const toast = (m) => {
    const t = $('#toast');
    t.textContent = m; t.classList.add('is-on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('is-on'), 2600);
  };

  /* ---------- появление блоков при прокрутке ---------- */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .12 });
  const reveal = () => $$('.view.is-on .rv:not(.in)').forEach((n) => io.observe(n));

  /* ---------- вкладки ---------- */
  function moveInd() {
    const t = $('.tab.is-on');
    if (!t) return;
    ind.style.width = Math.max(12, t.offsetWidth - 26) + 'px';
    ind.style.transform = 'translateX(' + (t.offsetLeft + 13) + 'px)';
    t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }
  function show(v) {
    cur = v;
    $$('.view').forEach((s) => s.classList.toggle('is-on', s.dataset.view === v));
    tabs.forEach((b) => b.classList.toggle('is-on', b.dataset.go === v));
    scrollTo({ top: 0, behavior: 'instant' });
    moveInd(); reveal();
    document.title = (v === 'home' ? '' : $('.tab.is-on').textContent.replace(/\d+$/, '').trim() + ' · ') + 'RaevYoU';
  }
  function setHash(v) { try { history.replaceState(null, '', '#' + v); } catch (e) { /* ничего */ } }
  function go(v) {
    if (!VIEWS.includes(v) || v === cur || busy) return;
    closeMenu();
    if (calm) { show(v); setHash(v); return; }
    busy = true;
    const old = $('.view.is-on');
    old.classList.add('is-out');
    setTimeout(() => { old.classList.remove('is-out'); show(v); setHash(v); busy = false; }, 260);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });

  /* ---------- меню из трёх точек ---------- */
  function openMenu() {
    menu.inert = false; menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false'); menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.classList.remove('is-open'); menu.inert = true;
    menu.setAttribute('aria-hidden', 'true'); menuBtn.setAttribute('aria-expanded', 'false');
  }
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.contains('is-open') ? closeMenu() : openMenu(); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });
  $('#aboutBtn').addEventListener('click', closeMenu);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'review') { closeMenu(); $('#fab').click(); }
    if (a === 'top') { closeMenu(); scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); }
    if (a === 'copy') {
      closeMenu();
      navigator.clipboard.writeText(location.origin + location.pathname)
        .then(() => toast('Ссылка на сайт скопирована')).catch(() => toast('Не удалось скопировать'));
    }
    if (a === 'calm') {
      calm = !calm; root.classList.toggle('calm', calm); ls.set('rv:calm', calm ? '1' : '0');
      toast(calm ? 'Спокойный режим включён' : 'Анимации включены'); reveal();
    }
  });

  /* ---------- горячие клавиши ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
    if (e.ctrlKey || e.metaKey || e.altKey || root.classList.contains('is-locked')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'т') { e.preventDefault(); $('#fab').click(); }
    const i = Number(e.key);
    if (i >= 1 && i <= VIEWS.length) go(VIEWS[i - 1]);
  });

  /* ---------- прогресс прокрутки и подсветка за курсором ---------- */
  const prog = $('#prog');
  let tick = false;
  addEventListener('scroll', () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      const h = root.scrollHeight - innerHeight;
      prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')';
      tick = false;
    });
  }, { passive: true });

  if (canHover) {
    let raf = 0;
    addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => { root.style.setProperty('--mx', e.clientX + 'px'); root.style.setProperty('--my', e.clientY + 'px'); raf = 0; });
    });
    // лёгкий 3D-наклон карточек
    const grid = $('#grid');
    grid.addEventListener('pointermove', (e) => {
      if (calm || e.pointerType !== 'mouse') return;
      const c = e.target.closest('.card:not(.card--skeleton)');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 5 + 'deg');
      c.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 4 + 'deg');
    });
    grid.addEventListener('pointerout', (e) => {
      const c = e.target.closest('.card');
      if (c) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
    });
  }

  /* ---------- живые цифры на главной и бейдж на вкладке ---------- */
  function syncStats() {
    const avg = $('#sumAvg').textContent, n = parseInt($('#sumCount').textContent, 10), hp = ($('#sumHappy').textContent.match(/\d+%/) || [''])[0];
    $('#st1').textContent = avg;
    $('#st2').textContent = isNaN(n) ? '—' : n;
    $('#st3').textContent = hp || '—';
    const badge = $('#tabN');
    badge.hidden = isNaN(n) || n < 1;
    if (!badge.hidden) badge.textContent = n;
    moveInd();
  }
  const mo = new MutationObserver(syncStats);
  ['#sumAvg', '#sumCount', '#sumHappy'].forEach((s) => mo.observe($(s), { childList: true, characterData: true, subtree: true }));

  /* ---------- контакты ---------- */
  $('#noContact').hidden = !$('#contactBtn').hidden;

  /* ---------- мягкое появление набираемых букв ---------- */
  (function ghost() {
    const ta = $('#text'), wrap = document.createElement('div'), m = document.createElement('div'), tail = document.createElement('span');
    wrap.className = 'tw'; m.className = 'tw__m'; m.setAttribute('aria-hidden', 'true'); tail.textContent = '\u200b';
    ta.parentNode.insertBefore(wrap, ta); wrap.append(m, ta); m.append(tail);
    let prev = '';
    const add = (str, anim) => {
      const f = document.createDocumentFragment();
      for (const ch of str) { const s = document.createElement('span'); s.textContent = ch; if (anim) s.className = 'n'; f.append(s); }
      m.insertBefore(f, tail);
    };
    function sync() {
      const v = ta.value;
      if (v !== prev) {
        if (v.length > prev.length && v.startsWith(prev)) add(v.slice(prev.length), true);
        else { while (m.firstChild !== tail) m.removeChild(m.firstChild); add(v, false); }
        prev = v;
      }
      m.scrollTop = ta.scrollTop;
    }
    ta.addEventListener('input', sync);
    ta.addEventListener('scroll', () => { m.scrollTop = ta.scrollTop; });
    new MutationObserver(sync).observe($('#counter'), { childList: true, characterData: true, subtree: true });
    sync();
  })();

  /* ---------- старт ---------- */
  const h = location.hash.slice(1);
  if (h.startsWith('r-')) show('reviews'); else if (VIEWS.includes(h)) show(h); else reveal();
  addEventListener('resize', moveInd);
  const hidePre = () => setTimeout(() => { $('#pre').classList.add('off'); moveInd(); }, 450);
  if (document.readyState === 'complete') hidePre(); else addEventListener('load', hidePre);
  setTimeout(() => $('#pre').classList.add('off'), 3000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);

})();
