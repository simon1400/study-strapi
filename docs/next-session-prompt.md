# Промпт для следующей сессии (миграция studycz) — Этап 1 (client): деплой сайта на VPS

Продолжаем модернизацию studycz.cz по плану `docs/migration-plan-2026.md`.
Сверь этот промпт с memory-файлом `studycz-migration-progress` — если расходятся, спроси меня.

> Доки живут в репо **study-strapi** (`d:\study-strapi\docs`) — легаси-репо simon1400/study.full
> заархивирован на GitHub и read-only. В `d:\studycz\docs` лежит та же копия (только локально);
> правишь одну — синхронизируй вторую. Код старого сайта по-прежнему смотрим в `d:\studycz\src`.

## Контекст проекта

Переписываем легаси-сайт 2019 (CRA + React 16, Sanity, MongoDB, Netlify-лямбды, plaintext-пароли) на:
- **Фронт**: Next.js 15 (App Router) + TypeScript, вёрстка 1:1 (UIkit/SCSS остаются, редизайн потом)
- **CMS**: Strapi v5 + PostgreSQL вместо Sanity + MongoDB
- **Хостинг**: Hetzner VPS root@157.90.169.205 (pm2 + nginx + certbot, БЕЗ Docker)
- **Почта**: Resend; **медиа**: ImageKit; **i18n**: ru (базовая) / uk / cs / en
- Два репо (GitHub simon1400): **study-strapi** (клон d:\study-strapi) и **study-client** (d:\study-client)
- Strapi живёт на **admin.studycz.cz**, сайт — studycz.cz + www

## Что уже сделано (этапы 0–6)

Подробности — в `docs/migration-plan-2026.md`. Коротко:
- **https://admin.studycz.cz/admin — рабочий прод** (pm2 `studycz-strapi`, порт 1341, Postgres
  `studycz_db`, клон `/opt/studycz-strapi`, бэкап БД по cron 3:35). Админ pechunka11@gmail.com,
  пароль в `/root/.studycz_admin_pw`. ImageKit подключён.
- Контент мигрирован (30 университетов, 13 программ, 15 статей, 7 проживаний, 211 картинок,
  5 юзеров с перехешированными паролями), всё в локали **ru**, slug'и 1:1 со старым сайтом.
- `d:\study-client`: все публичные страницы, личный кабинет с анкетой из 6 шагов, авторизация
  (JWT в httpOnly-куке), sitemap и robots. Сборка — 80+ страниц.
- Почта на Resend: письмо с паролем после регистрации, уведомления админу о регистрации
  и заявке на звонок, восстановление пароля. Всё шлёт Strapi по SMTP Resend.

## ГЛАВНОЕ: чего не хватает для запуска

1. **Домен studycz.cz не верифицирован в Resend** — на юзере. Зайти на resend.com/domains,
   добавить домен, положить выданные DKIM/SPF-записи в панель Wedos. Пока не сделано,
   письма с `@studycz.cz` отбиваются («domain is not verified»), и пароль после регистрации
   показывается человеку прямо в модалке вместо письма (это запасной путь, он работает).
   Проверить после верификации: `node scripts/setup-email.js --list` и тестовая регистрация.
2. **SPF `v=spf1 redirect=_spf.yandex.net`** и google-site-verification в оригинальном регистре
   (`kCdhquuqnxGSVwEUlg8MUmt9T8yvrNLn2_eXmkjleR8`) — тоже на юзере, в Wedos.

## Текущий этап — деплой клиента на VPS

**ВАЖНО: DNS уже указывает на VPS, сайт станет публичным сразу после первого деплоя.**
Старый сайт сейчас намеренно лежит (apex/www отдают 404).

1. `/opt/studycz-client` — клон simon1400/study-client.
2. `.env`: `STRAPI_URL=http://127.0.0.1:1341` (в обход nginx), `NEXT_PUBLIC_STRAPI_URL=https://admin.studycz.cz`,
   `NEXT_PUBLIC_SITE_URL=https://studycz.cz`, секрет для `POST /api/revalidate`.
3. pm2 `studycz-client` на свободном порту 13xx (проверить `ss -tlnp`), `pm2 save`.
   Рассмотреть `output: 'standalone'` в next.config — на VPS так экономнее по памяти.
4. nginx на studycz.cz + www по образцу `studycz-strapi` (security-headers, блок сканеров 444),
   затем certbot.
5. В Strapi завести вебхук на `https://studycz.cz/api/revalidate` (заголовок `x-revalidate-secret`),
   чтобы публикация в CMS сбрасывала ISR-кеш.
6. После выката прогнать: главную и все разделы, форму звонка, регистрацию (с реальным письмом),
   вход, анкету, восстановление пароля, `/sitemap.xml`, `/robots.txt`, Lighthouse.

## Потом

- Этап 7 — аналитика и GDPR: GA4 через `@next/third-parties`, consent mode v2 в существующем
  gdpr-баннере, пиксели через GTM после согласия.
- Хвосты этапа 4: hreflang (вместе со вторым языком), next/image, секция «Наша медиатека»
  (мёртвый Instagram API v1 → Graph API).
- Этап 8: 301-редиректы старых доменов, мониторинг + Sentry, закрыть Netlify/Mongo/Sanity.

## Грабли

- **PowerShell 5.1 портит кириллицу** в BOM-less UTF-8 при Get-Content/Set-Content без -Encoding —
  для правок текста только инструмент Edit
- Чешская локаль в Strapi — ISO-код **cs**; в URL фронта маппится на `/cz` (`src/i18n/routing.ts`)
- richtext-поля — HTML-строка, рендерим через `src/components/Html.tsx`
- Компоненты Strapi не приходят без `populate` — забытый populate роняет страницу на `.map`
- **Модалки UIkit — только через `ModalPortal`**: UIkit при показе переносит модалку в `<body>`,
  и без портала React роняет приложение с `NotFoundError: removeChild` при уходе со страницы
- Шапка узнаёт сессию запросом `/api/auth/session` с клиента, а не через `cookies()` при рендере:
  `cookies()` в layout выключил бы статическую генерацию всех публичных страниц
- Настройки писем users-permissions (шаблон, ссылка сброса) живут в core_store, а не в коде —
  после развёртывания новой БД прогнать `node scripts/setup-email.js` и `setup-permissions.js`
- TypeScript 6 проверяет side-effect импорты: css/scss объявлены в `src/types/styles.d.ts`
- Не запускать `npm run build` при живом `npm run dev` — дерутся за `.next`, потом 404 на css
- SSH на VPS по ключу (BatchMode ок), всё под root; диск 71% — картинки только в ImageKit
- Повторный прогон миграции безопасен, но title филиалов не уникален (6 из 9 — «Украине»)
