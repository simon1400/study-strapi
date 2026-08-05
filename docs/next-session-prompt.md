# Промпт для следующей сессии (миграция studycz) — Этап 5: личный кабинет и авторизация

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

## Что уже сделано

**Этапы 0–3** — см. `docs/migration-plan-2026.md`. Коротко:
- **https://admin.studycz.cz/admin — рабочий прод** (pm2 `studycz-strapi`, порт 1341, Postgres
  `studycz_db`, клон `/opt/studycz-strapi`, бэкап БД по cron 3:35). Админ pechunka11@gmail.com,
  пароль в `/root/.studycz_admin_pw` на VPS. ImageKit подключён.
- Контент мигрирован (30 университетов, 13 программ, 15 статей, 7 проживаний и т.д., 211 картинок
  в ImageKit, 5 юзеров с перехешированными паролями), всё в локали **ru**, slug'и 1:1.

**Этап 4 — публичные страницы СДЕЛАН 2026-08-05** (коммит `4aa5b2e` в study-client, ветка main):
- `d:\study-client`: Next.js 15 + TS, UIkit 3.1.4, next-intl, sass, qs. `npm run dev` → localhost:3000.
- Страницы: главная, `/program`, `/program/[slug]`, `/university`, `/university/[slug]`, `/living`,
  `/living/[slug]`, `/blog`, `/blog/[slug]`, `/agents`, `/contacts`, `/services`, `/faq`, `/partners`, 404.
  Сборка проходит, 80 страниц пререндерится, lint чистый, вид сверен со старым скриншотами.
- Данные: `src/lib/strapi.ts`, public-роль Strapi (без токена), ISR час + `POST /api/revalidate`.
- Стили: `src/styles/theme.css` = старый `app.css` (тема + UIkit), поверх `style.scss` и `legacy/*.scss`.
- Заявка на звонок с главной работает: `POST /api/call-request` → Strapi `call-request` (проверено
  на проде, тестовая запись удалена). Письма админу — этап 6.
- **Осознанно НЕ переносили** (это этап 5): блок «Войти» в шапке, модалки регистрации/пароля,
  кнопки «Заполнить анкету», весь `/user/*`. Ещё отложено: секция «Наша медиатека» (мёртвый
  Instagram API v1), sitemap/robots/hreflang.

## Текущий этап — Этап 5: ЛК и авторизация

Старый код: `d:\studycz\src\app\routes\user\*` (personal_area, questionnaire/step_1…6, components/*),
модалки — `d:\studycz\src\app\components\modals\*`, шапка с логином — `d:\studycz\src\app\header.js`.

1. Авторизация через Strapi `/api/auth/local`, JWT в **httpOnly secure cookie** (не localStorage!),
   middleware Next.js закрывает `/user/*`.
2. Регистрация: модалка «Заполнить анкету» → `/api/auth/local/register` + создание `questionnaire`.
3. Анкета 6 шагов: `questionnaire.step1…step6` — json-поля, писать через Server Actions.
   Данные уже мигрированы (5 анкет), формат json смотреть в существующих записях.
4. Восстановление пароля — штатный flow Strapi (forgot/reset), письмо через Resend (этап 6).
5. Вернуть в шапку блок логина/выпадашку ЛК и кнопки «Заполнить анкету» на страницах программ,
   университетов, проживания и в блоге (сейчас на их месте только «Задать вопрос»).

Права в Strapi выдаёт `study-strapi/scripts/setup-permissions.js` — для ЛК понадобится
дописать права authenticated-роли (questionnaire find/update/create только своей анкеты).

## Потом (не в этой сессии)

- **Этап 6** — Resend: письма о регистрации, заявке на звонок, восстановлении пароля.
- **Этап 1 (client-часть) — деплой на VPS**: `/opt/studycz-client`, pm2 `studycz-client` на свободном
  порту 13xx (`ss -tlnp`), nginx на studycz.cz + www, certbot.
  **DNS уже указывает на VPS, сайт станет публичным сразу после первого деплоя.**
- Перед запуском: SPF `v=spf1 redirect=_spf.yandex.net` и google-site-verification в оригинальном
  регистре (`kCdhquuqnxGSVwEUlg8MUmt9T8yvrNLn2_eXmkjleR8`) — юзер делает сам на последнем шаге.
  Аккаунт Resend уже создан.

## Грабли

- **PowerShell 5.1 портит кириллицу** в BOM-less UTF-8 при Get-Content/Set-Content без -Encoding —
  для правок текста только инструмент Edit
- Чешская локаль в Strapi — ISO-код **cs**; в URL фронта маппится на `/cz` (`src/i18n/routing.ts`)
- richtext-поля — HTML-строка, рендерим через `src/components/Html.tsx`
- Компоненты Strapi не приходят без `populate` — забытый populate роняет страницу на `.map`
- TypeScript 6 проверяет side-effect импорты: css/scss объявлены в `src/types/styles.d.ts`
- Не запускать `npm run build` при живом `npm run dev` — они дерутся за `.next`, потом 404 на css;
  лечится `rm -rf .next`
- SSH на VPS по ключу (BatchMode ок), всё под root; диск 71% — картинки только в ImageKit
- Повторный прогон миграции безопасен, но title филиалов не уникален (6 из 9 — «Украине»)
