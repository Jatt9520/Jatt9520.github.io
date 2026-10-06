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
    // （珠子菜单连着 orb-github 外链一并退休：GitHub 入口只留 dock 与页脚）

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
    const showSc = document.getElementById('s-showcase');
    if (showSc) showSc.addEventListener('scroll', queueRefreshRects, { passive: true });   // 第四屏内滚：页脚/卡片倾斜的坐标缓存同步
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

  /* ================= 项目行星：玻璃珠本体 =================
   *  · 导航职责已整体移交底部 dock，珠子上的绽放菜单已退休删除
   *  · 珠子现在只是「行星本体」：三颗项目卫星绕它转（initOrbPlanets）
   *  · 点一下给个果冻脉冲；双击解锁自由拖动（弹簧跟随 + 位置记忆 +
   *    屏幕钳制 + 避让 dock），再双击锁回。 */
  function initOrbNav() {
    const anchor = byId('orb-anchor');
    const orb = byId('orb-nav');
    let freeMode = false;

    /* 状态提示胶囊：拖动被锁/解锁/锁回时给看得见的反馈
       （原生 title 悬停提示在拖拽中不会出现，必须用真实 DOM） */
    const toast = document.createElement('span');
    toast.className = 'orb-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    anchor.appendChild(toast);
    let toastTimer = null;
    function showToast(msg) {
      toast.textContent = msg;
      const r = anchor.getBoundingClientRect();
      if (r.top < 70) {                        // 顶部空间不足：挂到珠子下面
        toast.style.top = 'calc(100% + 12px)';
        toast.style.transform = 'translate(-50%, 0)';
      } else {
        toast.style.top = '-12px';
        toast.style.transform = 'translate(-50%, -100%)';
      }
      toast.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('on'), 1800);
    }

    /* —— 拖拽与锁定 —— */
    let drag = null;
    let justDragged = false;
    let lastDragEnd = 0;                     // 松手时刻：供 dblclick 忽略合成双击
    const hasQuick = typeof gsap !== 'undefined' && !!gsap.quickTo;
    /* quickTo 实例必须可重建：落位时的 killTweensOf+set 会把内部补间打成
       僵尸，之后 resetTo 全部空转（「只能拖一次」的元凶），每次松手换新 */
    let xTo = null, yTo = null;
    const buildQuickTo = () => {
      if (!hasQuick) return;
      xTo = gsap.quickTo(orb, 'x', { duration: 0.3, ease: 'power3' });
      yTo = gsap.quickTo(orb, 'y', { duration: 0.3, ease: 'power3' });
    };
    buildQuickTo();

    function clampPos(x, y) {
      const w = anchor.offsetWidth || 74, h = anchor.offsetHeight || 74;
      let cx = clamp(x, 8, Math.max(8, window.innerWidth - w - 8));
      let cy = clamp(y, 8, Math.max(8, window.innerHeight - h - 8));
      // 避让固定导航栏：珠子不许落到导航条上（用户点名「不要被球遮挡」）
      const dockEl = byId('dock');
      if (dockEl && !dockEl.hidden) {
        const d = dockEl.getBoundingClientRect();
        const m = 8;
        const hit = !(cx + w + m < d.left || cx - m > d.right || cy + h + m < d.top || cy - m > d.bottom);
        if (hit) {
          // 竖向条推左侧、横向条推上方
          if (d.height >= d.width) cx = Math.max(8, d.left - w - m);
          else cy = Math.max(8, d.top - h - m);
        }
      }
      return { x: cx, y: cy };
    }
    function placeOrb(x, y) {
      anchor.style.left = Math.round(x) + 'px';
      anchor.style.top = Math.round(y) + 'px';
      anchor.style.right = 'auto';
      anchor.style.bottom = 'auto';
    }
    function setFree(on) {
      freeMode = on;
      orb.classList.toggle('orb-free', on);
      orb.title = on ? '自由拖动中 · 再双击锁定' : '快捷导航 · 双击解锁自由拖动';
      // （弹性脉冲已删：GSAP 写 scale 会把浮动 translate 折叠进内联 transform
      //   再也清不干净，CSS 悬停/按压动画跟着被压死——反馈交给 toast + 描边环）
    }
    orb.title = '快捷导航 · 双击解锁自由拖动';
    try {
      const saved = JSON.parse(localStorage.getItem('orb_pos') || 'null');
      if (saved && typeof saved.x === 'number') {
        const c = clampPos(saved.x, saved.y);
        placeOrb(c.x, c.y);
      }
    } catch (e) { /* 忽略 */ }
    window.addEventListener('resize', () => {
      if (anchor.style.left === '') return;
      const r = anchor.getBoundingClientRect();
      const c = clampPos(r.left, r.top);
      if (c.x !== r.left || c.y !== r.top) placeOrb(c.x, c.y);
    });

    orb.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 拖拽松手会合成 click；落点附近的下一次抓取再合成一次 → 浏览器判成
      // 双击 → 误触发「双击锁定」，球当场锁死（用户：只能拖一次就死）。
      // 拖拽结束后 600ms 内的双击一律无视
      if (performance.now() - lastDragEnd < 600) return;
      setFree(!freeMode);
      showToast(freeMode ? '已解锁 · 拖动到喜欢的位置' : '已锁定 · 位置固定');
    });
    orb.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = anchor.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
      orb.classList.add('dragging');           // 暂停浮动 + 降模糊（拖动中省重采样）
      try { orb.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (USE_GSAP) gsap.killTweensOf(orb);
    });
    orb.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (!drag.moved || !freeMode) return;    // 锁定态：纹丝不动
      const c = clampPos(drag.ox + dx, drag.oy + dy);
      const nx = c.x - drag.ox, ny = c.y - drag.oy;
      if (xTo) { xTo(nx); yTo(ny); }
      else orb.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
    });
    const endDrag = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      orb.classList.remove('dragging');
      if (!d.moved) return;                    // 纯点击：交给 click/dblclick
      lastDragEnd = performance.now();         // 只有真拖过才盖戳：否则单击会误杀合法双击
      if (freeMode) {
        // 松手「落在眼睛看到的地方」：quickTo 有 0.3s 跟随延迟，按指针目标
        // 落户会向前瞬跳一段（松手生硬的根因）——先取珠子视觉位置再杀补间
        const vr = orb.getBoundingClientRect();
        const c = clampPos(vr.left, vr.top);
        if (USE_GSAP) gsap.killTweensOf(orb);  // 必须先杀在途 quickTo，否则珠子会继续漂出屏幕
        placeOrb(c.x, c.y);
        // 缓存同步零位（下次抓取不跳）→ 再彻底清内联。不能用 clearProps：
        // GSAP 3.13 会把浮动动画的 translate 属性折叠进缓存，清完又写回，
        // 残留内联 transform 会把 CSS 的悬停/按压动画永久压死
        if (USE_GSAP) gsap.set(orb, { x: 0, y: 0, scale: 1 });
        orb.style.transform = '';
        orb.style.translate = '';
        buildQuickTo();                        // 换新实例：僵尸 quickTo 会吞掉下一次拖拽
        try { localStorage.setItem('orb_pos', JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y) })); } catch (err) { /* 忽略 */ }
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 140);
      } else {
        // 锁定态被拖：晃一下 + 提示胶囊，告诉用户先双击解锁
        if (USE_GSAP) {
          gsap.killTweensOf(orb);
          gsap.fromTo(orb, { x: -5 }, { x: 5, duration: 0.055, repeat: 5, yoyo: true, ease: 'none',
            onComplete: () => {       // 晃完缓存归零 + 清内联，别让 GSAP 折叠值残留
              gsap.set(orb, { x: 0, y: 0, scale: 1 });
              orb.style.transform = '';
              orb.style.translate = '';
            } });
        }
        showToast('双击解锁 · 自由拖动');
        justDragged = true;                    // 吞掉拖拽结束后的合成 click（否则会误触脉冲）
        setTimeout(() => { justDragged = false; }, 140);
      }
    };
    orb.addEventListener('pointerup', endDrag);
    orb.addEventListener('pointercancel', endDrag);

    orb.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail >= 2) return;               // 双击的第二下：交给 dblclick
      if (justDragged) { justDragged = false; return; }
      // 菜单与 GSAP 脉冲都已退休：按压反馈交给 CSS :active，不再往珠子的
      // 内联 transform 里写任何东西（那是悬浮/悬停动画被压死的根源）
    });
  }

  /* ================= 项目卫星：绕珠小行星 =================
   * 珠子是行星，C.orbPlanets 的三个仓库是玻璃小卫星：倾斜椭圆轨道，
   * 转到球「背后」缩小变暗、z 沉到球后，转回「面前」浮到球面上，
   * 真 3D 环绕感；滚动越猛转得越快（动能耦合，摩擦衰减）。
   * 本体是 <a>，点卫星直达 GitHub 仓库；单 rAF 只写 transform/
   * filter/z，成本≈珠子浮动。REDUCED / perf-lite 定格成三颗静止
   * 卫星（仍可点）。 */
  function initOrbPlanets() {
    const anchor = byId('orb-anchor');
    if (!anchor || !Array.isArray(C.orbPlanets) || !C.orbPlanets.length) return;
    const base = (C.footer.githubUrl || 'https://github.com').replace(/\/+$/, '');

    const moons = C.orbPlanets.map((p) => {
      const a = document.createElement('a');
      a.className = 'orb-moon';
      a.href = base + '/' + p.repo;
      a.target = '_blank';
      a.rel = 'noopener';
      a.draggable = false;
      a.setAttribute('aria-label', '打开 GitHub 项目 ' + p.repo);
      a.innerHTML = '<i class="moon-core" style="--mc:' + p.color + '"></i>' +
                    '<span class="moon-label">' + p.repo + '</span>';
      document.body.appendChild(a);   // fixed 挂 body：不受锚点层叠上下文限制
      return a;
    });

    /* 几何：半径随珠径缩放；转速要肉眼可感（一圈 5~10s，一圈 15s+ 等于静止，
       用户点名批评过）；一颗逆行制造层次，初始相位均匀铺开 */
    const GEO = [
      { k: 0.78, ph: 0.9, sp: 1.15 },
      { k: 0.97, ph: 2.6, sp: -0.85 },
      { k: 1.16, ph: 4.4, sp: 0.65 },
    ];
    const TILT = 0.5;                 // 纵轴压扁 = 轨道面倾斜的透视
    let radii = [];
    function measure() {
      const ballR = (anchor.offsetWidth || 74) / 2;
      radii = GEO.map((g) => ballR * g.k + 18);   // 略离球壳，不贴边
    }
    measure();

    /* 滚动动能：滚得越猛甩得越快（峰值 ~6 rad/s ≈ 每秒一整圈），
       摩擦 ~1.5s 衰减回常速；第四屏是场景内滚，一并接入 */
    let boost = 0;
    let lastSY = window.scrollY;
    const kick = (dy) => {
      boost = clamp(boost + clamp(dy, -120, 120) * 0.015, -6, 6);
    };
    window.addEventListener('scroll', () => {
      const dy = window.scrollY - lastSY;
      lastSY = window.scrollY;
      kick(dy);
    }, { passive: true });
    const showSc = document.getElementById('s-showcase');
    if (showSc) showSc.addEventListener('scroll', function () {
      kick(this.scrollTop - (this.__lastTop || 0));
      this.__lastTop = this.scrollTop;
    }, { passive: true });

    const phases = GEO.map((g) => g.ph);
    let raf = 0;
    let lastT = 0;
    function place(moon, i, cx, cy, front) {
      const a = phases[i];
      const x = Math.cos(a) * radii[i];
      const y = Math.sin(a) * radii[i] * TILT;
      moon.style.transform = 'translate(' + (cx + x).toFixed(1) + 'px,' + (cy + y).toFixed(1) +
        'px) scale(' + (front ? 1 : 0.78).toFixed(3) + ')';
      moon.style.zIndex = front ? '853' : '845';          // 珠子锚点是 850：前后换位
      moon.style.filter = front ? '' : 'brightness(0.6) saturate(0.8)';
    }
    function orbitCenter() {
      const ar = anchor.getBoundingClientRect();
      const maxRX = Math.max(...radii) + 20;
      const maxRY = Math.max(...radii) * TILT + 20;
      return {
        x: clamp(ar.left + ar.width / 2, maxRX, window.innerWidth - maxRX),
        y: clamp(ar.top + ar.height / 2, maxRY, window.innerHeight - maxRY),
        bx: ar.left + ar.width / 2,            // 球心原位（不 clamp）：遮挡检测用
        by: ar.top + ar.height / 2,
        br: ar.width / 2,
      };
    }
    function settle() {     // 静态布局（REDUCED / perf-lite）：三颗摆开仍可点
      const c = orbitCenter();
      for (let i = 0; i < moons.length; i++) {
        phases[i] = GEO[i].ph;
        place(moons[i], i, c.x, c.y, Math.sin(phases[i]) > 0);
      }
    }
    function frame(now) {
      const dt = Math.min(48, lastT ? now - lastT : 16);
      lastT = now;
      if (document.body.classList.contains('perf-lite')) {  // 降级：定格收摊
        raf = 0;
        settle();
        return;
      }
      const c = orbitCenter();
      for (let i = 0; i < moons.length; i++) {
        phases[i] += (GEO[i].sp + boost * Math.sign(GEO[i].sp)) * dt / 1000;
        place(moons[i], i, c.x, c.y, Math.sin(phases[i]) > 0);
        // 掠过球面的前排卫星让出指针：34px 的链接珠压在球心上，
        // 会把用户对珠子的点击/抓取整个截走（「只能拖一次」的帮凶）
        const overBall = Math.sin(phases[i]) > 0 &&
          Math.hypot(c.x + Math.cos(phases[i]) * radii[i] - c.bx,
                     c.y + Math.sin(phases[i]) * radii[i] * TILT - c.by) < c.br + 16;
        moons[i].style.pointerEvents = overBall ? 'none' : 'auto';
      }
      boost *= Math.exp(-dt / 600);          // 摩擦衰减：甩劲 ~1.5s 溜回常速
      raf = requestAnimationFrame(frame);
    }

    if (REDUCED) {
      settle();
      window.addEventListener('resize', settle);
      anchor.addEventListener('pointerup', () => setTimeout(settle, 350));  // 拖完重新贴靠
      return;
    }
    window.addEventListener('resize', measure);
    raf = requestAnimationFrame(frame);
  }

  /* ================= 固定导航栏 =================
   * 桌面：右侧竖排玻璃条常驻；小屏：底部居中横向药丸，且随滚动自动
   * 收纳（下滑阅读退场、上滑/点按唤出），不再悬在正文上压字。
   * 导航珠仍是「额外入口」，clampPos 会自动避让两种形态的 dock。 */
  function initDock() {
    const dock = byId('dock');
    if (!dock) return;
    dock.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.go === 'top') {
          window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
        } else {
          const el = byId(b.dataset.go);
          if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
        }
      });
    });
    const gh = byId('dock-github');
    if (gh) gh.href = C.footer.githubUrl;

    /* —— 小屏自动收纳：只认真实滚动的方向；跳转期间挂起 —— */
    const mqlSmall = window.matchMedia('(max-width: 760px), (max-height: 600px)');
    let lastY = window.scrollY;
    let holdUntil = 0;
    const setTucked = (on) => dock.classList.toggle('dock-hide', on);
    dock.addEventListener('click', () => {
      holdUntil = performance.now() + 1200;
      setTucked(false);
    });
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (!mqlSmall.matches) { setTucked(false); lastY = y; return; }   // 桌面竖排常驻
      if (performance.now() < holdUntil) { lastY = y; return; }
      const dy = y - lastY;
      if (Math.abs(dy) < 8) return;
      lastY = y;
      setTucked(dy > 0 && y > 140);
    }, { passive: true });

    /* —— 首访贴士（仅小屏，一次性）：一句话讲清珠子和底部图标 —— */
    try {
      if (mqlSmall.matches && !localStorage.getItem('dock_hint_shown')) {
        localStorage.setItem('dock_hint_shown', '1');
        setTimeout(() => {
          dock.classList.add('dock-hint');
          document.body.classList.add('dock-hint-on');     // 滚动提示暂避 3s
          setTimeout(() => {
            dock.classList.remove('dock-hint');
            document.body.classList.remove('dock-hint-on');
          }, 3200);
        }, 2600);
      }
    } catch (e) { /* 忽略 */ }

    /* —— 断点跨越换场：右侧竖排 ↔ 底部横排 ——
       媒体查询切换是瞬跳且旧布局无法冻结，把它拆成「快速隐去 →
       从新家方向浮入」：change 触发时新布局已生效，先同步藏住避免
       闪现跳变后的形态，再自下（底部栏）/自右（侧边栏）入场。 */
    mqlSmall.addEventListener('change', (e) => {
      setTucked(false);                        // 换场先现身，收纳交还滚动方向判断
      if (REDUCED) return;                     // 减速动效：直达，不加戏
      dock.classList.remove('dock-swap-in', 'dock-from-right');
      dock.classList.add('dock-swap-out', e.matches ? 'dock-from-bottom' : 'dock-from-right');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        dock.classList.remove('dock-swap-out');
        dock.classList.add('dock-swap-in');    // 保留不清：移除会重启基础入场（带延迟眨眼）
      }));
    });
  }

  /* 当前所在屏 → 高亮对应导航项（由 initHashNav 驱动） */
  function markDock(screenId) {
    const dock = byId('dock');
    if (!dock) return;
    const want = screenId === 's-hero' || screenId === '' ? 'top' : screenId;
    dock.querySelectorAll('.dock-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.go === want);
    });
  }

  /* ================= 滚动提示 ================= */
  function initScrollHint() {
    byId('scroll-hint').addEventListener('click', () => {
      byId('s-creation').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    });
  }

  /* ================= 首屏欢迎词：Welcome 逐字打出 + 前往探索 =================
   * 给空旷首屏一句开场白：粗体 Welcome 逐字敲出（节奏带随机，像手打不是
   * 机械拍），光标闪烁收尾后隐去，「前往探索」玻璃按钮随后浮起。
   * 深链接直进其它屏的用户不打扰——首次回首屏时才开始打字。 */
  function initWelcomeType() {
    const host = byId('s-hero');
    const line = byId('welcome-line');
    const cta = byId('hero-cta');
    if (!host || !line || !cta) return;
    cta.addEventListener('click', () => {
      byId('s-creation').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    });
    const play = () => {
      cta.classList.add('on');
      const word = 'Welcome';
      if (REDUCED) {
        const s = document.createElement('span');
        s.className = 'wc on';
        s.textContent = word;
        line.appendChild(s);
        return;
      }
      const caret = document.createElement('i');
      caret.className = 'welcome-caret';
      caret.setAttribute('aria-hidden', 'true');
      line.appendChild(caret);
      let i = 0;
      const tick = () => {
        if (i < word.length) {
          const s = document.createElement('span');
          s.className = 'wc';
          s.textContent = word[i++];
          line.insertBefore(s, caret);
          setTimeout(() => s.classList.add('on'), 30);  // 模糊聚焦落字，不是白字直贴
          setTimeout(tick, 110 + Math.random() * 80);   // 手打节奏：不是机械节拍
        } else {
          caret.classList.add('off');
          setTimeout(() => {
            caret.remove();
            line.classList.add('done');                 // 收笔：一道光泽扫过词面
          }, 600);
        }
      };
      tick();
    };
    if ('IntersectionObserver' in window && window.scrollY > window.innerHeight * 0.5) {
      // 深链接直进其它屏：开场白不打扰，首次回首屏时才敲
      const io = new IntersectionObserver((es) => {
        if (es.some((en) => en.isIntersecting)) {
          io.disconnect();
          setTimeout(play, 600);
        }
      }, { threshold: 0.35 });
      io.observe(host);
    } else {
      setTimeout(play, 1200);              // 首屏就在眼前：等入场浪落定就开打
    }
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
    if (map[h]) markDock(map[h]);
    else markDock('s-hero');
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
            markDock(en.target.id);
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
  initAvatar();
  initReveal();
  initProjects();
  initScrollHint();
  initWelcomeType();
  initHashNav();
  initOrbNav();
  initOrbPlanets();
  initDock();
  initPointer();
  initHeroVideo();
  initHeroFx();
})();
