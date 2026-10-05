/**
 * ============================================================
 * showcase.js · 炫技区（主站第四屏，挂在 #s-showcase 场景内）
 * ------------------------------------------------------------
 * 五张会动的玻璃卡：
 *   ① 容器变形 7 连 —— GSAP 状态机（上一步/下一步/自动轮播/点画面推进）
 *   ② 惯性珠链   —— 真弹簧追指针的发光珠链（过冲回弹+挤压伸展+利萨如舞线）
 *   ③ 磁吸线条     —— Canvas 指针物理（铁屑转向；触屏拖动/点按都生效）
 *   ④ 陀螺环     —— 三圈异轴进动的 3D 点环，拖拽带惯性甩转（正交投影）
 *   ⑤ 水银熔球     —— Metaballs 等值面液态金属，指尖喂过去熔了又分
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

  /* ================= ② 惯性珠链 =================
   * 一串光珠用真弹簧追指针：每颗只追前一颗，链上自然传出
   * 追赶-过冲-回弹的波动；珠子按速度沿轨迹挤压伸展，甩起来是
   * 流星，松手排队归位。闲下来锚点自己走利萨如舞线，永不停摆；
   * 点一下炸开再重组。 */
  function initChain() {
    const ptr = { x: -1e4, y: -1e4, on: false };
    const beads = [], sprites = [];
    let sinceMove = 0;
    const N = 22;
    const eng = makeEngine('st-chain', {
      touch: true,
      resize(c, W, H) {
        beads.length = 0;
        sprites.length = 0;
        for (let i = 0; i < N; i++) {
          beads.push({ x: W / 2, y: H / 2, vx: 0, vy: 0 });
          const f = i / N, hue = 190 - 145 * f, r = 9 - i * 0.22;
          const s = document.createElement('canvas');
          s.width = s.height = Math.ceil(r * 5);
          const sc = s.getContext('2d');
          const g = sc.createRadialGradient(s.width / 2, s.height / 2, 1, s.width / 2, s.height / 2, s.width / 2);
          g.addColorStop(0, 'hsla(' + hue + ',95%,88%,0.95)');
          g.addColorStop(0.3, 'hsla(' + hue + ',90%,65%,0.7)');
          g.addColorStop(1, 'hsla(' + hue + ',90%,55%,0)');
          sc.fillStyle = g;
          sc.fillRect(0, 0, s.width, s.height);
          sprites.push(s);
        }
      },
      pointer: {
        down(p) {
          ptr.x = p.x; ptr.y = p.y; ptr.on = true;
          for (const b of beads) { b.vx += (Math.random() - 0.5) * 30; b.vy += (Math.random() - 0.5) * 30; }
        },
        move(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        leave() { ptr.on = false; }
      },
      frame(c, W, H, t, dt) { step(c, W, H, t, dt); },
      static(c, W, H) { drawIdle(c, W, H); }
    });
    if (!eng) return;

    function step(c, W, H, t, dt) {
      sinceMove = ptr.on ? 0 : sinceMove + dt;
      let ax, ay;
      if (ptr.on && sinceMove < 0.1) { ax = ptr.x; ay = ptr.y; }
      else { ax = W * (0.5 + 0.36 * Math.sin(t * 0.9)); ay = H * (0.5 + 0.3 * Math.sin(t * 0.63 + 1.2)); }
      const k = 0.3, damp = 0.76;
      const b0 = beads[0];
      b0.vx += (ax - b0.x) * k;
      b0.vy += (ay - b0.y) * k;
      for (let i = 1; i < beads.length; i++) {
        const p = beads[i - 1], b = beads[i];
        const sp = Math.hypot(p.vx, p.vy);
        let tx = p.x, ty = p.y;
        if (sp > 0.4) { tx -= p.vx / sp * 11; ty -= p.vy / sp * 11; }   // 排在前一颗正后方
        b.vx += (tx - b.x) * k;
        b.vy += (ty - b.y) * k;
      }
      for (const b of beads) {
        b.vx *= damp;
        b.vy *= damp;
        b.x += b.vx * dt * 60;
        b.y += b.vy * dt * 60;
      }
      c.fillStyle = 'rgba(8,23,31,0.22)';
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (let i = 1; i < beads.length; i++) {
        const p = beads[i - 1], b = beads[i], f = i / beads.length;
        c.strokeStyle = 'hsla(' + (190 - 145 * f) + ',85%,62%,0.55)';
        c.lineWidth = 4.5 - 3.2 * f;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
      for (let i = 0; i < beads.length; i++) {
        const b = beads[i];
        const sp = Math.hypot(b.vx, b.vy);
        const st = 1 + Math.min(1.1, sp * 0.03);   // 挤压伸展：快珠沿轨迹拉长
        c.save();
        c.translate(b.x, b.y);
        c.rotate(Math.atan2(b.vy, b.vx));
        c.scale(st, 1 / Math.sqrt(st));
        const s = sprites[i];
        c.drawImage(s, -s.width / 2, -s.height / 2);
        c.restore();
      }
      c.globalCompositeOperation = 'source-over';
    }
    function drawIdle(c, W, H) {   // 减弱动态：摆一帧静止的舞线
      c.fillStyle = '#08171f';
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      let px = null, py = null;
      for (let i = 0; i < beads.length; i++) {
        const f = i / (beads.length - 1);
        const th = -1.2 + f * Math.PI * 2.1;               // 静止帧：彗星盘卧的展开螺旋
        const r = 12 + f * Math.min(W, H) * 0.44;
        const x = W / 2 + Math.cos(th) * r;
        const y = H / 2 + Math.sin(th) * r * 0.7;
        if (px !== null) {
          c.strokeStyle = 'hsla(' + (190 - 145 * i / beads.length) + ',85%,62%,0.5)';
          c.lineWidth = 4.5 - 3.2 * i / beads.length;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(x, y);
          c.stroke();
        }
        const s = sprites[i];
        c.globalAlpha = 1 - (i / beads.length) * 0.75;
        c.drawImage(s, x - s.width / 2, y - s.height / 2);
        c.globalAlpha = 1;
        px = x; py = y;
      }
      c.globalCompositeOperation = 'source-over';
    }
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

  /* ================= ④ 陀螺环 =================
   * 三圈点阵各自异轴进动的 3D 环：正交投影、按深度调大小亮度
   * （近金远青）；横向拖拽 = 带惯性甩转（松手靠动量滑行衰减），
   * 纵向拖拽俯仰视角；闲下来缓缓回到默认自转。纯数学，零贴图。 */
  function initGyro() {
    const view = { yaw: 0.6, pitch: -0.35, vyaw: 0.004, vpitch: 0, dragging: false, lx: 0, ly: 0 };
    const RINGS = [
      { r: 0.36, tilt: 0.05, spin: 1.6,  pre: 0.52,  n: 34 },
      { r: 0.63, tilt: 1.05, spin: -1.1, pre: -0.36, n: 46 },
      { r: 0.9,  tilt: 2.1,  spin: 0.7,  pre: 0.22,  n: 58 }
    ];
    const eng = makeEngine('st-gyro', {
      touch: true,
      pointer: {
        down(p) { view.dragging = true; view.lx = p.x; view.ly = p.y; view.vyaw = 0; view.vpitch = 0; },
        move(p) {
          if (!view.dragging) return;
          const dx = p.x - view.lx, dy = p.y - view.ly;
          view.lx = p.x; view.ly = p.y;
          view.yaw += dx * 0.012;
          view.pitch = clamp(view.pitch + dy * 0.008, -1.15, 1.15);
          view.vyaw = dx * 0.012;
          view.vpitch = dy * 0.008;   // 记录瞬时速度 → 松手成惯性
        },
        up() { view.dragging = false; },
        leave() { view.dragging = false; }
      },
      frame(c, W, H, t, dt) { step(c, W, H, t, false); },
      static(c, W, H) { step(c, W, H, 2.2, true); }
    });
    if (!eng) return;

    function step(c, W, H, t, still) {
      if (!still && !view.dragging) {
        view.yaw += view.vyaw;
        view.pitch = clamp(view.pitch + view.vpitch, -1.15, 1.15);
        view.vyaw += (0.004 - view.vyaw) * 0.02;   // 惯性衰减 + 缓缓回到自转
        view.vpitch *= 0.94;
        view.pitch += (-0.35 - view.pitch) * 0.006;
      }
      c.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
      const syw = Math.sin(view.yaw), cyw = Math.cos(view.yaw);
      const spt = Math.sin(view.pitch), cpt = Math.cos(view.pitch);
      for (const ring of RINGS) {
        const tilt = ring.tilt + Math.sin(t * ring.pre) * 0.35;
        const ct = Math.cos(tilt), stl = Math.sin(tilt);
        for (let i = 0; i < ring.n; i++) {
          const a = ring.spin * t + i / ring.n * Math.PI * 2;
          let x = Math.cos(a) * ring.r, y = 0, z = Math.sin(a) * ring.r;
          let y2 = y * ct - z * stl;
          z = y * stl + z * ct;
          y = y2;
          let x2 = x * cyw + z * syw;
          z = -x * syw + z * cyw;
          x = x2;
          y2 = y * cpt - z * spt;
          z = y * spt + z * cpt;
          y = y2;
          const depth = 1 / (1.6 - z * 0.55);
          const dz = clamp((z + 1) / 2, 0, 1);
          c.globalAlpha = 0.22 + 0.78 * dz;
          c.fillStyle = 'hsla(' + (185 - 140 * dz) + ',85%,' + (55 + 22 * dz) + '%,1)';
          c.beginPath();
          c.arc(cx + x * R * depth, cy + y * R * depth, (1 + 1.9 * dz) * depth, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
    }
  }


  /* ================= ⑤ 水银熔球 =================
   * Metaballs 等值面：几团青→橙渐变的液态金属在玻璃舞台上漂浮，
   * 靠近就融合、拉开就分离；指尖是一颗看不见的球，喂过去会被
   * 吞进熔团里。粗网格解场 + 平滑放大，边缘留一圈高光 rim。 */
  function initMercury() {
    const ptr = { x: -1e4, y: -1e4, on: false };
    let balls = [], os = null, octx = null, img = null, Wc = 0, Hc = 0, cell = 4;
    const eng = makeEngine('st-mercury', {
      touch: true,
      resize(c, W, H) {
        cell = COARSE ? 5 : 4;
        Wc = Math.max(12, Math.ceil(W / cell));
        Hc = Math.max(8, Math.ceil(H / cell));
        os = document.createElement('canvas');
        os.width = Wc; os.height = Hc;
        octx = os.getContext('2d');
        img = octx.createImageData(Wc, Hc);
        balls = [];
        const n = COARSE ? 5 : 6;
        for (let i = 0; i < n; i++) {
          const ph = Math.random() * 6.28, sp = 0.16 + Math.random() * 0.2;
          balls.push({
            x: W * (0.5 + 0.34 * Math.sin(2.4 * sp + ph)),
            y: H * (0.5 + 0.3 * Math.sin(2.4 * sp * 0.83 + ph * 1.7)),
            vx: 0, vy: 0, r: 20 + Math.random() * 14,
            ph: ph, sp: sp
          });
        }
      },
      pointer: {
        down(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        move(p) { ptr.x = p.x; ptr.y = p.y; ptr.on = true; },
        leave() { ptr.on = false; }
      },
      frame(c, W, H, t, dt) { step(c, W, H, t, dt); },
      static(c, W, H) { step(c, W, H, 2.4, 0); }
    });
    if (!eng) return;

    function step(c, W, H, t, dt) {
      for (const b of balls) {
        const hx = W * (0.5 + 0.34 * Math.sin(t * b.sp + b.ph));
        const hy = H * (0.5 + 0.3 * Math.sin(t * b.sp * 0.83 + b.ph * 1.7));
        b.vx += (hx - b.x) * 0.012;
        b.vy += (hy - b.y) * 0.012;
        if (ptr.on) {
          const dx = ptr.x - b.x, dy = ptr.y - b.y, d = Math.hypot(dx, dy);
          if (d < 160 && d > 1) {
            const k = (1 - d / 160) * 1.1;
            b.vx += dx / d * k;
            b.vy += dy / d * k;
          }
        }
      }
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const min = (a.r + b.r) * 0.5;
          if (d < min) {
            const f = (min - d) / min * 0.5;
            a.vx -= dx / d * f; a.vy -= dy / d * f;
            b.vx += dx / d * f; b.vy += dy / d * f;
          }
        }
      }
      if (dt) {
        for (const b of balls) {
          b.vx *= 0.9; b.vy *= 0.9;
          b.x = clamp(b.x + b.vx * dt * 60, -30, W + 30);
          b.y = clamp(b.y + b.vy * dt * 60, -30, H + 30);
        }
      }
      const BX = [], BY = [], R2 = [];
      for (const b of balls) {
        BX.push(b.x / cell); BY.push(b.y / cell);
        R2.push((b.r * (1 + 0.08 * Math.sin(t * 1.3 + b.ph))) * (b.r * (1 + 0.08 * Math.sin(t * 1.3 + b.ph))) / (cell * cell));
      }
      let px = -1e4, py = -1e4, pr2 = 0;
      if (ptr.on) { px = ptr.x / cell; py = ptr.y / cell; pr2 = 26 * 26 / (cell * cell); }
      const T = 1.0;
      const d = img.data;
      for (let gy = 0; gy < Hc; gy++) {
        for (let gx = 0; gx < Wc; gx++) {
          let f = 0;
          for (let k = 0; k < BX.length; k++) {
            const dx = gx - BX[k], dy = gy - BY[k];
            f += R2[k] / (dx * dx + dy * dy + 18);
          }
          if (ptr.on) {
            const dx = gx - px, dy = gy - py;
            f += pr2 / (dx * dx + dy * dy + 18);
          }
          const o = (gy * Wc + gx) * 4;
          if (f > T) {
            const depth = Math.min(1, (f - T) / 1.1);
            const mixX = gx / Wc;
            const r = 46 + (242 - 46) * mixX, g = 111 + (185 - 111) * mixX, bl = 117 + (140 - 117) * mixX;
            d[o] = r * (0.62 + 0.5 * depth);
            d[o + 1] = g * (0.62 + 0.5 * depth);
            d[o + 2] = bl * (0.62 + 0.5 * depth);
            d[o + 3] = 255;
          } else if (f > T * 0.72) {
            d[o] = 235; d[o + 1] = 246; d[o + 2] = 240; d[o + 3] = 200;
          } else {
            d[o + 3] = 0;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      c.clearRect(0, 0, W, H);
      c.imageSmoothingEnabled = true;
      c.drawImage(os, 0, 0, W, H);
    }
  }


  /* ================= 启动（舞台不存在时各卡自行跳过） ================= */
  [initMorph, initChain, initMagnet, initGyro, initMercury].forEach((f) => f());
})();
