/**
 * ============================================================
 * main.js · 交互逻辑 / 像素画板 / 额度管理 / Gist 数据同步
 * ------------------------------------------------------------
 * 所有可配置的文案与参数均取自 config.js（CONFIG）,
 * 本文件不写死任何内容。按功能分区，便于后续扩展。
 * 分区：工具 / 状态 / 静态内容 / 额度 / 画布 / 画板交互 /
 *        Gist 同步 / 彩蛋 / 项目卡片 / 弹窗 / 导航 / 启动
 * ============================================================
 */
(function () {
  'use strict';

  const C = CONFIG;

  /* ================= 工具函数 ================= */
  const byId = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 底部浮出 Toast 提示 */
  function toast(msg, ms = 3200) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = msg;
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 400);
    }, ms);
  }

  /** 本地日期字符串 YYYY-MM-DD（用于自然日重置额度） */
  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** "#rrggbb" -> [r, g, b] */
  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }

  /** 转义 HTML 特殊字符，避免接口返回的文案破坏页面结构 */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /** 解析 "x,y": "#颜色" 的 JSON 字符串为 Map */
  function parsePixels(content) {
    const map = new Map();
    try {
      const obj = JSON.parse(content || '{}');
      for (const k in obj) map.set(k, obj[k]);
    } catch (e) { /* 忽略坏数据 */ }
    return map;
  }

  /** 把像素 Map 序列化为 JSON 字符串 */
  function serialize() {
    return JSON.stringify(Object.fromEntries(pixels));
  }

  /* ================= 状态 ================= */
  let pixels = new Map();    // { "x,y": "#rrggbb" }
  let color = C.palette.defaultColor;
  let active = false;        // 是否已点击「进入」激活放置
  let syncing = false;       // Gist 写入是否进行中
  let pending = false;       // 写入期间又有新像素，待补推
  let syncTimer = null;

  const canvas = byId('pixel-canvas');
  const cols = C.grid.cols, rows = C.grid.rows;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;
  const [bgR, bgG, bgB] = hexToRgb(C.grid.background);

  const enterBtn = byId('canvas-enter');
  const corner = byId('canvas-corner');
  const picker = byId('color-picker');

  /* ================= 静态内容挂载（全部读取 config.js） ================= */
  function mountStatic() {
    byId('fixed-badge').textContent = C.site.fixedBadge
      .replace('{author}', C.site.author)
      .replace('{motto}', C.site.motto);
    document.title = C.site.pageTitle;

    const contact = byId('contact');
    contact.innerHTML =
      '<p class="contact-title">' + C.contacts.title + '</p>' +
      '<a href="' + C.contacts.githubUrl + '" target="_blank" rel="noopener">' + C.contacts.githubLabel + '</a>' +
      '<a href="mailto:' + C.contacts.email + '">' + C.contacts.emailLabel + '：' + C.contacts.email + '</a>';

    document.querySelectorAll('.nav-entry').forEach((a) => {
      const key = a.dataset.entry;
      a.textContent = C.nav[key].label;
      a.dataset.view = C.nav[key].view;
      a.dataset.index = C.nav[key].index;
    });

    byId('canvas-title').textContent = C.painter.title;
    document.querySelectorAll('.back-link').forEach((el) => {
      el.textContent = C.back.label;
    });

    byId('creation-title').textContent = C.creation.title;
    byId('creation-text').textContent = C.creation.text;
    byId('projects-title').textContent = C.projects.title;
    document.querySelector('.palette-label').textContent = C.palette.label;

    // 创作初衷视图内的联系方式
    const contactBox = byId('creation-contact');
    contactBox.innerHTML =
      '<h3 class="creation-contact-title">' + C.contacts.title + '</h3>' +
      '<a class="creation-contact-link" href="' + C.contacts.githubUrl + '" target="_blank" rel="noopener">' +
        C.contacts.githubLabel + '：' + C.contacts.githubUrl + '</a>' +
      '<a class="creation-contact-link" href="mailto:' + C.contacts.email + '">' +
        C.contacts.emailLabel + '：' + C.contacts.email + '</a>';

    picker.value = C.palette.defaultColor;
    enterBtn.textContent = C.painter.enterButton;
  }

  /* ================= 每日额度（localStorage 记录日期 + 已用数量） ================= */
  function loadQuota() {
    let q = { date: '', used: 0, egg: 0 };
    try {
      const raw = localStorage.getItem(C.quota.storageKey);
      if (raw) q = Object.assign({}, q, JSON.parse(raw));
    } catch (e) { /* 忽略损坏数据 */ }
    if (q.date !== todayStr()) {          // 跨自然日自动重置
      q = { date: todayStr(), used: 0, egg: 0 };
      saveQuota(q);
    }
    return q;
  }
  function saveQuota(q) {
    localStorage.setItem(C.quota.storageKey, JSON.stringify(q));
  }
  /** 剩余额度 = 每日额度 + 彩蛋奖励 - 已用 */
  function remaining(q) {
    return C.quota.daily + (q.egg || 0) - q.used;
  }

  /** 刷新画板角落剩余提示 + 激活按钮状态 */
  function updateQuotaUI() {
    const q = loadQuota();
    const n = remaining(q);

    corner.textContent = C.painter.remainingText.replace('{n}', n);
    corner.classList.toggle('empty', n <= 0);

    if (!enterBtn.classList.contains('hidden')) {
      if (n <= 0) {
        enterBtn.classList.add('disabled');
        enterBtn.textContent = C.painter.quotaExhausted;
      } else {
        enterBtn.classList.remove('disabled');
        enterBtn.textContent = C.painter.enterButton;
      }
    }
  }

  /* ================= 画布渲染 ================= */
  /** 把单个逻辑格的颜色写入 ImageData 缓冲 */
  function writeCell(x, y) {
    const key = x + ',' + y;
    const rgb = pixels.has(key) ? hexToRgb(pixels.get(key)) : [bgR, bgG, bgB];
    const i = (y * cols + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
  }

  /** 全量重绘（加载数据 / 清底） */
  function renderAll() {
    for (let i = 0; i < cols * rows; i++) {
      const j = i * 4;
      buf[j] = bgR; buf[j + 1] = bgG; buf[j + 2] = bgB; buf[j + 3] = 255;
    }
    pixels.forEach((hex, key) => {
      const sep = key.indexOf(',');
      const x = +key.slice(0, sep), y = +key.slice(sep + 1);
      const rgb = hexToRgb(hex);
      const i = (y * cols + x) * 4;
      buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
  }

  /** 只更新单个逻辑格并局部上屏 */
  function paintCell(x, y) {
    writeCell(x, y);
    ctx.putImageData(img, 0, 0, x, y, 1, 1);
  }

  /* ================= 画板交互 ================= */
  picker.addEventListener('input', () => { color = picker.value; });

  /* ---------- 缩放功能（点击「进入」后启用） ---------- */
  const scrollBox = byId('canvas-scroll');
  const zoomInBtn = byId('zoom-in');
  const zoomOutBtn = byId('zoom-out');
  const zoomFitBtn = byId('zoom-fit');
  const zoomLevelEl = byId('zoom-level');
  const zoomLevels = [1, 2, 3, 4, 6, 8, 12, 16];   // 缩放档位（1x 为适配画板框）
  let zoomIdx = 0;

  zoomInBtn.textContent = C.painter.zoom.in;
  zoomOutBtn.textContent = C.painter.zoom.out;
  zoomFitBtn.textContent = C.painter.zoom.fit;

  /** 根据当前缩放档位调整画布 CSS 宽度，容器自动出现滚动条 */
  function applyZoom() {
    const scale = zoomLevels[zoomIdx];
    canvas.style.width = (scale * 100) + '%';
    zoomLevelEl.textContent = C.painter.zoom.levelText.replace('{scale}', scale);
    zoomInBtn.disabled = zoomIdx >= zoomLevels.length - 1;
    zoomOutBtn.disabled = zoomIdx <= 0;
    if (scrollBox) { scrollBox.scrollLeft = 0; scrollBox.scrollTop = 0; }
  }

  /** 进入前禁用缩放，进入后启用 */
  function setZoomEnabled(enabled) {
    [zoomInBtn, zoomOutBtn, zoomFitBtn].forEach((b) => {
      b.disabled = !enabled;
      b.classList.toggle('disabled', !enabled);
    });
    zoomLevelEl.classList.toggle('disabled', !enabled);
  }

  zoomInBtn.addEventListener('click', () => {
    if (zoomIdx < zoomLevels.length - 1) { zoomIdx += 1; applyZoom(); }
  });
  zoomOutBtn.addEventListener('click', () => {
    if (zoomIdx > 0) { zoomIdx -= 1; applyZoom(); }
  });
  zoomFitBtn.addEventListener('click', () => { zoomIdx = 0; applyZoom(); });
  applyZoom();
  setZoomEnabled(false);

  /** 点击「进入」激活像素放置；额度耗尽时按钮置灰不可进入 */
  enterBtn.addEventListener('click', () => {
    if (activateCheck()) return;
    canvas.classList.add('active');
    updateQuotaUI();
  });

  function activateCheck() {
    if (loadQuotaRemaining() <= 0) {
      toast(C.painter.quotaExhausted);
      return true;
    }
    if (!active) {
      active = true;
      enterBtn.classList.add('hidden');
      setZoomEnabled(true);   // 进入后启用放大
    }
    return false;
  }

  function loadQuotaRemaining() {
    return remaining(loadQuota());
  }

  /** 点击画布：找逻辑格 -> 上色 -> 扣额度 -> 触发同步 */
  canvas.addEventListener('click', (e) => {
    if (!active) return;                       // 未激活仅可查看不可操作
    if (loadQuotaRemaining() <= 0) {
      toast(C.painter.quotaExhausted);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - rect.left) / rect.width * cols)));
    const y = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - rect.top) / rect.height * rows)));
    const key = x + ',' + y;

    pixels.set(key, color);                    // 同位置直接覆盖旧颜色
    paintCell(x, y);

    const q = loadQuota();
    q.used += 1;
    saveQuota(q);
    updateQuotaUI();

    queueSync();
  });

  /* ================= Gist 同步 ================= */
  function gistUrl() { return C.gist.apiBase + '/gists/' + C.gist.id; }

  /** GET：拉取远端最新数据 */
  async function fetchGist() {
    const res = await fetch(gistUrl(), {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error('gist GET ' + res.status);
    const data = await res.json();
    const file = data.files && data.files[C.gist.fileName];
    if (!file) throw new Error('pixels.json missing');
    return parsePixels(file.content);
  }

  /** PATCH：把合并后的最新数据写回 Gist */
  async function patchGist(contentStr) {
    const res = await fetch(gistUrl(), {
      method: 'PATCH',
      headers: {
        Authorization: 'token ' + C.gist.token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { [C.gist.fileName]: { content: contentStr } } })
    });
    if (!res.ok) throw new Error('gist PATCH ' + res.status);
    localStorage.setItem(C.gist.storageKey, contentStr);  // 成功后同步本地兜底
  }

  /** 读取本地兜底备份 */
  function loadBackup() {
    try {
      const s = localStorage.getItem(C.gist.storageKey);
      return s ? parsePixels(s) : new Map();
    } catch (e) { return new Map(); }
  }

  /** 启动加载：远端数据 + 本地兜底合并渲染 */
  async function loadRemotePixels() {
    const backup = loadBackup();
    pixels = new Map(backup);
    try {
      const remote = await fetchGist();
      const merged = new Map(remote);
      backup.forEach((v, k) => merged.set(k, v));  // 本地未同步的先补上
      pixels = merged;
    } catch (e) {
      if (backup.size === 0) toast(C.gist.readFailMessage);
    }
    renderAll();
    if (backup.size > 0) queueSync();   // 有本地残留则补推一次
  }

  /** 单次写入：先拉最新 -> 合并本地图 -> PATCH；失败自动重试 */
  async function attemptSync() {
    let map = new Map(pixels);
    try {
      const remote = await fetchGist();   // 写入前先拉最新，避免覆盖他人刚放置的像素
      map = new Map(remote);
      pixels.forEach((v, k) => map.set(k, v));
    } catch (e) { /* 拉取失败则仅推送本地数据 */ }

    const content = JSON.stringify(Object.fromEntries(map));
    for (let i = 1; i <= C.gist.retryTimes; i++) {
      try {
        await patchGist(content);
        return true;
      } catch (e) {
        if (i === C.gist.retryTimes) return false;
        await sleep(i * 800);
      }
    }
    return false;
  }

  /** 同步协程：可累积待推请求，避免并发 PATCH 覆盖 */
  async function runSync() {
    syncing = true;
    do {
      pending = false;
      const ok = await attemptSync();
      if (!ok) {
        toast(C.gist.writeFailMessage);            // 容错提示
        localStorage.setItem(C.gist.storageKey, serialize());  // 本地兜底
        pending = false;
        break;
      }
    } while (pending);
    syncing = false;
  }

  /** 放置像素后调度一次同步（防抖合并发起） */
  function queueSync() {
    if (syncing) { pending = true; return; }
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      runSync();
    }, 800);
  }

  /* ================= 彩蛋：键盘输入 100914 加 100 像素 ================= */
  let typed = '';
  window.addEventListener('keydown', (e) => {
    if (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    typed = (typed + e.key).slice(-C.easterEgg.code.length);
    if (typed === C.easterEgg.code) {
      const q = loadQuota();
      q.egg = (q.egg || 0) + C.easterEgg.bonus;
      saveQuota(q);
      updateQuotaUI();
      toast(C.easterEgg.message);
      typed = '';
    }
  });

  /* ================= 项目卡片（GitHub API 实时拉取） ================= */
  async function initProjects() {
    const holder = byId('project-cards');
    const fallbackEl = byId('project-fallback');
    try {
      const res = await fetch(
        C.projects.apiBase + '/users/' + C.projects.owner + '/repos?per_page=100',
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (!res.ok) throw new Error('repos ' + res.status);
      const repos = await res.json();

      // 按 config 指定顺序挑选仓库
      const cards = C.projects.repos
        .map((name) => ({ name: name, repo: repos.find((r) => r.name.toLowerCase() === name.toLowerCase()) }))
        .filter((x) => x.repo);
      if (cards.length === 0) throw new Error('no repos matched');

      holder.innerHTML = '';
      cards.forEach((item) => {
        const repo = item.repo;
        // GitHub 未填描述时使用 config 中的兜底描述
        const desc = repo.description || C.projects.repoDescs[item.name] || C.projects.noDesc;
        const lang = repo.language
          ? '<span class="project-lang">' + esc(repo.language) + '</span>'
          : '';
        const card = document.createElement('a');
        card.className = 'project-card';
        card.href = repo.html_url;
        card.target = '_blank';
        card.rel = 'noopener';
        card.innerHTML =
          '<strong class="project-name">' + esc(repo.name) + '</strong>' +
          '<p class="project-desc">' + esc(desc) + '</p>' +
          '<div class="project-meta">' + lang + '</div>';
        holder.appendChild(card);
      });
    } catch (e) {
      holder.innerHTML = '';
      fallbackEl.hidden = false;
      fallbackEl.textContent = C.projects.fallback;
    }
  }

  /* ================= 入场弹窗：欢迎 -> 介绍 -> 进入 ================= */
  function initModal() {
    const modal = byId('modal');
    const title = byId('modal-title');
    const text = byId('modal-text');
    const btn = byId('modal-btn');
    let step = 0;

    function showStep() {
      void title.offsetWidth;   // 重启动画
      title.classList.remove('fade-in');

      if (step === 0) {
        title.textContent = C.modal.welcomeTitle;
        text.textContent = '';
        btn.textContent = C.modal.welcomeButton;
      } else {
        title.textContent = '';
        text.textContent = C.modal.introText;     // 平滑切换为网站介绍
        btn.textContent = C.modal.enterButton;
      }
      title.classList.add('fade-in');
      text.classList.add('fade-in');
    }

    btn.addEventListener('click', () => {
      if (step === 0) {
        step = 1;
        showStep();
      } else {
        modal.classList.add('hidden');            // 淡出消失，展示主页
        setTimeout(() => modal.remove(), 500);
      }
    });

    showStep();
  }

  /* ================= 双导航入口：点击进入对应视图 ================= */
  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initNav() {
    document.querySelectorAll('.nav-entry').forEach((a) => {
      a.addEventListener('click', () => showView(a.dataset.view));
    });
    document.querySelectorAll('[data-back]').forEach((el) => {
      el.addEventListener('click', () => showView(el.dataset.back));
    });
  }

  /* ================= 启动 ================= */
  mountStatic();
  initModal();
  updateQuotaUI();
  initNav();
  initProjects();
  loadRemotePixels();
})();