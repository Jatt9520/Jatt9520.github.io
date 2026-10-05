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
  // GSAP（assets/vendor 自托管）：加载失败或用户偏好减弱动效时全部回退 CSS 路径
  const USE_GSAP = typeof window.gsap !== 'undefined' && !REDUCED;
  // 调试：?autotilt=1 强制自律倾斜 / =0 强制指针倾斜；不传则按设备自动判定。
  // 判定用「主指针为粗」或「不支持悬停+精确指针」：部分安卓浏览器会谎报 hover，
  // 单看 (hover:hover)&&(pointer:fine) 会把手机误判成桌面，导致自律动效整体失效。
  const AUTO_PARAM = (location.search.match(/[?&]autotilt=(0|1)/) || [])[1];
  const AUTO_DEVICE = AUTO_PARAM ? AUTO_PARAM === '1'
    : window.matchMedia('(pointer: coarse)').matches || !FINE_POINTER;
  if (AUTO_DEVICE) document.body.classList.add('auto-tilt');

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

    byId('showcase-kicker').textContent = C.showcase.kicker;
    byId('showcase-title').textContent = C.showcase.title;
    byId('showcase-sub').textContent = C.showcase.sub;
    byId('showcase-end').textContent = C.showcase.end;

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
      card.classList.add('open');
      document.body.classList.add('about-open');   // 身份栏联动（亮环/头像微放大）
      avatar.setAttribute('aria-expanded', 'true');
      open = true;
    }
    function hide() {
      if (!open) return;
      card.classList.remove('open');
      document.body.classList.remove('about-open');
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
  /* Split/Blur Text：场景标题拆字，进入视口时逐字模糊浮现 */
  function initTitleChars() {
    if (!USE_GSAP) return;
    document.querySelectorAll('.scene-title').forEach((el) => {
      const text = el.textContent;
      el.setAttribute('aria-label', text);          // 完整文本留给读屏
      el.textContent = '';
      const frag = document.createDocumentFragment();
      [...text].forEach((ch) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = ch;
        frag.appendChild(span);
      });
      el.appendChild(frag);
    });
  }
  function playTitleChars(el) {
    const chars = el.querySelectorAll('.char');
    if (!chars.length) return;
    gsap.fromTo(chars,
      { opacity: 0, y: 16, filter: 'blur(10px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75, stagger: 0.06,
        ease: 'power3.out', overwrite: true, clearProps: 'filter' });
  }

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
        if (en.isIntersecting) {
          en.target.classList.add('in');
          if (en.target.classList.contains('scene-title')) playTitleChars(en.target);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.22 });
    els.forEach((el) => io.observe(el));
    document.querySelectorAll('.scene-title').forEach((el) => io.observe(el));
  }

  /* ================= 项目区（读本地烤制数据 + 卡内细节展开） ================= */
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
      const opt = { cache: 'no-cache' };
      if ('timeout' in AbortSignal) opt.signal = AbortSignal.timeout(6000);
      const res = await fetch(C.projects.dataFile, opt);
      if (!res.ok) throw new Error('projects.json ' + res.status);
      const data = await res.json();
      const byName = {};
      (data.repos || []).forEach((r) => { byName[String(r.name).toLowerCase()] = r; });

      grid.innerHTML = '';
      C.projects.repos.forEach((name, i) => {
        const repo = byName[name.toLowerCase()];
        if (!repo) return;
        // 中文介绍优先：config.repoDescs 是站点自己的文案，压过 GitHub 的英文描述
        const desc = C.projects.repoDescs[name] || repo.description || C.projects.noDesc;
        const lang = repo.language ? '<span class="pill">' + esc(repo.language) + '</span>' : '';
        const star = '<span class="pill star">★ ' + fmtStars(repo.stargazers_count || 0) + '</span>';
        const points = C.projects.highlights[name] || [];
        const details = points.length
          ? '<button class="project-toggle" type="button" aria-expanded="false">'
            + esc(C.projects.detailLabel)
            + '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            + '</button>'
            + '<div class="project-more"><ul class="project-points">'
            + points.map((t) => '<li>' + esc(t) + '</li>').join('')
            + '</ul></div>'
          : '';

        const card = document.createElement('article');
        card.className = 'project-card glass-panel tilt reveal';
        card.style.setProperty('--rd', (i * 0.09).toFixed(2) + 's');
        card.innerHTML =
          '<i class="glare" aria-hidden="true"></i>'
          + '<strong class="project-name">'
          + '<a class="project-open" href="' + esc(repo.html_url) + '" target="_blank" rel="noopener">'
          + esc(repo.name) + '<span class="arrow">→</span></a></strong>'
          + '<p class="project-desc">' + esc(desc) + '</p>'
          + '<div class="project-meta">' + lang + star + '</div>'
          + details;
        grid.appendChild(card);
        registerTilt(card);          // 3D 倾斜 + 追光

        const toggle = card.querySelector('.project-toggle');
        const list = card.querySelector('.project-points');
        if (toggle) toggle.addEventListener('click', () => {
          const opening = toggle.getAttribute('aria-expanded') !== 'true';
          toggle.setAttribute('aria-expanded', String(opening));
          if (opening) {
            // Size Morph：高度先长出来，清单条目自下逐条浮入
            card.classList.add('expanded');
            if (USE_GSAP && list) {
              gsap.killTweensOf(list.children);
              gsap.fromTo(list.children,
                { opacity: 0, y: 10 },
                { opacity: 1, y: 0, duration: 0.4, stagger: 0.055, ease: 'power2.out', delay: 0.1,
                  clearProps: 'opacity,transform' });
            }
          } else if (USE_GSAP && list) {
            // Reverse Collapse 两段式：先收清单条目，再缩短卡片高度
            gsap.killTweensOf(list.children);
            gsap.to(list.children,
              { opacity: 0, y: 6, duration: 0.16, stagger: { each: 0.03, from: 'end' }, ease: 'power1.in',
                onComplete: () => {
                  card.classList.remove('expanded');
                  gsap.set(list.children, { clearProps: 'opacity,transform' });
                  refreshCardRects();
                  setTimeout(refreshCardRects, 560);
                } });
          } else {
            card.classList.remove('expanded');
          }
          // 卡片高度在过渡中变化：立即与过渡结束后各刷新一次位置缓存
          refreshCardRects();
          setTimeout(refreshCardRects, 560);
        });
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
   *  · 视差景深（首屏内容反向微移）
   *  · 3D 倾斜（卡片朝向指针，回弹归位）
   *  · 追光（--gx/--gy 平滑跟随）
   *  · 磁性吸附（按钮在半径内向指针微移）
   * 倾斜与磁性的元素位置走缓存（滚动/尺寸变化/卡片展开时刷新），
   * 事件回调里不再读布局，避免「每帧写 transform + 每次 pointermove
   * 读 rect」叠加出的强制布局抖动。 */
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, has: false };   // x/y 目标，sx/sy 平滑值
  const tilts = new Map();// el -> { left, top, w, h, rx, ry, trx, tryy, gx, gy, tgx, tgy, glare }
  const magnets = [];     // { el, cx, cy, x, y }
  let PERF_LITE = false;  // 低性能自动降级（持续掉帧触发，见 initPointer）

  /* 位置缓存刷新：滚动防抖合并刷新；卡片展开等即时事件直接刷新 */
  const refreshFns = [];
  let refreshTimer = null;
  function refreshRects() {
    tilts.forEach((st, el) => {
      const r = el.getBoundingClientRect();
      st.left = r.left; st.top = r.top; st.w = r.width; st.h = r.height;
    });
    magnets.forEach((m) => {
      const r = m.el.getBoundingClientRect();
      m.cx = r.left + r.width / 2;
      m.cy = r.top + r.height / 2;
    });
  }
  function queueRefreshRects() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshRects, 160);
  }
  function refreshCardRects() {   // 供卡内交互（展开/收起）后同步调用
    clearTimeout(refreshTimer);
    refreshFns.forEach((f) => f());
  }

  function registerTilt(el) {
    if (REDUCED || tilts.has(el)) return;
    const glare = el.querySelector('.glare');
    const r0 = el.getBoundingClientRect();   // 注册时布局是干净的，量一次入缓存
    const auto = AUTO_DEVICE;   // 触屏无指针输入：走自律漂移版倾斜
    const st = { glare: glare, left: r0.left, top: r0.top, w: r0.width, h: r0.height,
                 rx: 0, ry: 0, trx: 0, tryy: 0, gx: 50, gy: 40, tgx: 50, tgy: 40,
                 auto: auto, phase: tilts.size * 2.1, live: !auto, bornAt: null,
                 visible: true, lastT: null, lastGx: null, lastGy: null };
    tilts.set(el, st);
    if (!auto) {
      el.addEventListener('pointermove', (e) => {
        const nx = clamp((e.clientX - st.left) / st.w * 2 - 1, -1, 1);
        const ny = clamp((e.clientY - st.top) / st.h * 2 - 1, -1, 1);
        st.tryy = nx * 6;            // rotateY 目标
        st.trx = -ny * 6;            // rotateX 目标
        st.tgx = clamp((nx + 1) / 2 * 100, 0, 100);
        st.tgy = clamp((ny + 1) / 2 * 100, 0, 100);
      });
      el.addEventListener('pointerleave', () => {
        st.trx = 0; st.tryy = 0; st.tgx = 50; st.tgy = 40;
      });
      return;
    }
    /* 自律版的接管时机：首次进入视口才开始「醒转」——阻尼收位在用户
       眼前表演，而不是页面加载时在屏外白白放完；等入场揭示的 transform
       过渡播完再接手，避免逐帧写入掐断浮起入场或双重平滑。 */
    const goLive = () => {
      if (st.live) return;
      st.live = true;
      el.style.transition = 'box-shadow 0.45s var(--out), background-color 0.45s var(--out)';
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          el.addEventListener('transitionend', function onEnd(e) {
            if (e.target !== el || e.propertyName !== 'transform') return;
            el.removeEventListener('transitionend', onEnd);
            goLive();
          });
          setTimeout(goLive, 900);   // 兜底：入场已播完/无入场时走这里
        });
      }, { threshold: 0.3 });
      io.observe(el);
    } else {
      goLive();
    }
  }

  function registerMagnet(el) {
    if (REDUCED || !FINE_POINTER || !el || magnets.some((m) => m.el === el)) return;   // 触屏不做磁性
    magnets.push({ el: el, cx: 0, cy: 0, x: 0, y: 0 });
  }

  function initPointer() {
    // 珠子不参与视差漂移：移动的点击目标会让人点不中（视差由背景承担）
    document.querySelectorAll('.tilt').forEach(registerTilt);
    document.querySelectorAll('.magnetic').forEach(registerMagnet);

    // 屏外的倾斜卡停写 transform：省样式抖动与合成开销（不可见，零视觉差）
    if ('IntersectionObserver' in window) {
      const vio = new IntersectionObserver((es) => {
        es.forEach((en) => {
          const stv = tilts.get(en.target);
          if (stv) stv.visible = en.isIntersecting;
        });
      }, { threshold: 0.02 });
      tilts.forEach((st, el) => vio.observe(el));
    }

    // 视差目标 + 磁性指针坐标共用一个监听（触屏设备鼠标坐标照常供给磁性）
    let mouseVX = 0, mouseVY = 0;
    window.addEventListener('pointermove', (e) => {
      if (!IS_TOUCH) {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        pointer.has = true;
      }
      mouseVX = e.clientX; mouseVY = e.clientY;
    }, { passive: true });

    refreshFns.push(refreshRects);
    window.addEventListener('scroll', queueRefreshRects, { passive: true });
    window.addEventListener('resize', refreshCardRects);

    if (REDUCED) return;   // 移动端也进入本循环：动画固定播放（自律漂移）

    const heroBg = document.querySelector('.hero-bg');   // 常驻元素，一次查找
    const R = 110;   // 磁性吸附半径
    // 移动端 30fps 节流（桌面满帧）
    const PULSE_MS = FINE_POINTER ? 0 : 33;
    let lastPulse = 0;
    let lastSx = 99, lastSy = 99;   // 脏检查：无变化不写 DOM
    let lastFrameT = 0, slowFrames = 0;   // 低性能降级监测
    function frame(now) {
      if (PULSE_MS && now - lastPulse < PULSE_MS - 3) { requestAnimationFrame(frame); return; }
      lastPulse = now;

      // 低性能自动降级：帧间隔持续超支约 3 秒（累计 70 个慢帧，快帧回收）
      // 才进入 perf-lite——健康设备永不触发，默认观感不变。
      if (!PERF_LITE) {
        if (document.body.classList.contains('perf-lite')) {
          PERF_LITE = true;   // 外部（调试）已置 lite：JS 侧同步跟随
        } else if (lastFrameT) {
          const dt = now - lastFrameT;
          if (dt > 38 && dt < 400) slowFrames++;       // 排除切后台回来的巨帧
          else if (dt <= 38 && slowFrames) slowFrames--;
          if (slowFrames > 70) {
            PERF_LITE = true;
            document.body.classList.add('perf-lite');
          }
        }
        lastFrameT = now;
      }

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
        // 背景反向微移（与内层 img 的运镜动画分层叠加）
        if (heroBg) {
          heroBg.style.transform =
            'scale(1.045) translate3d(' + (pointer.sx * -12).toFixed(2) + 'px,'
                                         + (pointer.sy * -9).toFixed(2) + 'px,0)';
        }
      }

      // 3D 倾斜 + 追光（指针版首次介入时收掉 CSS 的 transform 过渡，避免双重平滑）
      tilts.forEach((st, el) => {
        if (!st.visible) return;             // 屏外卡：停写 transform，零合成开销
        if (st.auto) {
          if (!st.live) return;   // 等首次进入视口（registerTilt 里已安排醒转时机）
          if (PERF_LITE) {        // 低性能模式：收敛到静止，弹簧自然落平
            st.trx = 0; st.tryy = 0; st.tgx = 50; st.tgy = 40;
          } else {
            // 自律漂移：慢速利萨如驱动倾斜，流光位置由倾斜角反推——
            // 与桌面「光随指针、卡随光」同一几何关系，光贴着倾斜面走。
            // 阻尼收位：刚接管时振幅放大两倍余（头几次摆动确保可感），
            // 指数衰减落回常驻幅度；纯时间函数，零额外开销。
            const tt = now / 1000;
            if (st.bornAt === null) st.bornAt = now;
            const env = 1 + 1.2 * Math.exp(-(now - st.bornAt) / 2800);
            const ox = Math.sin(tt * 0.7 + st.phase);
            const oy = Math.cos(tt * 0.53 + st.phase * 1.7);
            st.trx = ox * 3.6 * env;
            st.tryy = oy * 4.6 * env;
            st.tgx = 50 + oy * 38;
            st.tgy = 42 - ox * 26;
          }
        }
        st.rx = lerp(st.rx, st.trx, 0.12);
        st.ry = lerp(st.ry, st.tryy, 0.12);
        st.gx = lerp(st.gx, st.tgx, 0.14);
        st.gy = lerp(st.gy, st.tgy, 0.14);
        const lifting = !st.auto && (Math.abs(st.rx) + Math.abs(st.ry)) > 0.2;
        if (lifting && !st.engaged) {
          st.engaged = true;
          el.style.transition = 'box-shadow 0.45s var(--out), background-color 0.45s var(--out)';
        }
        // 脏检查：值不变不写 style，静止卡片零样式抖动
        const tstr = 'perspective(900px) rotateX(' + st.rx.toFixed(3) + 'deg) rotateY(' + st.ry.toFixed(3) + 'deg)'
          + (lifting ? ' translateY(-4px)' : '');
        if (tstr !== st.lastT) { st.lastT = tstr; el.style.transform = tstr; }
        if (st.glare) {
          const gx = st.gx.toFixed(1), gy = st.gy.toFixed(1);
          if (gx !== st.lastGx) { st.lastGx = gx; st.glare.style.setProperty('--gx', gx + '%'); }
          if (gy !== st.lastGy) { st.lastGy = gy; st.glare.style.setProperty('--gy', gy + '%'); }
        }
      });

      // 磁性吸附（磁性目标随页面滚动变化，用缓存中心 + 当前指针视口坐标）
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

  /* ================= 快捷导航球：点击弹出快捷菜单 =================
   * GSAP 路径：展开时条目自珠心绽放（自下而上），收起时反向逐层
   * 缩回珠心（Reverse Collapse，先进后出）；CSS 路径为降级保底。 */
  function initOrbNav() {
    const anchor = byId('orb-anchor');
    const orb = byId('orb-nav');
    const menu = byId('orb-menu');
    const items = [...menu.querySelectorAll('.orb-item')];
    let open = false;
    let timer = null;

    if (USE_GSAP) items.forEach((el) => { el.style.transition = 'none'; });   // 防止与 GSAP 双重平滑

    // 条目与珠心的偏移：收起时沿来路缩回，展开时自珠子生长
    function orbOffsets() {
      const o = orb.getBoundingClientRect();
      return items.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: (o.left + o.width / 2) - (r.left + r.width / 2),
                 y: (o.top + o.height / 2) - (r.top + r.height / 2) };
      });
    }

    const show = () => {
      clearTimeout(timer);
      if (USE_GSAP) gsap.killTweensOf(items);
      menu.hidden = false;
      void menu.offsetWidth;                 // 强制回流：过渡从收起态开始
      anchor.classList.add('open');
      orb.setAttribute('aria-expanded', 'true');
      if (USE_GSAP) {
        const off = orbOffsets();
        gsap.fromTo(items,
          { opacity: 0, scale: 0.35, x: (i) => off[i].x, y: (i) => off[i].y },
          { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.45, ease: 'back.out(1.7)',
            stagger: { each: 0.045, from: 'end' }, clearProps: 'transform' });
      }
      open = true;
    };
    const hide = () => {
      if (!open) return;
      anchor.classList.remove('open');
      orb.setAttribute('aria-expanded', 'false');
      if (USE_GSAP) {
        gsap.killTweensOf(items);
        const off = orbOffsets();
        gsap.to(items,
          { opacity: 0, scale: 0.35, x: (i) => off[i].x, y: (i) => off[i].y,
            duration: 0.32, ease: 'power2.in', stagger: { each: 0.04, from: 'start' },
            onComplete: () => {
              menu.hidden = true;
              gsap.set(items, { clearProps: 'opacity,transform' });
            } });
      } else {
        timer = setTimeout(() => { menu.hidden = true; }, 420);
      }
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

  /* ================= 地址栏深链接 =================
   * 四屏各占一个 hash（#/ #creation #projects #showcase）：滚动到哪屏
   * 地址栏跟到哪屏（replaceState 不产生历史噪音）；带 hash 打开/刷新时
   * 瞬跳直达该屏。 */
  function initHashNav() {
    const map = { '': 's-hero', creation: 's-creation', projects: 's-projects', showcase: 's-showcase' };
    const nameOf = {};
    Object.keys(map).forEach((k) => { nameOf[map[k]] = k; });

    const h = decodeURIComponent(location.hash.slice(1));
    if (map[h]) {
      const el = byId(map[h]);
      // 载入期定位必须 instant：绕过 CSS 的 smooth（深链接要的是直达，
      // 且布局完成前的平滑滚动在部分环境会被丢掉）
      if (el) window.scrollTo({ top: el.offsetTop, behavior: 'instant' });
    }

    if (!('IntersectionObserver' in window)) return;
    let cur = null;
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          const v = nameOf[en.target.id];
          if (v !== undefined && v !== cur) {
            cur = v;
            history.replaceState(null, '', v ? '#' + v : location.pathname + location.search);
          }
        }
      });
    }, { threshold: 0.6 });
    Object.keys(map).forEach((k) => {
      const el = byId(map[k]);
      if (el) io.observe(el);
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
    let forceDpr = 0, densityFactor = 1;      // 低端机降级参数（0/1 = 不干预）

    function resize() {
      const dpr = forceDpr || (window.innerWidth < 760 ? 1.5 : Math.min(2, window.devicePixelRatio || 1));
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
      const n = Math.round(clamp(W / 24, 20, 48) * densityFactor);   // 碎金密度
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
    let lastPerfT = 0, slowStreak = 0, degraded = false;

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
      if (document.body.classList.contains('perf-lite')) { stop(); return; }   // 低性能模式：波光层让位
      if (FRAME_MS && now - lastDraw < FRAME_MS - 3) { requestAnimationFrame(frame); return; }
      lastDraw = now;

      // 低端机自适应：帧间隔持续超 42ms（低于约 24fps）达 3 秒才降级一次，
      // 只降 DPR 与粒子密度——正常设备永不触发，效果不变。
      if (!degraded) {
        if (lastPerfT) {
          const dt = now - lastPerfT;
          if (dt > 42 && dt < 400) slowStreak++;       // 排除切后台回来的巨帧
          else if (dt <= 42) slowStreak = Math.max(0, slowStreak - 2);
          if (slowStreak > 90) {
            degraded = true;
            forceDpr = 1; densityFactor = 0.6;
            resize(); seed();
          }
        }
        lastPerfT = now;
      }

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
  initTitleChars();
  initGlassToggle();
  initWelcome();
  initAvatar();
  initReveal();
  initProjects();
  initScrollHint();
  initHashNav();
  initOrbNav();
  initPointer();
  initHeroVideo();
  initHeroFx();
})();
