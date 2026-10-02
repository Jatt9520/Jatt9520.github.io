/**
 * ============================================================
 * config.js · 站点全部可配置内容
 * ------------------------------------------------------------
 * 文案 / 链接 / 参数全部集中在这里，业务代码只引用变量。
 * ============================================================
 */
const CONFIG = {

  /* ---------- 站点基本信息 ---------- */
  site: {
    pageTitle: '跨世代 · Liquid Glass',
    fixedBadge: '跨世代 · 求是奋进'
  },

  /* ---------- 首屏：唯美风景 ---------- */
  hero: {
    name: '跨世代',
    motto: '求是奋进',
    tagline: '个人创作者',
    scrollHint: '向下滑动 · 继续探索',
    heroImage: './assets/hero.jpg',      // 首屏风景（Unsplash 免费授权，可随时替换）
    avatarImage: './assets/avatar.jpg',  // 玻璃球内的极简海景（同图裁剪）
    /* 点击头像丝滑展开的自我介绍 */
    about: {
      kicker: 'ABOUT',
      title: '个人创作者',
      text: '一个喜欢折腾的学生，正在把技术和审美一点点磨成作品。欢迎来我的 GitHub 看看我在造什么。',
      githubLabel: 'GitHub 主页 →'
    }
  },

  /* ---------- 第二屏：创作初衷 ---------- */
  creation: {
    kicker: 'ORIGINS',
    title: '创作初衷',
    text: 'Hi 你好，欢迎访问我的网站，我是一名高中牲。做这个网站，是因为想把「喜欢」变成「作品」——用原生的 HTML、CSS 与 JavaScript，把液态玻璃的质感做到极致，如果这里有什么打动了你，或者你有什么好的建议，欢迎来找我聊聊。',
    githubLabel: 'GitHub',
    githubUrl: 'https://github.com/Jatt9520'
  },

  /* ---------- 第三屏：我的项目（GitHub 实时拉取） ---------- */
  projects: {
    kicker: 'PROJECTS',
    title: '我的项目',
    owner: 'Jatt9520',
    apiBase: 'https://api.github.com',
    repos: [                       // 按固定顺序展示的仓库
      'quasardb',
      'MarkdownReader',
      'video-spider-installer'
    ],
    repoDescs: {                   // 描述兜底：GitHub 未填 description 时使用
      quasardb: 'From-scratch TypeScript 关系型数据库引擎 · 零依赖，覆盖 SQL 前端、查询优化、执行引擎、页式存储、B+ 树索引与事务'
    },
    noDesc: '暂无描述',
    fallback: '糟糕，项目加载失败了，去 GitHub 主页看看吧'
  },

  /* ---------- 页脚（横置胶囊） ---------- */
  footer: {
    githubLabel: 'GitHub',
    githubUrl: 'https://github.com/Jatt9520',
    copyright: '© 2026 跨世代 · Powered by GitHub Pages'
  },

  /* ---------- 欢迎弹窗（仅首次访问展示） ---------- */
  modal: {
    title: '欢迎来到我的网站',
    text: '这里是一块用原生代码打磨的液态玻璃。往下滑，看看风景与作品。',
    button: '进入网站'
  },

  /* ---------- 液态玻璃效果开关 ---------- */
  glass: {
    storageKey: 'glass_mode',            // localStorage 状态键
    tip: '材质切换'                       // 悬停 1 秒后的提示文案
  },

  /* ---------- 深浅色切换（auto 跟随系统） ---------- */
  theme: {
    storageKey: 'theme_mode',            // 可取 auto / light / dark
    tip: '深浅色切换'
  },

  /* ---------- 首次访问标记 ---------- */
  firstVisit: {
    storageKey: 'site_first_visit'       // 值为 ISO 时间戳
  }
};
