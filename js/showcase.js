/**
 * ============================================================
 * showcase.js · 炫技区（主站第四屏，挂在 #s-showcase 场景内）
 * ------------------------------------------------------------
 * 四张会动的玻璃卡（另有两张 WebGL 旗舰在 showcase-gl.js）：
 *   ① 容器变形 7 连 —— GSAP 状态机（上一步/下一步/自动轮播/点画面推进）
 *   ② 磁吸线条     —— Canvas 指针物理（铁屑转向；触屏拖动/点按都生效）
 *   ③ 流体模拟     —— WebGL Navier-Stokes（见 showcase-gl.js，通栏大舞台）
 *   ④ 液态透镜     —— SDF 光线行进熔球（见 showcase-gl.js，通栏大舞台）
 * 性能红线：IO 0.12 滚出即停 / visibilitychange 停 / perf-lite 让位 /
 *   resize 重置 / DPR ≤ 1.5 / 减弱动态=静态单帧 / 交互画布 touch-action:none
 * 主题 / 材质 / 揭示 / 标题逐字归 main.js 管，这里只管五张卡。
 * ============================================================
 */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // 调试：?reduced=1 强制减弱动态（看各引擎静态单帧）/ =0 强制完整动效；
  // IAB 的 goto 会吞 query，hash 形式 #r=1 同样生效。不传则按系统偏好。
  const _rSrc = location.search + ' ' + location.hash;
  const REDUCED_PARAM = sessionStorage.getItem('reduced_dbg') ||
    (_rSrc.match(/[?&]reduced=(0|1)/) || _rSrc.match(/[?&]r=(0|1)/) || [])[1];
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

  /* ================= 启动（舞台不存在时各卡自行跳过） ================= */
  [initMorph, initMagnet].forEach((f) => f());
})();
