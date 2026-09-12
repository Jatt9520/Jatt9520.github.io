/**
 * ============================================================
 * config.js · 站点全部可配置内容
 * ------------------------------------------------------------
 * 所有文案 / 链接 / 参数 / 按钮文字都集中在这里。
 * 以后想改任何内容，只需要编辑这一个文件，业务代码（main.js）
 * 全部引用变量，不写死任何内容。
 *
 * 【安全提示】部署到 GitHub Pages 后，本文件是公开可见的，
 * 其中的 GITHUB_TOKEN 也会被网页访客看到。建议：
 *  1. 该 token 只勾选 gist 权限（当前就是如此）；
 *  2. 若要更安全，可用定时轮换 token 或改用服务端代理写入。
 * ============================================================
 */
const CONFIG = {

  /* ---------- 站点基本信息 ---------- */
  site: {
    author: '跨世代',                    // 固定标识显示的作者
    motto: '求是奋进',                    // 固定标识显示的引言
    pageTitle: '个人网站',  // 浏览器标题
    fixedBadge: '作者：{author} ｜ 引言：{motto}'  // 右上角悬浮文案模板
  },

  /* ---------- 左侧联系方式栏 ---------- */
  contacts: {
    title: '联系方式',
    githubLabel: 'GitHub 主页',
    githubUrl: 'https://github.com/Jatt9520',
    email: '[REDACTED-EMAIL]',
    emailLabel: '我的邮箱'
  },

  /* ---------- 入场弹窗 ---------- */
  modal: {
    welcomeTitle: '欢迎来到我的网站',
    welcomeButton: '确定',
    introText: '这里是一位高中牲一时兴起创建的网站，记录技术探索与内容创作的点滴。你可以在像素画板留下你的印记，也可以逛逛我的项目仓库，感谢你的到访。',
    enterButton: '进入网站'
  },

  /* ---------- 像素画板 ---------- */
  grid: {
    cols: 500,                 // 逻辑网格列数 500
    rows: 500,                 // 逻辑网格行数 500
    background: '#fcfbf7'      // 空像素底色
  },
  painter: {
    title: '像素画板',                          // 画板左上角标题
    enterButton: '进入',                        // 画板内的激活按钮
    remainingText: '今日剩余像素：{n} 个',       // 画板角落实时剩余额度
    quotaExhausted: '今日像素已用完，明天再来吧', // 额度耗尽提示
    zoom: {                                     // 进入画板后的缩放工具栏
      in: '放大',
      out: '缩小',
      fit: '适配',
      levelText: '{scale}x'                     // 当前倍数显示模板
    }
  },
  palette: {
    label: '取色',               // 选色器前的文字
    defaultColor: '#4a90d9'      // 默认画笔颜色
  },

  /* ---------- 每日额度 ---------- */
  quota: {
    daily: 10,                          // 每位访客每日可放置 10 个像素
    storageKey: 'pixel_board_quota_v1'  // localStorage 记录「日期 + 已用数量」
  },

  /* ---------- 彩蛋：键盘输入 100914 加 100 像素 ---------- */
  easterEgg: {
    code: '100914',
    bonus: 100,
    message: '彩蛋激活！今日像素 +100',
    storageKey: 'pixel_board_easter_v1'
  },

  /* ---------- GitHub Gist 数据同步 ---------- */
  gist: {
    id: 'd6db8e01dabeeeb668ff070b2708d474',  // 公开 Gist 的 ID，内含 pixels.json
    token: '[REDACTED-TOKEN]', // 仅勾选 gist 权限的 token
    fileName: 'pixels.json',               // Gist 内的数据文件名
    apiBase: 'https://api.github.com',
    retryTimes: 5,                         // 写入失败自动重试次数
    storageKey: 'pixel_board_backup_v1',   // 本地兜底存储键名
    writeFailMessage: '网络波动中，你的像素已被暂存本地',
    readFailMessage: '云端数据读取失败，暂显示本地缓存'
  },

  /* ---------- 创作板块 ---------- */
  creation: {
    title: '创作初衷',
    text: 'Hi 你好 我是一位高中牲这是我一时兴起创建的网站，谢谢你的访问 有什么建议创意可以与我联系'
  },

  /* ---------- 我的项目板块 ---------- */
  projects: {
    title: '我的项目',
    owner: 'Jatt9520',
    apiBase: 'https://api.github.com',
    repos: [                       // 按固定顺序展示的仓库
      'quasardb',
      'video-spider-installer',
      'MarkdownReader'
    ],
    repoDescs: {                   // 描述兜底：GitHub 上未填 description 时使用
      quasardb: 'From-scratch TypeScript 关系型数据库引擎 · 零依赖，覆盖 SQL 前端、查询优化、执行引擎、页式存储、B+ 树索引与事务'
    },
    noDesc: '暂无描述',
    fallback: '糟糕描述获取失败了'
  },

  /* ---------- 双导航入口（点击后切换视图，不直接显示在主页） ---------- */
  nav: {
    creation: { label: '创作初衷', index: '01', view: 'view-creation' },
    projects: { label: '我的项目', index: '02', view: 'view-projects' }
  },

  /* ---------- 视图内返回主页的按钮 ---------- */
  back: {
    label: '← 返回主页',
    homeView: 'view-home'
  }
};