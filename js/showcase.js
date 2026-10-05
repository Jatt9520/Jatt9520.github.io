/**
 * ============================================================
 * showcase.js · 炫技区（独立页）
 * ------------------------------------------------------------
 * 五张会动的玻璃卡：
 *   ① 容器变形 7 连 —— GSAP 状态机（上一步/下一步/自动轮播/点画面推进）
 *   ② 金属漆笔刷   —— Canvas 笔迹（事件驱动，不占 rAF）
 *   ③ 磁吸线条     —— Canvas 指针物理（铁屑转向）
 *   ④ 碎金星野     —— Canvas 粒子（金屑上浮 + 闪烁）
 *   ⑤ 流场丝带     —— Canvas 流场（指针搅动漩涡）
 * 性能红线：IO 0.12 滚出即停 / visibilitychange 停 /
 *   resize 重置 / DPR ≤ 1.5 / 减弱动态=静态单帧 / 交互画布 touch-action:none
 * 主题与材质跟随主站的选择（同一 localStorage 键）。
 * ============================================================
 */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // 调试：?reduced=1 强制减弱动态（看各引擎的静态单帧）/ =0 强制完整动效；
  // 不传则按系统偏好。与主站 ?autotilt= 参数同一套路。
  const REDUCED_PARAM = (location.search.match(/[?&]reduced=(0|1)/) || [])[1];
  const REDUCED = REDUCED_PARAM ? REDUCED_PARAM === '1'
    : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const USE_GSAP = typeof window.gsap !== 'undefined' && !REDUCED;
  // 主题/材质键与主站 config.js 保持一致（本页不加载 config.js）
  const THEME_KEY = 'theme_mode';
  const GLASS_KEY = 'glass_mode';

  /* ================= 主题与材质：跟随主站 ================= */
  const palette = { ink: 'rgba(23,38,43,0.36)', hotLine: 'rgba(61,134,141,' };
  function refreshPalette() {
    const dark = document.body.classList.contains('dark');
    palette.ink = dark ? 'rgba(230,240,242,0.4)' : 'rgba(23,38,43,0.36)';
    palette.hotLine = dark ? 'rgba(143,208,213,' : 'rgba(61,134,141,';
  }
  function initTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const mode = localStorage.getItem(THEME_KEY) || 'auto';
      document.body.classList.toggle('dark', mode === 'dark' || (mode === 'auto' && mq.matches));
      refreshPalette();
    };
    const onSys = () => { if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
    apply();
    // 玻璃材质：主站里没关过就开启（body.glass-enabled 缺席 = 实底样式）
    if (localStorage.getItem(GLASS_KEY) !== 'disabled') document.body.classList.add('glass-enabled');
  }

  /* ================= 滚动揭示 + 标题逐字 ================= */
  function initReveal() {
    const els = Array.from(document.querySelectorAll('.reveal'));
    els.forEach((el, i) => el.style.setProperty('--rd', (i * 0.08).toFixed(2) + 's'));
    const title = document.querySelector('.scene-title');
    if (USE_GSAP && title) {
      const text = title.textContent;
      title.setAttribute('aria-label', text);          // 完整文本留给读屏
      title.textContent = '';
      [...text].forEach((ch) => {
        const s = document.createElement('span');
        s.className = 'char';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = ch;
        title.appendChild(s);
      });
      gsap.fromTo(title.querySelectorAll('.char'),
        { opacity: 0, y: 16, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75, stagger: 0.06,
          ease: 'power3.out', delay: 0.15, clearProps: 'filter' });
    }
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
  }

  /* ================= 画布引擎骨架 =================
   * 统一接管：尺寸/DPR、IO 滚出即停、切后台停、resize 重置、
   * 减弱动态=静态单帧；各卡只写 frame(ctx,W,H,t,dt)。 */
  function makeEngine(stageId, spec) {
    const stage = byId(stageId);
    if (!stage) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-fx';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);
    const ctx = canvas.getContext('2d');
    const eng = { canvas: canvas, ctx: ctx, stage: stage, W: 0, H: 0 };
    const COARSE_MS = COARSE ? 33 : 0;      // 触屏 30fps 节流
    let raf = 0, running = false, inView = false, last = 0, t = 0;

    function resize() {
      const W = stage.clientWidth, H = stage.clientHeight;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);   // 红线：DPR 上限 1.5
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      eng.W = W; eng.H = H;
      if (spec.resize) spec.resize(ctx, W, H);
      if (REDUCED) { if (spec.static) spec.static(ctx, W, H); return; }
      if (spec.frame) spec.frame(ctx, W, H, t, 0.016);   // 尺寸变化立即补一帧，避免闪空
    }
    function frame(now) {
      if (!running) return;
      if (COARSE_MS && now - last < COARSE_MS - 3) { raf = requestAnimationFrame(frame); return; }
      const dt = last ? clamp(now - last, 0, 50) / 1000 : 0.016;
      last = now; t += dt;
      spec.frame(ctx, eng.W, eng.H, t, dt);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || REDUCED || !spec.frame) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    resize();
    window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        es.forEach((en) => {
          inView = en.isIntersecting;                 // 红线：滚出 0.12 即停
          if (!REDUCED) (inView ? start() : stop());
        });
      }, { threshold: 0.12 }).observe(stage);
    } else if (!REDUCED) start();
    document.addEventListener('visibilitychange', () => {   // 红线：切后台即停
      if (document.hidden) stop();
      else if (inView && !REDUCED) start();
    });

    /* 指针（换算到画布坐标，rect 走缓存）；减弱动态下仅笔刷仍可手绘 */
    if (spec.pointer && (!REDUCED || spec.alwaysPointer)) {
      let rect = stage.getBoundingClientRect();
      let rT = 0;
      const refresh = () => { rect = stage.getBoundingClientRect(); };
      const queueRefresh = () => { clearTimeout(rT); rT = setTimeout(refresh, 160); };
      window.addEventListener('scroll', queueRefresh, { passive: true });
      stage.addEventListener('pointerenter', refresh);
      const local = (e) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      stage.addEventListener('pointerdown', (e) => {
        refresh();
        if (spec.touch) { try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } }
        if (spec.pointer.down) spec.pointer.down(local(e), e);
      });
      if (spec.pointer.move) stage.addEventListener('pointermove', (e) => spec.pointer.move(local(e), e));
      const up = (e) => { if (spec.pointer.up) spec.pointer.up(local(e), e); };
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      if (spec.pointer.leave) stage.addEventListener('pointerleave', (e) => spec.pointer.leave(local(e), e));
    }
    return eng;
  }

  /* 角度插值：走最短弧，避免 ±π 边界绕远路 */
  function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }

  /* ================= ① 容器变形 7 连 =================
   * 七个几何状态循环：圆点 → 胶囊 → 卡片 → 紧凑条 → 大卡（锚左上
   * 生长）→ 宽条（内容重排）→ 沿来路收回圆点（✓）。 */
  const STATES = [
    { w: 56,  h: 56,  r: 28, g: 'g-icon',   label: 'Circle to Pill',      tip: '起点 · 一枚圆点' },
    { w: 220, h: 56,  r: 28, g: 'g-pill',   label: 'Pill to Card',        tip: '圆点 → 胶囊，文字浮出' },
    { w: 250, h: 150, r: 22, g: 'g-card',   label: 'Compact to Expanded', tip: '胶囊 → 卡片，内容成组出现' },
    { w: 250, h: 88,  r: 44, g: 'g-upload', label: 'Corner Radius Morph', tip: '卡片 → 紧凑条，圆角滑成全圆' },
    { w: 300, h: 170, r: 20, g: 'g-size',   label: 'Size Morph',          tip: '紧凑条 → 大卡，锚定左上角生长' },
    { w: 330, h: 104, r: 24, g: 'g-reflow', label: 'Content Reflow',      tip: '大卡 → 宽条，内容上下换成左右' },
    { w: 56,  h: 56,  r: 28, g: 'g-done',   label: 'Reverse Collapse',    tip: '宽条 → 圆点，沿来路收回落个 ✓' }
  ];

  function initMorph() {
    const stage = byId('st-morph');
    if (!stage) return;
    const fit = stage.querySelector('.morph-fit');
    const box = stage.querySelector('.morph-box');
    const labelEl = byId('morph-label');
    const btnPrev = byId('morph-prev');
    const btnNext = byId('morph-next');
    const btnAuto = byId('morph-auto');
    const groups = {};
    stage.querySelectorAll('.m-group').forEach((el) => { groups[el.dataset.g] = el; });
    let idx = 0, auto = false, autoTimer = null, visible = true;

    if (USE_GSAP) Object.keys(groups).forEach((k) => { groups[k].style.transition = 'none'; });   // 防与 GSAP 双重平滑
    if (REDUCED) btnAuto.disabled = true;

    /* 舞台比最大态（330px）窄时整体等比缩放，几何参数保持设计值 */
    function applyFit() {
      const s = Math.min(1, (stage.clientWidth - 14) / 330);
      fit.style.transform = s < 1 ? 'scale(' + s.toFixed(3) + ')' : '';
      place(idx, false);
    }

    /* 位置：默认在盒区内居中；态 4/5 共享左上角（Size Morph 锚定生长） */
    function rectOf(i) {
      const W = stage.clientWidth, H = stage.clientHeight;
      const top = 6, bot = H - 40;             // 底部留给 0X / 07 标签
      const s = STATES[i];
      if (i === 3 || i === 4) return { l: (W - 300) / 2, t: bot - 170 };
      return { l: (W - s.w) / 2, t: top + (bot - top - s.h) / 2 };
    }
    function place(i, anim) {
      const s = STATES[i], r = rectOf(i);
      if (window.gsap) gsap.killTweensOf(box);
      if (USE_GSAP && anim) {
        gsap.to(box, { left: r.l, top: r.t, width: s.w, height: s.h, borderRadius: s.r,
                       duration: 0.6, ease: 'power3.inOut' });
      } else {
        box.style.left = r.l + 'px';
        box.style.top = r.t + 'px';
        box.style.width = s.w + 'px';
        box.style.height = s.h + 'px';
        box.style.borderRadius = s.r + 'px';
      }
    }
    function setGroup(el, on, anim) {
      if (window.gsap) gsap.killTweensOf(el);
      if (USE_GSAP && anim) {
        if (on) gsap.fromTo(el, { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.4, delay: 0.22, ease: 'power2.out', clearProps: 'transform' });
        else gsap.to(el, { opacity: 0, duration: 0.18, ease: 'power1.in' });
      } else {
        if (window.gsap) gsap.set(el, { clearProps: 'opacity,transform' });
        el.style.opacity = on ? 1 : 0;
      }
    }
    function updateLabel() {
      const s = STATES[idx];
      labelEl.textContent = '0' + (idx + 1) + ' / 07 · ' + s.label + ' —— ' + s.tip;
      if (USE_GSAP) gsap.fromTo(labelEl, { opacity: 0.35 }, { opacity: 1, duration: 0.35, ease: 'power1.out' });
    }

    function go(i, anim) {
      if (i === idx) return;
      const prev = idx;
      idx = i;
      if (STATES[prev].g === 'g-reflow') groups['g-reflow'].classList.remove('row');
      place(i, anim);
      Object.keys(groups).forEach((k) => setGroup(groups[k], k === STATES[i].g, anim));
      if (STATES[i].g === 'g-reflow') {
        // 到位再切横排：先竖排淡入，变形落定后内容重排成一行
        if (anim && USE_GSAP) setTimeout(() => { if (idx === i) groups['g-reflow'].classList.add('row'); }, 640);
        else groups['g-reflow'].classList.add('row');
      }
      updateLabel();
    }

    /* 自动轮播：滚出视口 / 切后台即暂停，回来接着播 */
    function disarm() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
    function arm() { disarm(); autoTimer = setInterval(() => go((idx + 1) % STATES.length, true), 2600); }
    function syncAuto() { (auto && visible && !document.hidden && !REDUCED) ? arm() : disarm(); }

    btnNext.addEventListener('click', () => { go((idx + 1) % STATES.length, true); if (auto) arm(); });
    btnPrev.addEventListener('click', () => { go((idx + STATES.length - 1) % STATES.length, true); if (auto) arm(); });
    btnAuto.addEventListener('click', () => {
      auto = !auto;
      btnAuto.textContent = auto ? '⏸ 暂停轮播' : '▶ 自动轮播';
      btnAuto.setAttribute('aria-pressed', String(auto));
      syncAuto();
    });
    stage.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;      // 控件自己管自己
      go((idx + 1) % STATES.length, true);
      if (auto) arm();
    });
    document.addEventListener('visibilitychange', syncAuto);
    window.addEventListener('resize', applyFit);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        es.forEach((en) => { visible = en.isIntersecting; syncAuto(); });
      }, { threshold: 0.12 }).observe(stage);
    }

    /* 首态就位 */
    applyFit();
    box.style.opacity = '1';
    setGroup(groups['g-icon'], true, false);
    updateLabel();
  }

  /* ================= ② 金属漆笔刷 =================
   * 事件驱动（不占 rAF）：横断面亮芯暗缘的渐变就是漆面金属光泽，
   * 色相随笔迹长度在青绿 ↔ 金橙间游走，甩得越快漆越细，还会溅点。 */
  function initBrush() {
    const st = { on: false, last: null, dist: 0 };
    const eng = makeEngine('st-brush', {
      alwaysPointer: true,
      touch: true,
      pointer: {
        down(p) {
          st.on = true; st.last = p;
          const wm = byId('brush-wm'); if (wm) wm.classList.add('off');
          dot(p);
        },
        move(p) { if (!st.on || !st.last) return; seg(st.last, p); st.last = p; },
        up() { st.on = false; st.last = null; },
        leave() { st.on = false; st.last = null; }
      }
    });
    if (!eng) return;
    const ctx = eng.ctx;
    const hue = () => 105 + 85 * Math.sin(st.dist * 0.006);   // 青绿 ↔ 金橙
    function dot(p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(' + hue() + ',62%,40%)';
      ctx.fill();
    }
    function seg(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1.2) return;
      st.dist += len;
      const h = hue();
      const w = clamp(15 - len * 0.16, 4.5, 15);   // 甩得越快漆越细
      const nx = -dy / len, ny = dx / len;
      const g = ctx.createLinearGradient(a.x + nx * w / 2, a.y + ny * w / 2,
                                         a.x - nx * w / 2, a.y - ny * w / 2);
      g.addColorStop(0, 'hsl(' + h + ',58%,26%)');
      g.addColorStop(0.5, 'hsl(' + h + ',72%,62%)');
      g.addColorStop(1, 'hsl(' + h + ',58%,26%)');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = 'hsla(' + h + ',45%,92%,0.8)';   // 高光芯
      ctx.lineWidth = Math.max(1, w * 0.2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (len > 9 && Math.random() < 0.5) {              // 甩出的漆点
        ctx.fillStyle = 'hsla(' + h + ',80%,70%,0.8)';
        ctx.beginPath();
        ctx.arc(b.x + (Math.random() - 0.5) * 16, b.y + (Math.random() - 0.5) * 16,
                0.7 + Math.random() * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    byId('brush-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, eng.W, eng.H);
      st.dist = 0;
      const wm = byId('brush-wm'); if (wm) wm.classList.remove('off');
    });
  }

  /* ================= ③ 磁吸线条 =================
   * 一片「铁屑」：平时被慢速流场轻轻吹着，指针靠近像被磁铁吸住
   * 转向、拉长、点亮，离开后弹回自己的方向。 */
  function initMagnet() {
    const ptr = { x: -1e4, y: -1e4, on: false };
    let lines = [];
    function draw(ctx, W, H, t, live) {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        const base = (Math.sin(L.x * 0.012 + t * 0.42 + L.ph) + Math.cos(L.y * 0.014 - t * 0.3)) * 0.8;
        let target = base, k = 0;
        if (live && ptr.on) {
          const d = Math.hypot(ptr.x - L.x, ptr.y - L.y);
          if (d < 150) {
            k = Math.pow(1 - d / 150, 1.4);
            target = Math.atan2(ptr.y - L.y, ptr.x - L.x);
          }
        }
        L.a = lerpAngle(L.a, target, 0.1 + 0.26 * k);
        const hl = 6.5 + 5.5 * k;
        ctx.strokeStyle = k > 0.03
          ? palette.hotLine + (0.35 + 0.55 * k).toFixed(3) + ')'
          : palette.ink;
        ctx.lineWidth = 1.4 + 1.1 * k;
        const ca = Math.cos(L.a) * hl, sa = Math.sin(L.a) * hl;
        ctx.beginPath();
        ctx.moveTo(L.x - ca, L.y - sa);
        ctx.lineTo(L.x + ca, L.y + sa);
        ctx.stroke();
      }
    }
    makeEngine('st-magnet', {
      touch: true,
      resize(ctx, W, H) {
        lines = [];
        const sp = W < 420 ? 24 : 28;
        for (let y = sp * 0.5; y < H; y += sp)
          for (let x = sp * 0.5; x < W; x += sp)
            lines.push({ x: x, y: y, a: (Math.random() - 0.5) * 0.6, ph: Math.random() * Math.PI * 2 });
      },
      pointer: {
        move(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        leave() { ptr.on = false; }
      },
      frame(ctx, W, H, t) { draw(ctx, W, H, t, true); },
      static(ctx, W, H) { draw(ctx, W, H, 1.7, false); }
    });
  }

  /* ================= ④ 碎金星野 =================
   * 深色小夜空：金屑小片慢慢上浮、自转、闪烁，远处的亮星在眨眼。 */
  function initStar() {
    let shards = [], dust = [], bg = null;
    function seed(W, H) {
      shards = []; dust = [];
      const n = clamp(Math.round(W * H / 3200), 28, 80);
      for (let i = 0; i < n; i++) {
        const z = 0.35 + Math.random() * 0.65;
        shards.push({
          x: Math.random() * W, y: Math.random() * H, z: z,
          s: (2 + Math.random() * 4.5) * z,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.5,
          ph: Math.random() * Math.PI * 2, tw: 0.5 + Math.random() * 1.3,
          gold: Math.random() < 0.78
        });
      }
      for (let i = 0; i < n + 24; i++)
        dust.push({ x: Math.random() * W, y: Math.random() * H,
                    r: 0.5 + Math.random(), ph: Math.random() * Math.PI * 2,
                    tw: 0.4 + Math.random() * 1.5 });
    }
    function draw(ctx, W, H, t, dt) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        const a = 0.1 + 0.3 * (0.5 + 0.5 * Math.sin(t * d.tw + d.ph));
        ctx.fillStyle = 'rgba(255,240,214,' + a.toFixed(3) + ')';
        ctx.fillRect(d.x, d.y, d.r, d.r);
      }
      for (let i = 0; i < shards.length; i++) {
        const s = shards[i];
        if (dt) {
          s.y -= 6.5 * s.z * dt;
          s.x += Math.sin(t * 0.4 + s.ph) * 3.5 * dt;
          s.rot += s.vr * dt;
          if (s.y < -8) { s.y = H + 8; s.x = Math.random() * W; }
          if (s.x < -8) s.x = W + 8; else if (s.x > W + 8) s.x = -8;
        }
        const a = 0.28 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle = s.gold
          ? 'hsla(42,82%,' + (52 + 16 * s.z).toFixed(0) + '%,' + a.toFixed(3) + ')'
          : 'hsla(186,45%,' + (58 + 12 * s.z).toFixed(0) + '%,' + (a * 0.8).toFixed(3) + ')';
        ctx.fillRect(-s.s / 2, -s.s / 2, s.s, s.s * 0.62);   // 扁片 = 金屑
        ctx.restore();
      }
    }
    makeEngine('st-star', {
      resize(ctx, W, H) {
        bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0b1e25');
        bg.addColorStop(0.55, '#103038');
        bg.addColorStop(1, '#0b2129');
        seed(W, H);
      },
      frame(ctx, W, H, t, dt) { draw(ctx, W, H, t, dt); },
      static(ctx, W, H) { draw(ctx, W, H, 2.6, 0); }
    });
  }

  /* ================= ⑤ 流场丝带 =================
   * 粒子被伪噪声流场推着走，尾巴在低透明覆盖下拖成丝带；
   * 指针划过会搅出一个漩涡。减弱动态时静默推演 240 步摆一帧。 */
  function initFlow() {
    const ptr = { x: -1e4, y: -1e4, on: false };
    let ps = [];
    const FADE = 'rgba(9,24,30,0.075)';
    function spawn(p, W, H) {
      p.x = Math.random() * W; p.y = Math.random() * H;
      p.px = p.x; p.py = p.y;
      p.life = 80 + Math.random() * 160;
      p.ph = Math.random() * Math.PI * 2;
    }
    function seed(W, H) {
      ps = [];
      const n = clamp(Math.round(W * H / 1100), 70, 190);
      for (let i = 0; i < n; i++) {
        const p = {};
        spawn(p, W, H);
        p.life *= Math.random();
        ps.push(p);
      }
    }
    function angle(x, y, t) {
      return Math.sin(x * 0.0042 + t * 0.16) * 1.9
           + Math.cos(y * 0.0051 - t * 0.12) * 1.9
           + Math.sin((x + y) * 0.0016 + t * 0.05) * 0.8;
    }
    function step(ctx, W, H, t, dt, fade) {
      if (fade) { ctx.fillStyle = FADE; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        let a = angle(p.x, p.y, t);
        if (ptr.on) {
          const dx = p.x - ptr.x, dy = p.y - ptr.y;
          const d = Math.hypot(dx, dy);
          if (d < 120 && d > 0.5)
            a = lerpAngle(a, Math.atan2(dy, dx) + Math.PI / 2, (1 - d / 120) * 0.85);
        }
        p.px = p.x; p.py = p.y;
        p.x += Math.cos(a) * 30 * dt;
        p.y += Math.sin(a) * 30 * dt;
        p.life -= dt;
        if (p.life < 0 || p.x < -6 || p.x > W + 6 || p.y < -6 || p.y > H + 6) { spawn(p, W, H); continue; }
        const hue = 105 + 85 * Math.sin(t * 0.22 + p.ph);
        ctx.strokeStyle = 'hsla(' + hue + ',72%,60%,0.5)';
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    makeEngine('st-flow', {
      touch: true,
      resize(ctx, W, H) {
        seed(W, H);
        ctx.fillStyle = '#0a1c23';
        ctx.fillRect(0, 0, W, H);      // 底色铺一次，之后每帧低透明叠加成拖尾
      },
      pointer: {
        move(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        leave() { ptr.on = false; }
      },
      frame(ctx, W, H, t, dt) { step(ctx, W, H, t, dt, true); },
      static(ctx, W, H) {
        ctx.fillStyle = '#0a1c23'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 240; i++) step(ctx, W, H, i / 30, 1 / 30, false);
      }
    });
  }

  /* ================= 启动 ================= */
  initTheme();
  initReveal();
  initMorph();
  initBrush();
  initMagnet();
  initStar();
  initFlow();
})();
