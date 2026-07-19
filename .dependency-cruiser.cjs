/**
 * Механическая защита архитектурных границ MidMind (TASK-003).
 *
 * Проверяет ИНВАРИАНТЫ импортов из CLAUDE.md / tasks.json:
 *   INV2 — чистое ядро: src/engine/** и src/shared/** НЕ импортируют
 *          electron / react / better-sqlite3 / fs / сеть.
 *   INV1 — границы renderer: src/renderer/** НЕ импортирует src/main/**
 *          и src/engine/{rules,draft,facts,timings}.
 *
 * Запуск: `npm run lint:boundaries` (входит в `npm run lint`).
 * Резолв path-алиасов (@main, @shared, …) — через tsconfig.node.json.
 */

/** Регулярка ядра, к которому применяется INV2. */
const CORE = '^src/(engine|shared)/';

module.exports = {
  forbidden: [
    // ── INV2: чистое ядро без electron ──────────────────────────────
    {
      name: 'core-no-electron',
      comment:
        'INV2: src/engine/** и src/shared/** не должны импортировать electron. ' +
        'Вся electron-логика живёт в main/preload.',
      severity: 'error',
      from: { path: CORE },
      to: { path: '(node_modules[/\\\\]|^)electron([/\\\\]|$)' }
    },

    // ── INV2: чистое ядро без react ─────────────────────────────────
    {
      name: 'core-no-react',
      comment:
        'INV2: src/engine/** и src/shared/** не должны импортировать react/react-dom. ' +
        'UI живёт только в renderer.',
      severity: 'error',
      from: { path: CORE },
      to: { path: '(node_modules[/\\\\]|^)(react|react-dom)([/\\\\]|$)' }
    },

    // ── INV2: чистое ядро без better-sqlite3 ────────────────────────
    {
      name: 'core-no-sqlite',
      comment:
        'INV2: src/engine/** и src/shared/** не должны импортировать better-sqlite3. ' +
        'Доступ к БД — только из main.',
      severity: 'error',
      from: { path: CORE },
      to: { path: '(node_modules[/\\\\]|^)better-sqlite3([/\\\\]|$)' }
    },

    // ── INV2: чистое ядро без uiohook-napi ──────────────────────────
    {
      name: 'core-no-uiohook',
      comment:
        'INV2: src/engine/** и src/shared/** не должны импортировать uiohook-napi (native). ' +
        'Глобальный клавиатурный хук — только main/hotkeys (UiohookBackend).',
      severity: 'error',
      from: { path: CORE },
      to: { path: '(node_modules[/\\\\]|^)uiohook-napi([/\\\\]|$)' }
    },

    // ── INV2: чистое ядро без файловой системы ──────────────────────
    {
      name: 'core-no-fs',
      comment:
        'INV2: src/engine/** и src/shared/** не должны импортировать fs. ' +
        'Ввод/вывод — забота main (config-loader, БД).',
      severity: 'error',
      from: { path: CORE },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?fs(/promises)?$'
      }
    },

    // ── INV2: чистое ядро без сети ──────────────────────────────────
    {
      name: 'core-no-network',
      comment:
        'INV2: src/engine/** и src/shared/** не должны импортировать сеть ' +
        '(http/https/net/tls/dgram/dns или http-клиенты). Внешние данные — через DataService в main (INV5).',
      severity: 'error',
      from: { path: CORE },
      to: {
        path: [
          // node core network modules
          '^(node:)?(http|https|http2|net|tls|dgram|dns)(/promises)?$',
          // популярные http-клиенты (на будущее — сейчас не установлены)
          '(node_modules[/\\\\]|^)(axios|node-fetch|undici|got|graphql-request|ws)([/\\\\]|$)'
        ]
      }
    },

    // ── INV1: renderer не тянет main ────────────────────────────────
    {
      name: 'renderer-no-main',
      comment:
        'INV1: src/renderer/** — тупая проекция состояния через IPC; ' +
        'он НИКОГДА не импортирует src/main/**. Общайся только через window.midmind (IpcContract).',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^src/main/' }
    },

    // ── INV1: renderer не тянет реализацию движка ───────────────────
    {
      name: 'renderer-no-engine-impl',
      comment:
        'INV1: src/renderer/** не импортирует src/engine/{rules,draft,facts,timings}. ' +
        'Результаты этих движков приходят из main через IPC.',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^src/engine/(rules|draft|facts|timings)(/|$)' }
    }
  ],

  options: {
    // Резолв TS path-алиасов (@main/@preload/@engine/@shared) и .ts/.tsx.
    tsConfig: { fileName: 'tsconfig.node.json' },
    tsPreCompilationDeps: true,
    // node_modules/core-модули остаются листовыми узлами (чтобы правила могли
    // их поймать), но внутрь них не углубляемся.
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'],
      mainFields: ['module', 'main', 'types', 'typings']
    }
  }
};
