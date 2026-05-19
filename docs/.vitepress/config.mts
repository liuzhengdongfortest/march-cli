import { defineConfig } from 'vitepress';

const sharedSearch = {
  provider: 'local' as const,
};

const englishSidebar = [
  {
    text: 'Start Here',
    items: [
      { text: 'Install March', link: '/start/install' },
      { text: 'Configuration', link: '/start/configuration' },
    ],
  },
  {
    text: 'Concepts',
    items: [
      { text: 'Context Model', link: '/concepts/context' },
      { text: 'Memory System', link: '/concepts/memory' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Custom Providers', link: '/reference/providers' },
    ],
  },
  {
    text: 'Design Notes',
    items: [
      { text: 'Context Core', link: '/context-core' },
      { text: 'Markdown Memory System', link: '/markdown-memory-system' },
    ],
  },
];

const chineseSidebar = [
  {
    text: '开始',
    items: [
      { text: '安装 March', link: '/zh/start/install' },
      { text: '配置', link: '/zh/start/configuration' },
    ],
  },
  {
    text: '概念',
    items: [
      { text: '上下文模型', link: '/zh/concepts/context' },
      { text: '记忆系统', link: '/zh/concepts/memory' },
    ],
  },
  {
    text: '参考',
    items: [
      { text: '自定义 Provider', link: '/zh/reference/providers' },
    ],
  },
  {
    text: '设计笔记',
    items: [
      { text: '上下文核心模型', link: '/context-core' },
      { text: 'Markdown 记忆系统', link: '/markdown-memory-system' },
    ],
  },
];

export default defineConfig({
  base: '/march-cli/',
  title: 'March CLI',
  description: 'Terminal-native coding agent with context reconstruction and Markdown memory.',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#ffffff' }],
    ['meta', { property: 'og:title', content: 'March CLI' }],
    ['meta', { property: 'og:description', content: "Code with context that doesn't rot." }],
  ],
  themeConfig: {
    search: sharedSearch,
    nav: [
      { text: 'Start', link: '/start/install' },
      { text: 'Concepts', link: '/concepts/context' },
      { text: 'Reference', link: '/reference/providers' },
      { text: '中文', link: '/zh/' },
    ],
    sidebar: englishSidebar,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/decolua/march-cli' },
    ],
    footer: {
      message: 'Free and open source. Source-first, terminal-native, and Markdown-based.',
      copyright: 'March CLI documentation.',
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'March CLI',
      description: 'Terminal-native coding agent with context reconstruction and Markdown memory.',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'March CLI',
      description: '终端原生的编程 Agent，围绕上下文重建和 Markdown 记忆工作。',
      themeConfig: {
        nav: [
          { text: '开始', link: '/zh/start/install' },
          { text: '概念', link: '/zh/concepts/context' },
          { text: '参考', link: '/zh/reference/providers' },
          { text: 'English', link: '/' },
        ],
        sidebar: chineseSidebar,
        footer: {
          message: '开源、源码优先、终端原生、基于 Markdown。',
          copyright: 'March CLI 文档。',
        },
      },
    },
  },
});
