/**
 * ============================================================
 * main.js · 交互核心
 * ------------------------------------------------------------
 * 职责：主题 / 玻璃开关 / 首访欢迎 / 头像丝滑展开 /
 *        项目拉取（骨架屏）/ 滚动揭示 /
 *        指针系统：视差景深 + 3D 倾斜追光 + 磁性吸附。
 * 全部动效仅用 transform/opacity，统一 rAF 弹簧插值，
 * 目标 OriginOS 6 级丝滑；prefers-reduced-motion 下自动降级。
 * ============================================================
 */
(function () {
  'use strict';

  const C = CONFIG;
  const byId = (id) => document.getElementById(id);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;   // 手机/平板

  /* ================= 浪潮过渡 =================
   * 切换主题 / 材质时，新画面以按钮为圆心像浪潮般扩散覆盖全屏
   * （View Transitions API）；不支持的浏览器自动回退为直接切换。 */
  function withWave(applyFn, originEl) {
    if (REDUCED || !document.startViewTransition) { applyFn(); return; }
    const r = originEl ? originEl.getBoundingClientRect()
                       : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const vt = document.startViewTransition(applyFn);
    vt.ready.then(() => {
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => { /* 过渡被打断时忽略 */ });
  }

  /* ================= 主题：深浅色 =================
   * 默认跟随系统（auto）；点击右上角按钮手动切换 light / dark 并
   * 持久化，此后不再跟随系统，直到用户清除 theme_mode。 */
  function initTheme() {
    const btn = byId('theme-toggle');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const mode = localStorage.getItem(C.theme.storageKey) || 'auto';
      const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
      document.body.classList.toggle('dark', dark);
      // 图标：浅色时显示月亮（点击转深色），深色时显示太阳
      btn.setAttribute('aria-pressed', String(mode !== 'auto'));
    };
    btn.addEventListener('click', () => {
      const mode = localStorage.getItem(C.theme.storageKey) || 'auto';
      const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
      withWave(() => {
        try { localStorage.setItem(C.theme.storageKey, dark ? 'light' : 'dark'); } catch (e) { /* 忽略 */ }
        apply();
      }, btn);
    });
    const onSys = () => { if ((localStorage.getItem(C.theme.storageKey) || 'auto') === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
    apply();
  }

  /* ================= 液态玻璃开关 =================
   * 默认启用；仅当用户显式关闭过（localStorage）才禁用。 */
  function initGlassToggle() {
    const btn = byId('glass-toggle');
    const refresh = () => {
      const on = localStorage.getItem(C.glass.storageKey) !== 'disabled';
      document.body.classList.toggle('glass-enabled', on);
      btn.setAttribute('aria-pressed', String(on));
    };
    btn.addEventListener('click', () => {
      const on = localStorage.getItem(C.glass.storageKey) === 'disabled';
      withWave(() => {
        try { localStorage.setItem(C.glass.storageKey, on ? 'enabled' : 'disabled'); } catch (e) { /* 忽略 */ }
        refresh();
      }, btn);
    });
    refresh();
  }

  /* ================= 静态内容挂载 ================= */
  function mountStatic() {
    document.title = C.site.pageTitle;

    byId('hero-name').textContent = C.hero.name;
    byId('hero-motto').textContent = C.hero.motto;
    byId('scroll-hint-text').textContent = C.hero.scrollHint;

    byId('about-kicker').textContent = C.hero.about.kicker;
    byId('about-title').textContent = C.hero.about.title;
    byId('about-text').textContent = C.hero.about.text;
    const gh = byId('about-github');
    gh.textContent = C.hero.about.githubLabel;
    gh.href = C.creation.githubUrl;

    byId('creation-kicker').textContent = C.creation.kicker;
    byId('creation-title').textContent = C.creation.title;
    byId('creation-text').textContent = C.creation.text;
    const cgh = byId('creation-github');
    cgh.textContent = C.creation.githubLabel;
    cgh.href = C.creation.githubUrl;

    byId('projects-kicker').textContent = C.projects.kicker;
    byId('projects-title').textContent = C.projects.title;

    const fgh = byId('footer-github');
    fgh.textContent = C.footer.githubLabel;
    fgh.href = C.footer.githubUrl;
    byId('footer-copy').textContent = C.footer.copyright;
    const ogh = byId('orb-github');
    ogh.href = C.footer.githubUrl;

    byId('modal-title').textContent = C.modal.title;
    byId('modal-text').textContent = C.modal.text;
    byId('modal-btn').textContent = C.modal.button;
  }

  /* ================= 首访欢迎（仅首次） ================= */
  function initWelcome() {
    const modal = byId('modal');
    const v = localStorage.getItem(C.firstVisit.storageKey);
    const isValidISO = typeof v === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
      && !Number.isNaN(Date.parse(v));
    if (isValidISO) return;                       // 老访客直接进入
    try { localStorage.setItem(C.firstVisit.storageKey, new Date().toISOString()); } catch (e) { /* 忽略 */ }

    const reveal = () => modal.classList.add('show');
    modal.hidden = false;
    void modal.offsetWidth;           // 强制回流：过渡从关闭态平滑开始
    reveal();
    byId('modal-btn').addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => { modal.hidden = true; }, 450);
    });
  }

  /* ================= 头像：点击丝滑展开自我介绍 ================= */
  function initAvatar() {
    const avatar = byId('avatar');
    const card = byId('about-card');
    let open = false;
    let timer = null;

    function show() {
      clearTimeout(timer);
      card.classList.add('open');     // 卡片常驻渲染，直接展开（材质已预热）
      avatar.setAttribute('aria-expanded', 'true');
      open = true;
    }
    function hide() {
      if (!open) return;
      card.classList.remove('open');
      avatar.setAttribute('aria-expanded', 'false');
      open = false;
    }

    avatar.addEventListener('click', (e) => { e.stopPropagation(); open ? hide() : show(); });
    byId('about-fold').addEventListener('click', hide);
    card.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    // 滚动离开首屏时自动收起（详情卡固定跟随身份栏，不应悬在后续屏幕上）
    window.addEventListener('scroll', () => {
      if (open && window.scrollY > 60) hide();
    }, { passive: true });
  }

  /* ================= 滚动揭示（进入视口浮起） ================= */
  function initReveal() {
    const els = Array.from(document.querySelectorAll('.reveal'));
    // 同屏内的元素按序错峰
    document.querySelectorAll('.scene').forEach((scene) => {
      scene.querySelectorAll('.reveal').forEach((el, i) => {
        el.style.setProperty('--rd', (i * 0.12).toFixed(2) + 's');
      });
    });
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.22 });
    els.forEach((el) => io.observe(el));
  }

  /* ================= 项目拉取（GitHub 实时 + 骨架屏） ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function fmtStars(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

  async function initProjects() {
    const grid = byId('project-grid');
    const fallbackEl = byId('project-fallback');
    try {
      const res = await fetch(C.projects.apiBase + '/users/' + C.projects.owner + '/repos?per_page=100', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error('repos ' + res.status);
      const repos = await res.json();

      const cards = C.projects.repos
        .map((name) => ({ name: name, repo: repos.find((r) => r.name.toLowerCase() === name.toLowerCase()) }))
        .filter((x) => x.repo);
      if (cards.length === 0) throw new Error('no repos matched');

      grid.innerHTML = '';
      cards.forEach((item, i) => {
        const repo = item.repo;
        const desc = repo.description || C.projects.repoDescs[item.name] || C.projects.noDesc;
        const lang = repo.language ? '<span class="pill">' + esc(repo.language) + '</span>' : '';
        const star = '<span class="pill star">★ ' + fmtStars(repo.stargazers_count || 0) + '</span>';

        const a = document.createElement('a');
        a.className = 'project-card glass-panel tilt reveal';
        a.href = repo.html_url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.setProperty('--rd', (i * 0.09).toFixed(2) + 's');
        a.innerHTML =
          '<i class="glare" aria-hidden="true"></i>'
          + '<strong class="project-name">' + esc(repo.name)
          + '<span class="arrow">→</span></strong>'
          + '<p class="project-desc">' + esc(desc) + '</p>'
          + '<div class="project-meta">' + lang + star + '</div>';
        grid.appendChild(a);
        registerTilt(a);          // 3D 倾斜 + 追光
      });
      // 强制回流后加入揭示动画（避免依赖 rAF）
      void grid.offsetWidth;
      grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    } catch (e) {
      grid.innerHTML = '';
      fallbackEl.hidden = false;
      fallbackEl.textContent = C.projects.fallback;
    }
  }

  /* ================= 指针系统 =================
   * 一条 rAF 弹簧插值循环统一驱动：
   *  · 视差景深（漂浮玻璃珠 / 首屏内容反向微移）
   *  · 3D 倾斜（卡片朝向指针，回弹归位）
   *  · 追光（--gx/--gy 平滑跟随）
   *  · 磁性吸附（按钮在半径内向指针微移） */
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, has: false };   // x/y 目标，sx/sy 平滑值
  const orbs = [];        // { el, depth }
  const tilts = new Map();// el -> { glare, rx, ry, tx, ty, gx, gy, tgx, tgy }
  const magnets = [];     // { el, cx, cy, x, y }

  function registerTilt(el) {
    if (REDUCED || !FINE_POINTER || tilts.has(el)) return;   // 触屏不做倾斜追光
    const glare = el.querySelector('.glare');
    const st = { glare: glare, rx: 0, ry: 0, trx: 0, tryy: 0, gx: 50, gy: 40, tgx: 50, tgy: 40 };
    tilts.set(el, st);

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const nx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
      const ny = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
      st.tryy = nx * 6;            // rotateY 目标
      st.trx = -ny * 6;            // rotateX 目标
      st.tgx = clamp((nx + 1) / 2 * 100, 0, 100);
      st.tgy = clamp((ny + 1) / 2 * 100, 0, 100);
    });
    el.addEventListener('pointerleave', () => {
      st.trx = 0; st.tryy = 0; st.tgx = 50; st.tgy = 40;
    });
  }

  function registerMagnet(el) {
    if (REDUCED || !FINE_POINTER || !el || magnets.some((m) => m.el === el)) return;   // 触屏不做磁性
    magnets.push({ el: el, cx: 0, cy: 0, x: 0, y: 0 });
  }

  function initPointer() {
    // 珠子不参与视差漂移：移动的点击目标会让人点不中（视差由背景承担）
    document.querySelectorAll('.tilt').forEach(registerTilt);
    document.querySelectorAll('.magnetic').forEach(registerMagnet);

    if (!IS_TOUCH) {
      window.addEventListener('pointermove', (e) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        pointer.has = true;
      }, { passive: true });
    }

    // 磁性按钮的中心缓存（滚动/缩放后刷新，避免逐帧重排）
    let rectTimer = null;
    function refreshRects() {
      magnets.forEach((m) => {
        const r = m.el.getBoundingClientRect();
        m.cx = r.left + r.width / 2;
        m.cy = r.top + r.height / 2;
      });
    }
    window.addEventListener('scroll', () => {
      clearTimeout(rectTimer);
      rectTimer = setTimeout(refreshRects, 160);
    }, { passive: true });
    window.addEventListener('resize', refreshRects);
    // 磁性目标随页面滚动变化，直接在循环里用缓存中心 + 当前指针视口坐标
    let mouseVX = 0, mouseVY = 0;
    window.addEventListener('pointermove', (e) => { mouseVX = e.clientX; mouseVY = e.clientY; }, { passive: true });

    if (REDUCED) return;   // 移动端也进入本循环：动画固定播放（自律漂移）

    const R = 110;   // 磁性吸附半径
    // 移动端 30fps 节流（桌面满帧）
    const PULSE_MS = FINE_POINTER ? 0 : 33;
    let lastPulse = 0;
    let lastSx = 99, lastSy = 99;   // 脏检查：无变化不写 DOM
    function frame(now) {
      if (PULSE_MS && now - lastPulse < PULSE_MS - 3) { requestAnimationFrame(frame); return; }
      lastPulse = now;
      // 移动端动画固定播放：利萨如曲线自律漂移（无需任何交互）
      if (IS_TOUCH) {
        const tt = now / 1000;
        pointer.x = Math.sin(tt * 0.32) * 0.45;
        pointer.y = Math.sin(tt * 0.21 + 1.2) * 0.3;
        pointer.has = true;
      }
      // 视差（弹簧插值到目标）
      pointer.sx = lerp(pointer.sx, pointer.has ? pointer.x : 0, 0.055);
      pointer.sy = lerp(pointer.sy, pointer.has ? pointer.y : 0, 0.055);
      if (Math.abs(pointer.sx - lastSx) > 0.0004 || Math.abs(pointer.sy - lastSy) > 0.0004) {
        lastSx = pointer.sx; lastSy = pointer.sy;
        orbs.forEach((o) => {
          o.el.style.transform =
            'translate3d(' + (pointer.sx * o.depth * 620).toFixed(2) + 'px,'
                          + (pointer.sy * o.depth * 460).toFixed(2) + 'px,0)';
        });
        // 背景反向微移（与内层 img 的运镜动画分层叠加）
        const heroBg = document.querySelector('.hero-bg');
        if (heroBg) {
          heroBg.style.transform =
            'scale(1.045) translate3d(' + (pointer.sx * -12).toFixed(2) + 'px,'
                                         + (pointer.sy * -9).toFixed(2) + 'px,0)';
        }
      }

      // 3D 倾斜 + 追光（首次介入时收掉 CSS 的 transform 过渡，避免双重平滑）
      tilts.forEach((st, el) => {
        st.rx = lerp(st.rx, st.trx, 0.12);
        st.ry = lerp(st.ry, st.tryy, 0.12);
        st.gx = lerp(st.gx, st.tgx, 0.14);
        st.gy = lerp(st.gy, st.tgy, 0.14);
        const lifting = (Math.abs(st.rx) + Math.abs(st.ry)) > 0.2;
        if (lifting && !st.engaged) {
          st.engaged = true;
          el.style.transition = 'box-shadow 0.45s var(--out), background-color 0.45s var(--out)';
        }
        el.style.transform =
          'perspective(900px) rotateX(' + st.rx.toFixed(3) + 'deg) rotateY(' + st.ry.toFixed(3) + 'deg)'
          + (lifting ? ' translateY(-4px)' : '');
        if (st.glare) {
          st.glare.style.setProperty('--gx', st.gx.toFixed(1) + '%');
          st.glare.style.setProperty('--gy', st.gy.toFixed(1) + '%');
        }
      });

      // 磁性吸附
      magnets.forEach((m) => {
        const dx = mouseVX - m.cx, dy = mouseVY - m.cy;
        const d = Math.hypot(dx, dy);
        const tx = d < R ? dx * 0.24 : 0;
        const ty = d < R ? dy * 0.24 : 0;
        m.x = lerp(m.x, tx, 0.16);
        m.y = lerp(m.y, ty, 0.16);
        if (Math.abs(m.x) > 0.05 || Math.abs(m.y) > 0.05) {
          m.el.style.transform = 'translate(' + m.x.toFixed(2) + 'px,' + m.y.toFixed(2) + 'px)';
        } else if (m.el.style.transform) {
          m.el.style.transform = '';
        }
      });

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    refreshRects();
    window.addEventListener('load', refreshRects);
  }

  /* ================= 快捷导航球：点击弹出快捷菜单 ================= */
  function initOrbNav() {
    const anchor = byId('orb-anchor');
    const orb = byId('orb-nav');
    const menu = byId('orb-menu');
    let open = false;
    let timer = null;

    const show = () => {
      clearTimeout(timer);
      menu.hidden = false;
      void menu.offsetWidth;                 // 强制回流：过渡从收起态开始
      anchor.classList.add('open');
      orb.setAttribute('aria-expanded', 'true');
      open = true;
    };
    const hide = () => {
      if (!open) return;
      anchor.classList.remove('open');
      orb.setAttribute('aria-expanded', 'false');
      timer = setTimeout(() => { menu.hidden = true; }, 420);
      open = false;
    };

    orb.addEventListener('click', (e) => { e.stopPropagation(); open ? hide() : show(); });
    menu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', () => { if (open) hide(); }, { passive: true });

    menu.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => {
        hide();
        if (b.dataset.go === 'top') {
          window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
        } else {
          const el = document.getElementById(b.dataset.go);
          if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
        }
      });
    });
  }

  /* ================= 滚动提示 ================= */
  function initScrollHint() {
    byId('scroll-hint').addEventListener('click', () => {
      byId('s-creation').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    });
  }

  /* ================= 视频背景自动适配 =================
   * 检测 assets/hero-video.mp4：存在则启用全页固定播放的视频背景、
   * 淡出照片，并停用波光层（视频自带动态）；不存在则维持照片 + 波光。 */
  function initHeroVideo() {
    const video = byId('hero-video');
    const img = byId('hero-img');
    return fetch('./assets/hero-video.mp4', { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) return false;
        video.src = './assets/hero-video.mp4';
        const onReady = () => {
          video.hidden = false;
          img.classList.add('off');
          const p = video.play();
          if (p && p.catch) p.catch(() => { /* 自动播放被拦时保持首帧 */ });
        };
        if (video.readyState >= 2) onReady();
        else video.addEventListener('canplay', onReady, { once: true });
        return true;
      })
      .catch(() => false);
  }

  /* ================= 首屏动态层：碎金波光 + 浮尘 + 透镜折射 =================
   * canvas 逐帧绘制；手机 30fps 节流 + DPR 1.5 + 16 条切片降开销；
   * 滚出首屏 / 切后台自动暂停；触屏设备禁用折射（错位仅出现在触屏浏览器）。 */
  function initHeroFx() {
    const canvas = byId('hero-fx');
    const img = byId('hero-img');
    if (!canvas || !img || REDUCED) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, horizonY = 0, sunX = 0;

    function resize() {
      const dpr = window.innerWidth < 760 ? 1.5 : Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 由图片自然尺寸与 object-fit: cover 裁切推算地平线 / 太阳位置
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (nw && nh) {
        const s = Math.max(W / nw, H / nh);
        horizonY = nh * 0.615 * s - (nh * s - H) / 2;
        sunX = nw * 0.462 * s - (nw * s - W) / 2;
      } else { horizonY = H * 0.62; sunX = W * 0.5; }
    }

    const glints = [], dust = [];
    function seed() {
      glints.length = 0;
      const n = Math.round(clamp(W / 24, 20, 48));   // 碎金密度
      for (let i = 0; i < n; i++) {
        const nearSun = Math.random() < 0.45;
        const x = nearSun ? sunX + (Math.random() - 0.5) * W * 0.34 : Math.random() * W;
        const t = Math.pow(Math.random(), 0.6);   // 越近海平线越密
        glints.push({
          x: clamp(x, 4, W - 4),
          y: horizonY + 6 + t * (H * 0.94 - horizonY - 6),
          len: 3 + Math.random() * 8,
          sp: 0.5 + Math.random() * 1.1,
          ph: Math.random() * Math.PI * 2,
          drift: (Math.random() - 0.5) * 0.04
        });
      }
      dust.length = 0;
      for (let i = 0; i < 10; i++) {                // 少量浮尘
        dust.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 0.7 + Math.random() * 1.3,
          vx: (Math.random() - 0.5) * 0.06,
          vy: -(0.04 + Math.random() * 0.09),
          ph: Math.random() * Math.PI * 2,
          sp: 0.3 + Math.random() * 0.6
        });
      }
    }

    let running = false, rafId = null;
    const t0 = performance.now();
    const FRAME_MS = window.innerWidth < 760 ? 33 : 0;   // 手机 30fps 节流
    let lastDraw = 0;

    const orbEl = document.querySelector('.orb-c');
    const videoEl = byId('hero-video');
    const videoOn = () => videoEl && !videoEl.hidden && videoEl.readyState >= 2;

    /** 透镜折射：以玻璃珠区域为透镜，切片位移重绘背景
     *  边缘画面被拉开弯折（倍率向圆心递减），叠加色散亮边。 */
    function drawLens() {
      if (!orbEl || IS_TOUCH || !document.body.classList.contains('glass-enabled')) return;
      const src = videoOn() ? videoEl : img;
      const nw = src.videoWidth || src.naturalWidth;
      const nh = src.videoHeight || src.naturalHeight;
      if (!nw || !nh) return;

      // 每帧实时取位置：珠子被浮动动画 + 视差持续移动
      const r = orbEl.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2 - cr.left;
      const cy = r.top + r.height / 2 - cr.top;
      const rad = r.width / 2;
      if (rad < 10 || cy < -rad || cy > H + rad) return;

      const s = Math.max(W / nw, H / nh);
      const ox = (nw * s - W) / 2, oy = (nh * s - H) / 2;
      const srcCx = (cx - ox) / s;
      const srcCy = (cy - oy) / s;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.clip();

      const strips = W < 760 ? 16 : 30;
      for (let i = 0; i < strips; i++) {
        const ty = (i + 0.5) / strips * 2 - 1;
        const chord = Math.sqrt(Math.max(0, 1 - ty * ty));
        if (chord <= 0.02) continue;
        const y0 = cy + ty * rad;
        const h = (2 * rad) / strips;
        const mag = 1.12 + 0.42 * (1 - chord);        // 中心 1.12，边缘 ~1.54
        const dw = 2 * chord * rad;
        const srcW = dw / s / mag;
        const srcH = h / s / mag;
        const srcRowY = srcCy + ty * rad / s / mag;
        ctx.drawImage(src, srcCx - srcW / 2, srcRowY - srcH / 2, srcW, srcH,
                      cx - dw / 2, y0, dw, h);
      }

      // 色散亮边：内外微错位的品红/青细环
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,140,170,0.22)';
      ctx.beginPath(); ctx.arc(cx + 1.4, cy + 1, rad - 1.2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,210,255,0.22)';
      ctx.beginPath(); ctx.arc(cx - 1.4, cy - 1, rad - 1.2, 0, Math.PI * 2); ctx.stroke();

      ctx.restore();
    }

    function frame(now) {
      if (!running) return;
      if (FRAME_MS && now - lastDraw < FRAME_MS - 3) { requestAnimationFrame(frame); return; }
      lastDraw = now;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      if (!videoOn()) {
        // 碎金波光（视频模式下背景本身是动态的，不再叠加）
        for (const g of glints) {
          const a = Math.max(0, Math.sin(t * g.sp + g.ph));
          if (a > 0.06) {
            ctx.strokeStyle = 'rgba(255,236,200,' + (a * 0.28).toFixed(3) + ')';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(g.x - g.len / 2, g.y);
            ctx.lineTo(g.x + g.len / 2, g.y);
            ctx.stroke();
          }
          g.x += g.drift;
          if (g.x < 4 || g.x > W - 4) g.drift *= -1;
        }
        for (const p of dust) {
          const a = 0.07 + 0.13 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph));
          ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          p.x += p.vx; p.y += p.vy;
          if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
          if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
        }
      }
      drawLens();
      requestAnimationFrame(frame);
    }
    function start() { if (!running) { running = true; rafId = requestAnimationFrame(frame); } }
    function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; ctx.clearRect(0, 0, W, H); }

    window.addEventListener('resize', () => { resize(); seed(); });
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        es.forEach((en) => en.isIntersecting ? start() : stop());
      }, { threshold: 0.05 }).observe(canvas);
    } else start();

    const boot = () => { resize(); seed(); start(); };
    boot();
    if (!img.complete) img.addEventListener('load', () => { resize(); seed(); });
  }

  /* ================= 启动 ================= */
  initTheme();
  mountStatic();
  initGlassToggle();
  initWelcome();
  initAvatar();
  initReveal();
  initProjects();
  initScrollHint();
  initOrbNav();
  initPointer();
  initHeroVideo();
  initHeroFx();
})();
