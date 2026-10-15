# Отчёт о зависимостях npm

Проверено 14 октября 2026 с доступом к npm registry.

## Исходное состояние 1.0

`npm audit --json`: 13 проблем — 5 moderate, 6 high, 2 critical.  
`npm audit --omit=dev --json`: 0 проблем.

То есть уязвимости находились в инструментах разработки/сборки, а не в production-дереве браузерного приложения. Они всё равно были устранены, поскольку dev server и CI обрабатывают исходники.

| Пакет / цепочка | Серьёзность | Область | Решение | Остаточный риск |
|---|---:|---|---|---|
| Vitest 2 → `tinypool`, `@vitest/mocker`, `vite-node` | critical/moderate | dev/test | Vitest обновлён до 4.1.11 | Не выявлен текущим audit |
| Vite 6 / esbuild | high/moderate | dev/build | Vite обновлён до 7.3.7, plugin-react до 5 | Не выявлен текущим audit |
| Tailwind 3 → `braces`, `chokidar`, `micromatch`, `postcss-*` | high/moderate | dev/build | Миграция на Tailwind 4 + официальный Vite plugin, старый PostCSS pipeline удалён | Не выявлен текущим audit |
| `whatwg-encoding` через старый jsdom | deprecated | test | jsdom обновлён до 27.4.0; предупреждение исчезло | Не выявлен |
| ESLint 9.39.5 | deprecated | dev/lint | ESLint 10 и совместимые плагины | Не выявлен |
| Production dependencies | — | production | `npm audit --omit=dev` изначально и после обновления: 0 | Следить за будущими advisory |

## Итог после обновления

- `npm audit --json`: **0**.
- `npm audit --omit=dev --json`: **0**.
- Lockfile пересоздан и зафиксирован.
- `npm audit fix --force` не применялся.
- Major-обновления Vite, Vitest, Tailwind и ESLint выполнены осознанно; после них пройдены lint, unit-тесты, production build и Playwright.

Повторная проверка:

```powershell
npm ci
npm audit --json
npm audit --omit=dev --json
npm run lint
npm test
npm run build
```

Результат audit отражает базу advisory на дату запуска. Его следует повторять перед каждым выпуском.
