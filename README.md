# study-strapi

Strapi v5 CMS для [studycz.cz](https://studycz.cz) — живёт на `admin.studycz.cz`.
Часть модернизации 2026 (миграция с Sanity + MongoDB/Netlify); план — `docs/migration-plan-2026.md`
в старом репозитории `studycz`.

## Стек

- Strapi 5 (TypeScript), Node 20
- БД: PostgreSQL на проде (`studycz_db`), SQLite локально (по умолчанию)
- Медиа: ImageKit (`strapi-plugin-imagekit`); без ключей в env плагин выключен — файлы локально
- i18n: локали `ru` (базовая), `uk`, `cs`, `en` — создаются автоматически при старте (bootstrap в `src/index.ts`)

## Локальная разработка

```bash
npm install
cp .env.example .env   # заполнить секреты
npm run develop
```

## Content-types

Контент (все с i18n): `homepage`, `global`, `contacts-page` (single) + `menu`, `program`,
`university`, `living`, `article`, `faq-item`, `service`, `partner`, `branch`, `city`.

Прикладные (без i18n): `questionnaire` (анкета 6 шагов, JSON-шаги, relation → user),
`call-request`; юзеры — расширенный `users-permissions` (профиль + шаги регистрации).

## Деплой (Hetzner VPS)

- Клон в `/opt/studycz-strapi`, pm2 через `ecosystem.config.js` (порт 1341, имя `studycz-strapi`)
- `git pull && npm install && npm run build && pm2 reload studycz-strapi`
- nginx: `admin.studycz.cz` → 127.0.0.1:1341, certbot
- Скрипты миграции контента: `scripts/` (Sanity → Strapi, MongoDB → Strapi)
