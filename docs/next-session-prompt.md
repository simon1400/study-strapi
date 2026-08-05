# Промпт для следующей сессии (миграция studycz) — Этап 4: Next.js-клиент

Продолжаем модернизацию studycz.cz по плану `docs/migration-plan-2026.md`.
Сверь этот промпт с memory-файлом `studycz-migration-progress` — если расходятся, спроси меня.

> Доки живут в репо **study-strapi** (`d:\study-strapi\docs`) — легаси-репо simon1400/study.full
> заархивирован на GitHub и read-only. В `d:\studycz\docs` лежит та же копия (только локально);
> правишь одну — синхронизируй вторую. Код старого сайта по-прежнему смотрим в `d:\studycz\src`.

## Контекст проекта

Переписываем легаси-сайт 2019 (CRA + React 16, Sanity, MongoDB, Netlify-лямбды, plaintext-пароли) на:
- **Фронт**: Next.js (App Router) + TypeScript, перенос вёрстки 1:1 (UIkit/SCSS остаются, редизайн потом)
- **CMS**: Strapi v5 + PostgreSQL вместо Sanity + MongoDB
- **Хостинг**: Hetzner VPS root@157.90.169.205 (pm2 + nginx + certbot, БЕЗ Docker)
- **Почта**: Resend; **медиа**: ImageKit; **i18n**: ru (базовая) / uk / cs / en (Strapi i18n + next-intl)
- Два репо (GitHub simon1400): **study-strapi** (клон d:\study-strapi) и **study-client** (d:\study-client, пустой)
- Strapi живёт на **admin.studycz.cz**, сайт — studycz.cz + www

## Что уже сделано

**Этапы 0–2 (данные, каркас Strapi, VPS)** — см. `docs/migration-plan-2026.md`. Коротко:
- **https://admin.studycz.cz/admin — рабочий прод** (pm2 `studycz-strapi`, порт 1341, Postgres
  `studycz_db`, клон `/opt/studycz-strapi`, бэкап БД по cron 3:35). Админ pechunka11@gmail.com,
  пароль в `/root/.studycz_admin_pw` на VPS. ImageKit подключён (endpoint https://ik.imagekit.io/5sygns5ep).
- Локально Strapi в `d:\study-strapi` (sqlite, `npm run develop`), там же прогнана та же миграция.

**Этап 3 — миграция данных СДЕЛАН 2026-08-05, контент уже в проде:**
- Скрипты: `study-strapi/scripts/migrate-sanity.js`, `migrate-mongo.js` (+ `lib/`, README рядом).
  Поднимают Strapi программно и пишут через Document Service; идемпотентны (перезапускаемы).
- В проде: 30 университетов, 13 программ, 15 статей, 7 проживаний, 7 партнёров, 9 филиалов,
  21 FAQ, 6 доп. услуг, 3 города, 5 меню, 3 single type (global, homepage, contacts-page) —
  всё опубликовано в локали **ru**, slug'и 1:1 со старым сайтом.
- Медиа: 211 картинок с cdn.sanity.io залиты и лежат в **ImageKit** (в public/uploads пусто).
- Пользователи: 5 + 5 анкет (одна заполненная). Пароли из plaintext перехешированы bcrypt'ом,
  роль authenticated, confirmed=true — старые пароли продолжают работать.
- Portable Text → HTML своим сериализатором, разметка совпадает со старыми serializers
  (blockquote, `.info.positive-info`, `.additions`, ссылки, списки, h2/h3, strong/em/u).

**DNS (Wedos, зона применена).** apex + www уже указывают на VPS 157.90.169.205 — **так и задумано**:
с Netlify уходим совсем, там больше ничего не деплоим и не чиним. Старый сайт намеренно лежит,
пока не запустим новый фронт на VPS. Возврат на Netlify-IP не предлагать.
Мелочи, оставшиеся на мне (юзере) — спроси, сделал ли я:
- SPF: добавить TXT `v=spf1 redirect=_spf.yandex.net`
- google-site-verification в lowercase — заменить на оригинал
  `kCdhquuqnxGSVwEUlg8MUmt9T8yvrNLn2_eXmkjleR8`
- Resend-аккаунт + верификация домена (нужен к этапу 6)

## Текущий этап — Этап 4: Next.js-клиент в d:\study-client

Код старого фронта — в `d:\studycz\src` (CRA): `app/routes/*` (homepage, program, university, living,
blog, partners, agents, contacts, dopUslugy, faq, user, not-found), `app/components/*` (page, sidebar,
modals, gdpr, preload, backButton, switch-city), SCSS в `app/scss`, Netlify-лямбды в `src/lambda`.

1. Каркас Next.js 15 (App Router) + TS в d:\study-client, SCSS/UIkit из старого проекта, next-intl.
2. Роуты 1:1 со старыми URL: `/`, `/program`, `/program/[slug]`, `/university`, `/university/[slug]`,
   `/living`, `/living/[slug]`, `/blog`, `/blog/[slug]`, `/agents`, `/contacts`, `/services`, `/faq`,
   `/partners`, `/user/*`.
3. Данные — fetch к Strapi в Server Components (ISR + revalidateTag по вебхуку Strapi);
   типы полей смотреть в `study-strapi/src/api/*/content-types/*/schema.json`.
4. Картинки — next/image + ImageKit-URL из Strapi.
5. ЛК и формы (этапы 5–6) — после переноса публичных страниц.
6. Деплой клиента на VPS (этап 1, client-часть): `/opt/studycz-client`, pm2 `studycz-client` на
   свободном порту 13xx (проверить `ss -tlnp`), nginx на studycz.cz + www → этот порт, certbot.
   **Важно: DNS уже указывает на VPS, поэтому сайт станет публичным сразу после первого деплоя** —
   выкатывать, когда страницы реально готовы.

Перед этапом 4 стоит завести на Strapi права public-роли на чтение опубликованного контента
(сейчас они не настраивались) и, вероятно, API-токен для серверных запросов из Next.js.

## Грабли

- **PowerShell 5.1 портит кириллицу** в BOM-less UTF-8 при Get-Content/Set-Content без -Encoding —
  для правок текста только инструмент Edit (уже наступали, чинили)
- Чешская локаль в Strapi — ISO-код **cs** (в URL фронта можно маппить на /cz)
- richtext-поля — тип `richtext` (HTML-строка), CKEditor-плагин отложен
- SSH на VPS по ключу (BatchMode ок), всё под root; диск 71% — картинки только в ImageKit
- Sanity-экспорт и mongo-дамп в .gitignore; на VPS копия лежит в `/root/migration-data`
- Повторный прогон миграции безопасен, но title филиалов не уникален (6 из 9 — «Украине»),
  ключ там title+order — не менять порядок вручную в админке до конца миграции
