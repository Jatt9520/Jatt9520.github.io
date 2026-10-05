/**
 * ============================================================
 * showcase-gl.js · 炫技区 WebGL 旗舰双卡（通栏大舞台）
 * ------------------------------------------------------------
 *  ③ 流体模拟 —— Navier-Stokes 全 GPU 求解：
 *     半拉格朗日平流 + 涡度约束 + 压力投影（Jacobi 20 轮），
 *     颜料随涡流揉开、随指userinfo而涌；闲置时波源自己涌动。
 *  ④ 液态透镜 —— SDF 光线行进：三颗玻璃球 smooth-min 熔成
 *     变形虫，菲涅尔轮辉 + 高光 + 程序化青橙底色，指尖引着走。
 * 红线同 2D 引擎：IO 0.12 滚出即停 / visibilitychange 停 /
 *   perf-lite 让位 / DPR 封顶 / 减弱动态=静态一帧。
 * ============================================================
 */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const _rSrc = location.search + ' ' + location.hash;
  const REDUCED_PARAM = sessionStorage.getItem('reduced_dbg') ||
    (_rSrc.match(/[?&]reduced=(0|1)/) || _rSrc.match(/[?&]r=(0|1)/) || [])[1];
  const REDUCED = REDUCED_PARAM ? REDUCED_PARAM === '1'
    : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const perfLite = () => document.body.classList.contains('perf-lite');

  /* ---------- GL 公共脚手架：与 2D 引擎同一套红线 ---------- */
  function makeGL(stageId, spec) {
    const stage = byId(stageId);
    if (!stage) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-fx';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);
    const gl = canvas.getContext('webgl2', {
      alpha: false, depth: false, stencil: false,
      antialias: false, preserveDrawingBuffer: true   // 供截图导出
    });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    const eng = { canvas: canvas, gl: gl, stage: stage, W: 0, H: 0 };
    // 全屏三角形（两个 GL 卡共用同一套顶点状态）
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    const COARSE_MS = COARSE ? 33 : 0;
    let raf = 0, running = false, inView = false, last = 0, t = 0, booted = false;

    function resize() {
      const W = stage.clientWidth, H = stage.clientHeight;
      const dpr = Math.min(spec.maxDpr || 1.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      eng.W = W; eng.H = H;
      if (!booted) { spec.init(gl, canvas); booted = true; }
      spec.resize(gl, canvas.width, canvas.height, W, H);
      if (REDUCED) { if (spec.static) spec.static(gl); return; }
      if (spec.frame) spec.frame(gl, 0.016, t, eng.W, eng.H);   // 尺寸变化立即补一帧（参数与 frame 全量一致）
    }
    function frame(now) {
      if (!running) return;
      if (perfLite()) { stop(); return; }
      if (COARSE_MS && now - last < COARSE_MS - 3) { raf = requestAnimationFrame(frame); return; }
      const dt = last ? clamp(now - last, 0, 50) / 1000 : 0.016;
      last = now; t += dt;
      spec.frame(gl, dt, t, eng.W, eng.H);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || REDUCED || !spec.frame || perfLite()) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    resize();
    window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        es.forEach((en) => {
          inView = en.isIntersecting;
          if (!REDUCED) (inView ? start() : stop());
        });
      }, { threshold: 0.12 }).observe(stage);
    } else if (!REDUCED) start();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (inView && !REDUCED) start();
    });

    if (spec.pointer) {
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

  /* ---------- GL 小工具 ---------- */
  const VERT = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aPos;
  out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
  uniform vec2 uTexel;
  void main(){
    vUv = aPos*0.5+0.5;
    vL = vUv - vec2(uTexel.x, 0.0);
    vR = vUv + vec2(uTexel.x, 0.0);
    vT = vUv + vec2(0.0, uTexel.y);
    vB = vUv - vec2(0.0, uTexel.y);
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

  function makeProgram(gl, fragSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    const uniforms = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(prog, i).name;
      uniforms[name] = gl.getUniformLocation(prog, name);
    }
    return { prog: prog, u: uniforms };
  }
  function useProgram(gl, p) {
    gl.useProgram(p.prog);
    return p.u;
  }
  function makeFBO(gl, w, h, internal, format, filter) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex: tex, fbo: fbo, w: w, h: h,
      texelX: 1 / w, texelY: 1 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        return id;
      }
    };
  }
  function makeDouble(gl, w, h, internal, format, filter) {
    let a = makeFBO(gl, w, h, internal, format, filter);
    let b = makeFBO(gl, w, h, internal, format, filter);
    return {
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      w: w, h: h, texelX: 1 / w, texelY: 1 / h
    };
  }
  function blit(gl, target) {
    if (target) {
      gl.viewport(0, 0, target.w, target.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function hsv2rgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return m;
  }

  /* ================= ③ 流体模拟 =================
   * Navier-Stokes 稳定流体：涡度约束保住旋涡，压力投影保住不可压缩，
   * 颜料半拉格朗日平流。指针搅动注入速度与颜料，闲置时两只波源
   * 按轨道自己涌。整段求解在 GPU 上跑。 */
  function initFluid() {
    const ptr = { x: 0.5, y: 0.5, down: false };
    const queue = [];          // 待注入的 {x,y,dx,dy}
    let nextAuto = 0, simT = 0;
    let P = null, dye = null, velo = null, press = null, diver = null, curl = null;
    let quad = null, aspect = 1;

    const eng = makeGL('st-fluid', {
      touch: true,
      pointer: {
        down(p) { ptr.down = true; push(p, true); },
        move(p) { push(p, false); },
        up() { ptr.down = false; }
      },
      init(gl) {
        P = {
          splat: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; out vec4 frag;
            uniform sampler2D uTarget;
            uniform float uAspect; uniform vec3 uColor;
            uniform vec2 uPoint; uniform float uRadius;
            void main(){
              vec2 p = vUv - uPoint;
              p.x *= uAspect;
              vec3 s = exp(-dot(p,p)/uRadius) * uColor;
              frag = vec4(texture(uTarget, vUv).xyz + s, 1.0);
            }`),
          advection: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; out vec4 frag;
            uniform sampler2D uVelocity; uniform sampler2D uSource;
            uniform vec2 uTexel; uniform float uDt; uniform float uDissipation;
            void main(){
              vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
              frag = vec4(texture(uSource, coord).xyz / (1.0 + uDissipation * uDt), 1.0);
            }`),
          divergence: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
            uniform sampler2D uVelocity;
            void main(){
              float L = texture(uVelocity, vL).x;
              float R = texture(uVelocity, vR).x;
              float T = texture(uVelocity, vT).y;
              float B = texture(uVelocity, vB).y;
              frag = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
            }`),
          curl: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
            uniform sampler2D uVelocity;
            void main(){
              float L = texture(uVelocity, vL).y;
              float R = texture(uVelocity, vR).y;
              float T = texture(uVelocity, vT).x;
              float B = texture(uVelocity, vB).x;
              frag = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
            }`),
          vorticity: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
            uniform sampler2D uVelocity; uniform sampler2D uCurl;
            uniform float uCurlAmt; uniform float uDt;
            void main(){
              float L = texture(uCurl, vL).x;
              float R = texture(uCurl, vR).x;
              float T = texture(uCurl, vT).x;
              float B = texture(uCurl, vB).x;
              float C = texture(uCurl, vUv).x;
              vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
              force /= length(force) + 1e-4;
              force *= uCurlAmt * C;
              force.y *= -1.0;
              vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
              vel = clamp(vel, vec2(-1000.0), vec2(1000.0));
              frag = vec4(vel, 0.0, 1.0);
            }`),
          pressure: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
            uniform sampler2D uPressure; uniform sampler2D uDivergence;
            void main(){
              float L = texture(uPressure, vL).x;
              float R = texture(uPressure, vR).x;
              float T = texture(uPressure, vT).x;
              float B = texture(uPressure, vB).x;
              float div = texture(uDivergence, vUv).x;
              frag = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
            }`),
          gradient: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
            uniform sampler2D uPressure; uniform sampler2D uVelocity;
            void main(){
              float L = texture(uPressure, vL).x;
              float R = texture(uPressure, vR).x;
              float T = texture(uPressure, vT).x;
              float B = texture(uPressure, vB).x;
              vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
              frag = vec4(vel, 0.0, 1.0);
            }`),
          clearP: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; out vec4 frag;
            uniform sampler2D uTexture; uniform float uValue;
            void main(){ frag = texture(uTexture, vUv) * uValue; }`),
          display: makeProgram(gl, `#version 300 es
            precision highp float;
            in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 frag;
            uniform sampler2D uTexture; uniform vec2 uTexel;
            void main(){
              vec3 c = texture(uTexture, vUv).rgb;
              vec3 lc = texture(uTexture, vL).rgb;
              vec3 rc = texture(uTexture, vR).rgb;
              vec3 tc = texture(uTexture, vT).rgb;
              vec3 bc = texture(uTexture, vB).rgb;
              float dx = length(rc) - length(lc);
              float dy = length(tc) - length(bc);
              vec3 n = normalize(vec3(dx, dy, length(uTexel)));
              float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
              c *= diffuse;
              frag = vec4(c, 1.0);
            }`)
        };
        quad = gl.createBuffer();   // （顶点缓冲已由 makeGL 统一建好，这里保留引用占位）
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.BLEND);
      },
      resize(gl, cw, ch, W, H) {
        aspect = W / H;
        const res = COARSE ? 112 : 144;
        const dyeRes = COARSE ? 320 : 512;
        const dims = (r) => {
          const ar = Math.max(1, W / H);
          return W > H ? [Math.round(r * ar), r] : [r, Math.round(r * ar)];
        };
        const [vw, vh] = dims(res);
        const [dw, dh] = dims(dyeRes);
        dye = makeDouble(gl, dw, dh, gl.RGBA16F, gl.RGBA, gl.LINEAR);
        velo = makeDouble(gl, vw, vh, gl.RG16F, gl.RG, gl.LINEAR);
        press = makeDouble(gl, vw, vh, gl.R16F, gl.RED, gl.NEAREST);
        diver = makeFBO(gl, vw, vh, gl.R16F, gl.RED, gl.NEAREST);
        curl = makeFBO(gl, vw, vh, gl.R16F, gl.RED, gl.NEAREST);
        // 重置后先撒几把颜料，卡永远不是白的
        for (let i = 0; i < 7; i++)
          splat(gl, 0.15 + 0.7 * Math.random(), 0.2 + 0.6 * Math.random(),
                (Math.random() - 0.5) * 420, (Math.random() - 0.5) * 420,
                splatColor());
      },
      frame(gl, dt, time) {
        simT = time;
        // 闲置自涌：一对反向旋涡轮流注入（涡流对是流体的招牌画面）
        if (simT > nextAuto) {
          nextAuto = simT + 1.7;
          const a = simT * 0.4;
          const x = 0.5 + 0.3 * Math.sin(a), y = 0.5 + 0.28 * Math.cos(a * 1.3);
          const dir = a > Math.PI ? -1 : 1;
          splat(gl, x, y, Math.cos(a * 2.2) * 260 * dir, Math.sin(a * 2.2) * 260 * dir, splatColor());
          splat(gl, 1 - x, 1 - y, -Math.cos(a * 2.2) * 260 * dir, -Math.sin(a * 2.2) * 260 * dir, splatColor());
        }
        // 处理指针队列
        while (queue.length) {
          const s = queue.shift();
          splat(gl, s.x, s.y, s.dx * 6000, s.dy * 6000, splatColor());
        }
        step(gl, Math.min(dt, 0.033));
        render(gl);
      },
      static(gl) {   // 减弱动态：摆好一帧静止的涡流（加密加密，静止帧也撑得住看）
        for (let i = 0; i < 22; i++) {
          const c = splatColor().map(function (v) { return v * 1.6; });
          splat(gl, 0.1 + 0.8 * Math.random(), 0.12 + 0.76 * Math.random(),
                (Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000, c);
        }
        for (let i = 0; i < 80; i++) step(gl, 0.016);
        render(gl);
      }
    });
    if (!eng) return;

    function splatColor() {
      // 站点色系：青 ↔ 桃橙 往复游走（t=0 从青绿起笔）
      const hue = 0.06 + 0.5 * (0.5 + 0.5 * Math.sin(simT * 0.1 + 1.6)) + (Math.random() - 0.5) * 0.08;
      const c = hsv2rgb(((hue % 1) + 1) % 1, 1, 1);
      const k = 0.34;
      return [c[0] * k, c[1] * k, c[2] * k];
    }
    function push(p, isDown) {
      const x = clamp(p.x / eng.W, 0, 1);
      const y = 1 - clamp(p.y / eng.H, 0, 1);
      const dx = x - ptr.x, dy = y - ptr.y;
      ptr.x = x; ptr.y = y;
      if (isDown) queue.push({ x: x, y: y, dx: 0, dy: 0 });
      else if (Math.abs(dx) + Math.abs(dy) > 0.0005)
        queue.push({ x: x, y: y, dx: dx, dy: dy });
      nextAuto = simT + 2.4;   // 手上有活就先不让波源抢戏
    }
    function splat(gl, x, y, dx, dy, color) {
      const u = useProgram(gl, P.splat);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform2f(u.uPoint, x, y);
      gl.uniform1f(u.uRadius, 0.0022);
      gl.uniform1i(u.uTarget, velo.read.attach(0));
      gl.uniform3f(u.uColor, dx, dy, 0);
      blit(gl, velo.write); velo.swap();
      gl.uniform1i(u.uTarget, dye.read.attach(0));
      gl.uniform3f(u.uColor, color[0], color[1], color[2]);
      blit(gl, dye.write); dye.swap();
    }
    function step(gl, dt) {
      gl.disable(gl.BLEND);
      let u;
      // 涡度约束
      u = useProgram(gl, P.curl);
      gl.uniform2f(u.uTexel, velo.texelX, velo.texelY);
      gl.uniform1i(u.uVelocity, velo.read.attach(0));
      blit(gl, curl);
      u = useProgram(gl, P.vorticity);
      gl.uniform2f(u.uTexel, velo.texelX, velo.texelY);
      gl.uniform1i(u.uVelocity, velo.read.attach(0));
      gl.uniform1i(u.uCurl, curl.attach(1));
      gl.uniform1f(u.uCurlAmt, 14);
      gl.uniform1f(u.uDt, dt);
      blit(gl, velo.write); velo.swap();
      // 压力投影
      u = useProgram(gl, P.divergence);
      gl.uniform2f(u.uTexel, velo.texelX, velo.texelY);
      gl.uniform1i(u.uVelocity, velo.read.attach(0));
      blit(gl, diver);
      u = useProgram(gl, P.clearP);
      gl.uniform1i(u.uTexture, press.read.attach(0));
      gl.uniform1f(u.uValue, 0.8);
      blit(gl, press.write); press.swap();
      u = useProgram(gl, P.pressure);
      gl.uniform2f(u.uTexel, velo.texelX, velo.texelY);
      gl.uniform1i(u.uDivergence, diver.attach(0));
      for (let i = 0; i < 20; i++) {
        gl.uniform1i(u.uPressure, press.read.attach(1));
        blit(gl, press.write); press.swap();
      }
      u = useProgram(gl, P.gradient);
      gl.uniform2f(u.uTexel, velo.texelX, velo.texelY);
      gl.uniform1i(u.uPressure, press.read.attach(0));
      gl.uniform1i(u.uVelocity, velo.read.attach(1));
      blit(gl, velo.write); velo.swap();
      // 平流：速度 + 颜料
      u = useProgram(gl, P.advection);
      gl.uniform2f(u.uTexel, velo.texelX, velo.texelY);
      gl.uniform1f(u.uDt, dt);
      gl.uniform1i(u.uVelocity, velo.read.attach(0));
      gl.uniform1i(u.uSource, velo.read.attach(0));
      gl.uniform1f(u.uDissipation, 0.24);
      blit(gl, velo.write); velo.swap();
      gl.uniform2f(u.uTexel, dye.texelX, dye.texelY);
      gl.uniform1i(u.uVelocity, velo.read.attach(0));
      gl.uniform1i(u.uSource, dye.read.attach(1));
      gl.uniform1f(u.uDissipation, 0.65);
      blit(gl, dye.write); dye.swap();
    }
    function render(gl) {
      const u = useProgram(gl, P.display);
      gl.uniform2f(u.uTexel, dye.texelX, dye.texelY);
      gl.uniform1i(u.uTexture, dye.read.attach(0));
      blit(gl, null);
    }
  }

  /* ================= ④ 液态透镜 =================
   * SDF 光线行进：三颗玻璃球 smooth-min 熔成流动的变形虫，
   * 菲涅尔轮辉 + 镜面高光 + 程序化青橙底色；指尖是一颗隐形球，
   * 玻璃会朝手的方向涌。半分辨率渲染保帧率。 */
  function initLens() {
    const ptr = { x: 0, y: 0, on: false };
    let P = null, uRes = null;
    const eng = makeGL('st-glass', {
      touch: true,
      maxDpr: 1,
      pointer: {
        down(p) { setPtr(p); ptr.on = true; },
        move(p) { setPtr(p); ptr.on = true; },
        leave() { ptr.on = false; }
      },
      init(gl) {
        P = makeProgram(gl, `#version 300 es
          precision highp float;
          uniform vec2 uRes; uniform float uTime;
          uniform vec3 uPtr;   // xy: 画面坐标(-1..1, 按 y 归一)；z: 是否激活
          out vec4 frag;
          float smin(float a, float b, float k){
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
          }
          float map(vec3 p){
            float t = uTime * 0.5;
            vec3 b1 = vec3(sin(t * 0.9), cos(t * 0.7) * 0.55, sin(t * 0.5) * 0.3) * 0.85;
            vec3 b2 = vec3(cos(t * 0.6) * 1.05, sin(t * 0.8) * 0.5, cos(t * 0.55) * 0.25) * 0.85;
            vec3 b3 = vec3(sin(t * 0.45 + 2.0) * 1.15, cos(t * 0.62 + 1.0) * 0.5, sin(t * 0.7 + 3.0) * 0.3) * 0.85;
            float d = length(p - b1) - 0.6;
            d = smin(d, length(p - b2) - 0.48, 0.5);
            d = smin(d, length(p - b3) - 0.54, 0.5);
            if (uPtr.z > 0.5) d = smin(d, length(p - uPtr.xyz * vec3(1.7, 1.0, 1.0)) - 0.5, 0.5);
            return d;
          }
          vec3 normalAt(vec3 p){
            vec2 e = vec2(0.004, 0.0);
            return normalize(vec3(
              map(p + e.xyy) - map(p - e.xyy),
              map(p + e.yxy) - map(p - e.yxy),
              map(p + e.yyx) - map(p - e.yyx)));
          }
          void main(){
            vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
            vec3 ro = vec3(0.0, 0.0, 3.4);
            vec3 rd = normalize(vec3(uv, -1.7));
            vec3 col = mix(vec3(0.023, 0.08, 0.1), vec3(0.05, 0.13, 0.15), uv.y * 0.5 + 0.5);
            float t = 0.0; float d = 1.0; vec3 p = ro;
            for (int i = 0; i < 64; i++) {
              p = ro + rd * t;
              d = map(p);
              if (d < 0.0025 || t > 9.0) break;
              t += d * 0.9;
            }
            if (d < 0.0025) {
              vec3 n = normalAt(p);
              vec3 l = normalize(vec3(0.5, 0.8, -0.6));
              float diff = max(dot(n, l), 0.0);
              float spec = pow(max(dot(reflect(rd, n), l), 0.0), 44.0) * 1.3;
              float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
              vec3 base = mix(vec3(0.18, 0.43, 0.45), vec3(0.95, 0.72, 0.54), p.x * 0.35 + 0.5);
              col = base * (0.3 + 0.7 * diff) + vec3(1.0) * spec + fres * vec3(0.72, 0.9, 0.95) * 0.95;
              col += vec3(0.2, 0.5, 0.55) * exp(-abs(d) * 10.0) * 0.35;   // 表面透亮
            }
            col *= 1.0 - 0.12 * dot(uv, uv);
            frag = vec4(col, 1.0);
          }`);
      },
      resize(gl, cw, ch) {
        uRes = [cw, ch];
      },
      frame(gl, dt, time, W, H) {
        const u = useProgram(gl, P);
        gl.uniform2f(u.uRes, uRes[0], uRes[1]);
        gl.uniform1f(u.uTime, time);
        const aspect = W / H;
        gl.uniform3f(u.uPtr,
          (ptr.x / W * 2 - 1) * aspect,
          -(ptr.y / H * 2 - 1),
          ptr.on ? 1 : 0);
        blit(gl, null);
      },
      static(gl) {
        const u = useProgram(gl, P);
        gl.uniform2f(u.uRes, uRes[0], uRes[1]);
        gl.uniform1f(u.uTime, 2.2);
        gl.uniform3f(u.uPtr, 0, 0, 0);
        blit(gl, null);
      }
    });
    if (!eng) return;

    function setPtr(p) { ptr.x = p.x; ptr.y = p.y; }
  }

  [initFluid, initLens].forEach((f) => f());
})();
