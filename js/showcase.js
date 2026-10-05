/**
 * ============================================================
 * showcase.js · 炫技区（主站第四屏，挂在 #s-showcase 场景内）
 * ------------------------------------------------------------
 * 五张会动的玻璃卡：
 *   ① 容器变形 7 连 —— GSAP 状态机（上一步/下一步/自动轮播/点画面推进）
 *   ② 金属漆笔刷   —— Canvas 厚漆笔触（预渲染印章 + 湿漆高光，事件驱动不占 rAF）
 *   ③ 磁吸线条     —— Canvas 指针物理（铁屑转向；触屏拖动/点按都生效）
 *   ④ 碎金星野     —— Canvas 粒子（星云 + 金屑 + 双层星 + 流星 + 指针视差）
 *   ⑤ 流场丝带     —— Canvas 流场（预热带出满屏丝带河，指针搅动漩涡）
 * 性能红线：IO 0.12 滚出即停 / visibilitychange 停 / perf-lite 让位 /
 *   resize 重置 / DPR ≤ 1.5 / 减弱动态=静态单帧 / 交互画布 touch-action:none
 * 主题 / 材质 / 揭示 / 标题逐字归 main.js 管，这里只管五张卡。
 * ============================================================
 */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // 调试：?reduced=1 强制减弱动态（看各引擎静态单帧）/ =0 强制完整动效
  const REDUCED_PARAM = (location.search.match(/[?&]reduced=(0|1)/) || [])[1];
  const REDUCED = REDUCED_PARAM ? REDUCED_PARAM === '1'
    : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const USE_GSAP = typeof window.gsap !== 'undefined' && !REDUCED;

  const perfLite = () => document.body.classList.contains('perf-lite');

  /* ================= 画布引擎骨架 =================
   * 统一接管：尺寸/DPR、IO 滚出即停、切后台停、perf-lite 让位、
   * resize 重置、减弱动态=静态单帧；各卡只写 frame(ctx,W,H,t,dt)。 */
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
      if (perfLite()) { stop(); return; }   // 低性能模式：演示卡让位（与首屏波光同规矩）
      if (COARSE_MS && now - last < COARSE_MS - 3) { raf = requestAnimationFrame(frame); return; }
      const dt = last ? clamp(now - last, 0, 50) / 1000 : 0.016;
      last = now; t += dt;
      spec.frame(ctx, eng.W, eng.H, t, dt);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || REDUCED || !spec.frame || perfLite()) return;
      running = true; last = 0;
      raf = requestAnimationFrame(frame);
    }
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

    /* 自动轮播：滚出视口 / 切后台 / 低性能模式即暂停，回来接着播 */
    function disarm() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
    function arm() { disarm(); autoTimer = setInterval(() => go((idx + 1) % STATES.length, true), 2600); }
    function syncAuto() {
      (auto && visible && !document.hidden && !REDUCED && !perfLite()) ? arm() : disarm();
    }

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

  /* ================= ② 金属漆笔刷 v2 =================
   * 厚漆印章笔触：预渲染「暗缘→亮体→偏光高光」的径向渐变圆片，
   * 沿轨迹密集盖章成有体积的漆条，顶侧再走一条湿漆白芯；
   * 色相随笔迹长度在青绿 ↔ 金橙间游走，甩得越快漆越细。
   * 事件驱动不占 rAF；开场先画一道签名弧，卡一进来就是成品。 */
  function initBrush() {
    const st = { on: false, last: null, dist: 0, cleared: false };
    let ctx = null;   // makeEngine 首次 resize 时就绪（签名弧在那之前就要画）
    const sprites = new Map();   // 印章精灵按色相分桶缓存（24 桶），运行期只做 drawImage
    const hue = () => 105 + 85 * Math.sin((st.dist + 380) * 0.006);   // 青绿 ↔ 金橙
    const eng = makeEngine('st-brush', {
      alwaysPointer: true,
      touch: true,
      resize(c, W, H) { ctx = c; if (!REDUCED && !st.cleared) flourish(c, W, H); },
      static(c, W, H) { ctx = c; flourish(c, W, H); },   // 减弱动态也留一道签名弧当样品
      pointer: {
        down(p) {
          st.on = true; st.last = p;
          const wm = byId('brush-wm'); if (wm) wm.classList.add('off');
          dab(p.x, p.y, 16);
        },
        move(p) { if (!st.on || !st.last) return; seg(st.last, p); st.last = p; },
        up() { st.on = false; st.last = null; },
        leave() { st.on = false; st.last = null; }
      }
    });
    if (!eng) return;

    function sprite(hBin) {
      const bin = ((Math.round(hBin / 15) % 24) + 24) % 24;
      let s = sprites.get(bin);
      if (s) return s;
      s = document.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(25, 25, 2, 32, 32, 31);
      g.addColorStop(0, 'hsl(' + hBin + ',72%,80%)');      // 高光核（偏左上光源）
      g.addColorStop(0.3, 'hsl(' + hBin + ',74%,58%)');    // 亮体
      g.addColorStop(0.64, 'hsl(' + hBin + ',70%,40%)');   // 深体
      g.addColorStop(0.88, 'hsl(' + hBin + ',62%,24%)');   // 暗缘
      g.addColorStop(1, 'hsla(' + hBin + ',60%,14%,0)');   // 淡出融入底漆
      c.fillStyle = g;
      c.beginPath(); c.arc(32, 32, 31, 0, Math.PI * 2); c.fill();
      sprites.set(bin, s);
      return s;
    }
    function dab(x, y, w) {
      ctx.drawImage(sprite(hue()), x - w / 2, y - w / 2, w, w);
    }
    function seg(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.8) return;
      st.dist += len;
      const h = hue();
      const w = clamp(26 - len * 0.5, 10, 26);   // 甩得越快漆越细
      const n = Math.max(1, Math.ceil(len / 2.5));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        dab(a.x + dx * t + (Math.random() - 0.5) * 1.2,
            a.y + dy * t + (Math.random() - 0.5) * 1.2,
            w * (0.94 + 0.06 * Math.sin(st.dist * 0.05 + i)));
      }
      // 湿漆高光：白色细芯沿轨迹顶侧走
      ctx.strokeStyle = 'hsla(' + h + ',45%,94%,0.5)';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.2, w * 0.14);
      ctx.beginPath();
      ctx.moveTo(a.x - w * 0.05, a.y - w * 0.16);
      ctx.lineTo(b.x - w * 0.05, b.y - w * 0.16);
      ctx.stroke();
      if (len > 14 && Math.random() < 0.4) {     // 甩出的亮漆点
        ctx.fillStyle = 'hsla(' + h + ',85%,74%,0.85)';
        ctx.beginPath();
        ctx.arc(b.x + (Math.random() - 0.5) * 22, b.y + (Math.random() - 0.5) * 22,
                0.8 + Math.random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    function flourish(ctx, W, H) {   // 开场签名弧
      const x0 = W * 0.12, x1 = W * 0.88;
      let prev = null;
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const p = { x: x0 + (x1 - x0) * t,
                    y: H * 0.55 - Math.sin(t * Math.PI * 1.35) * H * 0.32 };
        if (prev) seg(prev, p); else dab(p.x, p.y, 18);
        prev = p;
      }
    }
    byId('brush-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, eng.W, eng.H);
      st.dist = 0; st.cleared = true;
      const wm = byId('brush-wm'); if (wm) wm.classList.remove('off');
    });
  }

  /* ================= ③ 磁吸线条 =================
   * 一片「铁屑」：平时被慢速流场轻轻吹着，指针/手指靠近像被磁铁
   * 吸住转向、拉长、点亮；触屏抬手后磁场保留一拍再散，
   * 磁极处画一团呼吸的光晕，手机上也能看见「吸」在哪。 */
  function initMagnet() {
    const ptr = { x: -1e4, y: -1e4, on: false };
    let lines = [], glow = null, releaseTimer = 0;
    function draw(ctx, W, H, t, live) {
      ctx.clearRect(0, 0, W, H);
      if (live && ptr.on && glow) {
        ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 3);
        ctx.drawImage(glow, ptr.x - 48, ptr.y - 48);
        ctx.globalAlpha = 1;
      }
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
          ? 'rgba(61,134,141,' + (0.35 + 0.55 * k).toFixed(3) + ')'
          : 'rgba(23,38,43,0.36)';
        ctx.lineWidth = 1.4 + 1.1 * k;
        const ca = Math.cos(L.a) * hl, sa = Math.sin(L.a) * hl;
        ctx.beginPath();
        ctx.moveTo(L.x - ca, L.y - sa);
        ctx.lineTo(L.x + ca, L.y + sa);
        ctx.stroke();
      }
    }
    function poke(p) {        // 指针/手指都走这里：点按也算「吸」
      clearTimeout(releaseTimer);
      ptr.x = p.x; ptr.y = p.y; ptr.on = true;
    }
    makeEngine('st-magnet', {
      touch: true,
      resize(ctx, W, H) {
        lines = [];
        const sp = W < 420 ? 24 : 28;
        for (let y = sp * 0.5; y < H; y += sp)
          for (let x = sp * 0.5; x < W; x += sp)
            lines.push({ x: x, y: y, a: (Math.random() - 0.5) * 0.6, ph: Math.random() * Math.PI * 2 });
        if (!glow) {          // 磁极光晕精灵
          glow = document.createElement('canvas');
          glow.width = glow.height = 96;
          const c = glow.getContext('2d');
          const g = c.createRadialGradient(48, 48, 4, 48, 48, 48);
          g.addColorStop(0, 'rgba(61,134,141,0.42)');
          g.addColorStop(1, 'rgba(61,134,141,0)');
          c.fillStyle = g;
          c.fillRect(0, 0, 96, 96);
        }
      },
      pointer: {
        down(p) { poke(p); },
        move(p) { poke(p); },
        up() {   // 触屏抬手：磁场保留一拍再散（鼠标随后续 move/leave 接管）
          clearTimeout(releaseTimer);
          releaseTimer = setTimeout(() => { ptr.on = false; }, 1200);
        },
        leave() { clearTimeout(releaseTimer); ptr.on = false; }
      },
      frame(ctx, W, H, t) { draw(ctx, W, H, t, true); },
      static(ctx, W, H) { draw(ctx, W, H, 1.7, false); }
    });
  }

  /* ================= ④ 碎金星野 v2 =================
   * 深空金屑小剧场：三团预渲染星云慢慢呼吸，金屑片（菱/长/角三种
   * 渐变精灵）自转上浮，远星眨眼、近星带四芒光晕，每隔几秒一颗流星；
   * 桌面端指针划过还有分层视差。全部 drawImage 精灵，无逐帧渐变。 */
  function initStar() {
    const ptr = { x: 0, y: 0, on: false };
    const S = {};   // 预渲染精灵
    let bgGrad = null, nebulae = [], stars = [], shards = [], meteor = null, nextMeteor = 2.5;

    function makeSprite(w, h, draw) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'));
      return c;
    }
    function buildSprites() {
      const nebula = (col) => makeSprite(256, 256, (c) => {
        const g = c.createRadialGradient(128, 128, 8, 128, 128, 126);
        g.addColorStop(0, col);
        g.addColorStop(1, col.replace(/,[^,]+\)$/, ',0)'));
        c.fillStyle = g;
        c.fillRect(0, 0, 256, 256);
      });
      S.nebGold = nebula('rgba(242,185,140,0.32)');
      S.nebTeal = nebula('rgba(64,150,156,0.3)');
      S.nebPale = nebula('rgba(255,240,220,0.15)');
      S.star = makeSprite(56, 56, (c) => {   // 四芒亮星
        const g = c.createRadialGradient(28, 28, 0, 28, 28, 26);
        g.addColorStop(0, 'rgba(255,246,224,0.95)');
        g.addColorStop(0.25, 'rgba(255,224,160,0.5)');
        g.addColorStop(1, 'rgba(255,224,160,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 56, 56);
        c.strokeStyle = 'rgba(255,244,214,0.9)';
        c.lineWidth = 1.4;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(28, 7); c.lineTo(28, 49);
        c.moveTo(7, 28); c.lineTo(49, 28);
        c.stroke();
      });
      S.flake = [0, 1, 2].map((v) => makeSprite(44, 44, (c) => {   // 金屑片三型
        c.translate(22, 22);
        const g = c.createLinearGradient(-14, -14, 14, 14);
        g.addColorStop(0, 'hsl(46,90%,78%)');
        g.addColorStop(0.5, 'hsl(40,85%,55%)');
        g.addColorStop(1, 'hsl(30,70%,30%)');
        c.fillStyle = g;
        c.beginPath();
        if (v === 0) { c.moveTo(0, -15); c.lineTo(11, 0); c.lineTo(0, 15); c.lineTo(-11, 0); }         // 菱片
        else if (v === 1) { c.moveTo(-16, -4); c.lineTo(16, -2); c.lineTo(14, 4); c.lineTo(-14, 3); }  // 长屑
        else { c.moveTo(0, -13); c.lineTo(12, 9); c.lineTo(-12, 9); }                                  // 碎角
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(255,240,200,0.5)';
        c.lineWidth = 1;
        c.stroke();
      }));
    }
    function seed(W, H) {
      const k = COARSE ? 0.72 : 1;
      const R = Math.max(W, H);
      nebulae = [
        { s: S.nebGold, x: W * 0.2,  y: H * 0.3,  r: R * 0.6, ph: 0,   amp: 10, a: 0.8 },
        { s: S.nebTeal, x: W * 0.8,  y: H * 0.72, r: R * 0.65, ph: 2.1, amp: 14, a: 0.75 },
        { s: S.nebPale, x: W * 0.55, y: H * 0.12, r: R * 0.42, ph: 4.2, amp: 8,  a: 0.55 }
      ];
      stars = [];
      const nFar = Math.round(clamp(W * H / 9000, 26, 70) * k);
      for (let i = 0; i < nFar; i++)
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.1,
                     ph: Math.random() * 6.28, tw: 0.4 + Math.random() * 1.4, near: false });
      const nNear = Math.round(clamp(W * H / 26000, 8, 22) * k);
      for (let i = 0; i < nNear; i++)
        stars.push({ x: Math.random() * W, y: Math.random() * H, s: 11 + Math.random() * 14,
                     ph: Math.random() * 6.28, tw: 0.5 + Math.random() * 1.1, near: true });
      shards = [];
      const n = Math.round(clamp(W * H / 3400, 20, 54) * k);
      for (let i = 0; i < n; i++) {
        const z = 0.35 + Math.random() * 0.65;
        shards.push({ x: Math.random() * W, y: Math.random() * H, z: z,
                      s: (16 + Math.random() * 22) * z, img: S.flake[i % 3],
                      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.7,
                      ph: Math.random() * 6.28, tw: 0.5 + Math.random() * 1.2 });
      }
    }
    function draw(ctx, W, H, t, dt) {
      const px = (!COARSE && ptr.on) ? ptr.x - W / 2 : 0;   // 指针视差（桌面）
      const py = (!COARSE && ptr.on) ? ptr.y - H / 2 : 0;
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      for (const n of nebulae) {
        const nx = n.x + Math.sin(t * 0.05 + n.ph) * n.amp - px * 0.012;
        const ny = n.y + Math.cos(t * 0.04 + n.ph * 1.3) * n.amp * 0.7 - py * 0.012;
        ctx.globalAlpha = n.a;
        ctx.drawImage(n.s, nx - n.r / 2, ny - n.r / 2, n.r, n.r);
      }
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.tw + s.ph);
        const ox = -px * 0.02, oy = -py * 0.02;
        if (!s.near) {
          ctx.globalAlpha = 0.12 + 0.5 * tw;
          ctx.fillStyle = '#ffe9c2';
          ctx.fillRect(s.x + ox, s.y + oy, s.r, s.r);
        } else {
          ctx.globalAlpha = 0.35 + 0.6 * tw;
          const d = s.s * (0.8 + 0.25 * tw);
          ctx.drawImage(S.star, s.x + ox - d / 2, s.y + oy - d / 2, d, d);
        }
      }
      for (const f of shards) {
        if (dt) {
          f.y -= (5 + 7 * f.z) * dt;
          f.x += Math.sin(t * 0.35 + f.ph) * 4 * dt;
          f.rot += f.vr * dt;
          if (f.y < -26) { f.y = H + 26; f.x = Math.random() * W; }
          if (f.x < -26) f.x = W + 26; else if (f.x > W + 26) f.x = -26;
        }
        ctx.save();
        ctx.translate(f.x - px * 0.02 * f.z, f.y - py * 0.02 * f.z);
        ctx.rotate(f.rot);
        ctx.globalAlpha = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(t * f.tw + f.ph));
        ctx.drawImage(f.img, -f.s / 2, -f.s / 2, f.s, f.s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (dt) {
        nextMeteor -= dt;
        if (!meteor && nextMeteor <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          meteor = { x: W * (0.25 + Math.random() * 0.55), y: H * (0.05 + Math.random() * 0.2),
                     vx: dir * (170 + Math.random() * 120), vy: 110 + Math.random() * 70, life: 0.9 };
          nextMeteor = 4 + Math.random() * 4;
        }
        if (meteor) {
          meteor.x += meteor.vx * dt;
          meteor.y += meteor.vy * dt;
          meteor.life -= dt;
          if (meteor.life <= 0) meteor = null;
        }
      }
      if (meteor) {
        const a = Math.max(0, Math.min(1, meteor.life * 2.2, (0.9 - meteor.life) * 6));
        const tx = meteor.x - meteor.vx * 0.1, ty = meteor.y - meteor.vy * 0.1;
        const g = ctx.createLinearGradient(meteor.x, meteor.y, tx, ty);
        g.addColorStop(0, 'rgba(255,248,228,' + (0.9 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,248,228,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
    }
    makeEngine('st-star', {
      pointer: {   // 仅为视差（桌面悬停）
        move(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        leave() { ptr.on = false; }
      },
      resize(ctx, W, H) {
        bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#0a1c24');
        bgGrad.addColorStop(0.55, '#0f2e37');
        bgGrad.addColorStop(1, '#0a2028');
        if (!S.flake) buildSprites();
        seed(W, H);
      },
      frame(ctx, W, H, t, dt) { draw(ctx, W, H, t, dt); },
      static(ctx, W, H) { draw(ctx, W, H, 2.6, 0); }
    });
  }

  /* ================= ⑤ 流场丝带 v2 =================
   * 满屏丝带河：开场先静默推演 150 步把丝带推满（第一帧就是成品，
   * 不再「越看越好看」）；粒子带宽度分层与生命周期淡入淡出，少数
   * 亮金丝提亮；指针划过搅出切向漩涡并把丝带拨开，离开后自动愈合。 */
  function initFlow() {
    const ptr = { x: -1e4, y: -1e4, on: false };
    let ps = [];
    const FADE = 'rgba(9,24,30,0.08)';
    function spawn(p, W, H) {
      p.x = Math.random() * W; p.y = Math.random() * H;
      p.px = p.x; p.py = p.y;
      p.max = 5 + Math.random() * 7;          // 生命周期（秒）
      p.age = Math.random() * p.max;
      p.ph = Math.random() * Math.PI * 2;
      p.w = 0.8 + Math.random() * 1.8;        // 宽度分层
      p.bright = Math.random() < 0.06;        // 少数亮金丝
    }
    function seed(W, H) {
      ps = [];
      const n = Math.round(clamp(W * H / 1050, 80, 200) * (COARSE ? 0.7 : 1));
      for (let i = 0; i < n; i++) { const p = {}; spawn(p, W, H); ps.push(p); }
    }
    function angle(x, y, t) {
      return Math.sin(x * 0.0042 + t * 0.16) * 1.9
           + Math.cos(y * 0.0051 - t * 0.12) * 1.9
           + Math.sin((x + y) * 0.0016 + t * 0.05) * 0.8;
    }
    function step(ctx, W, H, t, dt, fade) {
      if (fade) { ctx.fillStyle = FADE; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        let a = angle(p.x, p.y, t);
        if (ptr.on) {
          const dx = p.x - ptr.x, dy = p.y - ptr.y;
          const d = Math.hypot(dx, dy);
          if (d < 150 && d > 0.5) {
            const k = 1 - d / 150;
            a = lerpAngle(a, Math.atan2(dy, dx) + Math.PI / 2, k * 0.8);   // 切向漩涡
            p.x += (dx / d) * k * 26 * dt;                                 // 往外拨，丝带让位
            p.y += (dy / d) * k * 26 * dt;
          }
        }
        p.px = p.x; p.py = p.y;
        p.x += Math.cos(a) * 34 * dt;
        p.y += Math.sin(a) * 34 * dt;
        p.age += dt;
        if (p.age >= p.max || p.x < -8 || p.x > W + 8 || p.y < -8 || p.y > H + 8) { spawn(p, W, H); continue; }
        const a2 = Math.sin(Math.PI * p.age / p.max) * (p.bright ? 0.75 : 0.4);   // 淡入淡出
        const hue = 105 + 85 * Math.sin(t * 0.2 + p.ph);
        ctx.strokeStyle = p.bright
          ? 'hsla(46,90%,80%,' + a2.toFixed(3) + ')'
          : 'hsla(' + hue + ',74%,60%,' + a2.toFixed(3) + ')';
        ctx.lineWidth = p.w;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    function prewarm(ctx, W, H) {
      for (let i = 0; i < 150; i++) step(ctx, W, H, 4 + i * 0.033, 0.033, false);
    }
    makeEngine('st-flow', {
      touch: true,
      resize(ctx, W, H) {
        seed(W, H);
        ctx.fillStyle = '#0a1c23';
        ctx.fillRect(0, 0, W, H);
        prewarm(ctx, W, H);
      },
      pointer: {
        move(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        leave() { ptr.on = false; }
      },
      frame(ctx, W, H, t, dt) { step(ctx, W, H, t, dt, true); },
      static(ctx, W, H) {
        ctx.fillStyle = '#0a1c23'; ctx.fillRect(0, 0, W, H);
        prewarm(ctx, W, H);
      }
    });
  }

  /* ================= 启动（舞台不存在时各卡自行跳过） ================= */
  [initMorph, initBrush, initMagnet, initStar, initFlow].forEach((f) => f());
})();
