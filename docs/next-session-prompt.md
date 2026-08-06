# Промпт для следующей сессии (миграция studycz) — Этап 7: аналитика и GDPR

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

1. ~~Домен studycz.cz не верифицирован в Resend~~ — **СДЕЛАНО 2026-08-06**: записи Resend
   (SPF+MX на `send.studycz.cz`, DKIM `resend._domainkey`) в зоне Wedos, домен верифицирован.
   Проверено живой регистрацией на проде: письмо с паролем от noreply@studycz.cz пришло
   во «Входящие» (не спам), смоук-юзер удалён из postgres.
2. ~~SPF Яндекса на апексе~~ — **отменено решением юзера 2026-08-06**: корпоративная почта
   переезжает с Яндекса на Wedos, SPF добавится тогда. Не предлагать.
3. **google-site-verification всё ещё в lowercase** в зоне Wedos (проверено 2026-08-06) —
   на юзере: поправить регистр на оригинал `kCdhquuqnxGSVwEUlg8MUmt9T8yvrNLn2_eXmkjleR8`
   и нажать Apply Changes.

## Деплой клиента — СДЕЛАН 2026-08-06, **https://studycz.cz публичен**

- `/opt/studycz-client`, pm2 `studycz-client` порт **1342**, ecosystem.config.js в репо.
- nginx `studycz-client`: апекс → 1342, www → 301 апекс, http → https, certbot (studycz.cz + www).
- Вебхук revalidate заведён (строка в `strapi_webhooks`, секрет в `.env` клиента), проверен.
- Смоук пройден целиком: 75 URL sitemap → 200, форма звонка, регистрация с реальным письмом,
  вход, анкета, восстановление пароля end-to-end. Смоук-данные удалены (5 юзеров, 5 анкет,
  0 call_requests). Lighthouse НЕ гоняли — хвост.
- **Найден и обойдён баг Resend** (study-strapi `b3af4a2`+`6e2be19`): их конвейер не экранирует
  `=` при quoted-printable — `=XX` съедался, ссылка сброса приходила с битым токеном. Почта
  переведена со SMTP на HTTP API (локальный провайдер `providers/email-resend/index.js`),
  в html `=`+hex-пара заменяется на `&#61;`. Подробности в комментариях провайдера.

## Текущий этап — 7: аналитика и GDPR

- GA4 через `@next/third-parties`, consent mode v2 в существующем gdpr-баннере,
  пиксели через GTM только после согласия.
- Разведка уже сделана (2026-08-06): **GTM `GTM-M3HKN8D` и Яндекс.Метрика `53724796`
  (с вебвизором) уже вставлены в `src/app/[locale]/layout.tsx` и грузятся безусловно** —
  как на старом сайте (public/index.html). Отдельного GA4-идентификатора в коде нет,
  GA живёт внутри GTM-контейнера. Задача: consent default denied до загрузки GTM
  (инлайн-скрипт в начале body), «Принять»/отказ в `components/layout/Gdpr.tsx`
  (сейчас там только крестик и localStorage `agree_gdpr`), Метрику грузить только после
  согласия (она consent mode не понимает), события `registration` и `call_request`
  в dataLayer из `modals/RegistrationModal.tsx`, `modals/CallModal.tsx`, `home/CallForm.tsx`.

## Потом

- Хвосты: Lighthouse-прогон; hreflang (вместе со вторым языком); next/image;
  секция «Наша медиатека» (мёртвый Instagram API v1 → Graph API).
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
- **Resend портит `=`+hex-пару в QP-частях писем** (и SMTP, и HTTP API) — критичные ссылки
  только в html-части (там провайдер экранирует `&#61;`), атрибуты в письмах всегда квотировать
- SSH на VPS по ключу (BatchMode ок), всё под root; диск 71% — картинки только в ImageKit
- Повторный прогон миграции безопасен, но title филиалов не уникален (6 из 9 — «Украине»)
