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
    text: 'Hi 你好，欢迎访问我的网站，我是一名高中生。做这个网站，是因为想把「喜欢」变成「作品」——用原生的 HTML、CSS 与 JavaScript，把液态玻璃的质感做到极致，如果这里有什么打动了你，或者你有什么好的建议，欢迎来找我聊聊。',
    githubLabel: 'GitHub',
    githubUrl: 'https://github.com/Jatt9520'
  },

  /* ---------- 第三屏：我的项目（读静态烤制数据，GitHub Actions 每日刷新） ---------- */
  projects: {
    kicker: 'PROJECTS',
    title: '我的项目',
    dataFile: './assets/projects.json',
    repos: [                       // 按固定顺序展示的仓库
      'quasardb',
      'MarkdownReader',
      'video-spider-installer'
    ],
    repoDescs: {                   // 描述兜底：GitHub 未填 description 时使用
      quasardb: 'From-scratch TypeScript 关系型数据库引擎 · 零依赖，覆盖 SQL 前端、查询优化、执行引擎、页式存储、B+ 树索引与事务',
      MarkdownReader: '一款现代 Markdown 阅读器：实时预览、主题跟随语法高亮、标题大纲、PDF 导出——轻量零框架，全量中文注释。'
    },
    highlights: {                  // 「看看细节」展开的技术清单（纯清单、不叙述）
      quasardb: [
        'SQL 前端 · 完整语法解析',
        '查询优化器 + 执行引擎',
        '页式存储 · B+ 树索引',
        '事务 · 零依赖纯 TypeScript'
      ],
      MarkdownReader: [
        'QTextBrowser 轻量预览 · 免浏览器内核秒启动',
        'AI 助手 · 需自备 API Key · 兼容 OpenAI 系接口',
        '标题大纲跳转 · 任务列表 · 本地图片渲染',
        'PDF / HTML 双格式导出 · GBK 编码自动识别',
        '全量中文注释 · 中英双语 README'
      ],
      'video-spider-installer': [
        '26 个平台视频去水印服务部署',
        '静默安装 / 更新 / 卸载参数化',
        '自定义目录 · 端口 · 代理',
        'GBK 编码与括号管道转义修复'
      ]
    },
    detailLabel: '看看细节',
    noDesc: '暂无描述',
    fallback: '糟糕，项目加载失败了，去 GitHub 主页看看吧'
  },

  /* ---------- 第四屏：炫技区（五张会动的演示卡） ---------- */
  showcase: {
    kicker: 'SHOWCASE',
    title: '炫技区',
    sub: '刷到喜欢的动效，就亲手复刻一遍——这里每张卡都是活的。',
    end: '清单上还排着好几个动效 · 未完待续'
  },

  /* ---------- 导航珠的项目卫星（绕珠小行星，点击直达仓库） ---------- */
  orbPlanets: [
    { repo: 'quasardb',               color: '#3178c6' },   // TypeScript 蓝
    { repo: 'MarkdownReader',         color: '#3572A5' },   // Python 蓝
    { repo: 'video-spider-installer', color: '#C1F12E' },   // Batchfile 黄绿
  ],

  /* ---------- 页脚（横置胶囊） ---------- */
  footer: {
    githubLabel: 'GitHub',
    githubUrl: 'https://github.com/Jatt9520',
    copyright: '© 2026 跨世代 · Powered by GitHub Pages'
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

};
