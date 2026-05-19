import { defineConfig } from 'vitepress';

export default defineConfig({
  base: '/march-cli/',
  title: 'March CLI',
  description: 'Terminal-native coding agent with context reconstruction and Markdown memory.',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#181411' }],
    ['meta', { property: 'og:title', content: 'March CLI' }],
    ['meta', { property: 'og:description', content: "Code with context that doesn't rot." }],
  ],
  themeConfig: {
    logo: '/assets/march-banner.png',
    search: {
      provider: 'local',
    },
    nav: [
      { text: 'Start', link: '/start/install' },
      { text: 'Concepts', link: '/concepts/context' },
      { text: 'Reference', link: '/reference/providers' },
      { text: 'GitHub', link: 'https://github.com/decolua/march-cli' },
    ],
    sidebar: [
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
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/decolua/march-cli' },
    ],
    footer: {
      message: 'Released as source-first CLI software.',
      copyright: 'Copyright © 2026 March CLI',
    },
  },
});
