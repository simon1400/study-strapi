# Промпт для следующей сессии (миграция studycz) — Этап 6: почта (Resend)

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

**Этапы 0–4** — см. `docs/migration-plan-2026.md`. Коротко:
- **https://admin.studycz.cz/admin — рабочий прод** (pm2 `studycz-strapi`, порт 1341, Postgres
  `studycz_db`, клон `/opt/studycz-strapi`, бэкап БД по cron 3:35). Админ pechunka11@gmail.com,
  пароль в `/root/.studycz_admin_pw` на VPS. ImageKit подключён.
- Контент мигрирован (30 университетов, 13 программ, 15 статей, 7 проживаний, 211 картинок
  в ImageKit, 5 юзеров с перехешированными паролями), всё в локали **ru**, slug'и 1:1.
- `d:\study-client`: Next.js 15 + TS, UIkit 3.1.4, next-intl. Все публичные страницы готовы,
  форма «Заказать звонок» пишет заявку в Strapi.

**Этап 5 — личный кабинет и авторизация СДЕЛАН 2026-08-05:**
- Strapi: свой API `src/api/account` — `POST /account/register`, `GET/PUT /account/me`,
  `GET/PUT /account/questionnaire`. Профиль и анкета берутся по `ctx.state.user`, id в запросе
  не передаётся. Штатный `/auth/local/register` не подошёл: он отбивает все поля кроме
  username/email/password, а профиль и анкету надо заводить сразу.
- `config/plugins.ts`: `jwtManagement` переключён с `refresh` на **`legacy-support`**, jwt на 30 дней —
  сессию держит Next в httpOnly-куке на своём домене, ротация refresh-токенов только мешала бы.
- `scripts/setup-permissions.js` теперь ведёт обе роли: public (чтение + call-request.create +
  account.register) и authenticated (account.* + `auth.changePassword`).
- Клиент: `/api/auth/{login,logout,register,session,change-password}`, `/api/account/{program,questionnaire}`,
  `middleware.ts` закрывает `/user/*`, страницы `/user/personal-area` и `/user/questionnaire/step-1…6`.
- Шапка: «Войти» с выпадающей формой, выпадашка ЛК, «Заполнить анкету»; модалки входа,
  регистрации, смены пароля, звонка. Кнопки «Заполнить анкету» вернулись на главную,
  программу, университет, проживание и статью блога.
- Прогресс анкеты считает сервер и не откатывает назад (старый код при правке уже заполненного
  шага сбрасывал `stepQuestionare` на его номер).
- Проверено локально живьём: регистрация → ЛК → выбор программы → анкета (в т.ч. блоки
  братьев/сестёр) → смена пароля → выход. Тестовые пользователи из локальной базы удалены.

## Текущий этап — Этап 6: почта на Resend

Старые шаблоны: `d:\studycz\src\lambda\mail_template\{registration,admin_registration,call}.js`,
отправка — `sendRegistration.js`, `sendAdminRegistration.js`, `sendCall.js` (nodemailer + Gmail OAuth).

1. **Письмо с паролем после регистрации** — сейчас пароль показывается прямо в модалке
   «Ваша заявка принята» (`src/components/modals/RegDoneModal.tsx`), потому что письма ещё нет.
   Когда письмо заработает, убрать блок с паролем и вернуть текст «мы отправили Вам письмо с паролем».
2. **Письмо админу** о новой регистрации и о заявке на звонок (`/api/call-request`).
3. **Восстановление пароля** — штатный flow Strapi `/api/auth/forgot-password` + `/reset-password`
   (перенесён сюда с этапа 5: без почты его не сделать). Нужна страница `/reset-password`
   на клиенте и провайдер письма в Strapi — сейчас там дефолтный sendmail.
4. Шаблоны — на **react-email** (TSX), адреса и получатели-админы в env.

Аккаунт Resend уже создан. Ключ и верификацию домена studycz.cz спросить у юзера.

## Потом (не в этой сессии)

- **Этап 1 (client-часть) — деплой на VPS**: `/opt/studycz-client`, pm2 `studycz-client` на свободном
  порту 13xx (`ss -tlnp`), nginx на studycz.cz + www, certbot.
  **DNS уже указывает на VPS, сайт станет публичным сразу после первого деплоя.**
- Хвосты этапа 4: sitemap/robots/hreflang, секция «Наша медиатека» (мёртвый Instagram API v1).
- Перед запуском: SPF `v=spf1 redirect=_spf.yandex.net` и google-site-verification в оригинальном
  регистре (`kCdhquuqnxGSVwEUlg8MUmt9T8yvrNLn2_eXmkjleR8`) — юзер делает сам на последнем шаге.

## Грабли

- **PowerShell 5.1 портит кириллицу** в BOM-less UTF-8 при Get-Content/Set-Content без -Encoding —
  для правок текста только инструмент Edit
- Чешская локаль в Strapi — ISO-код **cs**; в URL фронта маппится на `/cz` (`src/i18n/routing.ts`)
- richtext-поля — HTML-строка, рендерим через `src/components/Html.tsx`
- Компоненты Strapi не приходят без `populate` — забытый populate роняет страницу на `.map`
- **Модалки UIkit — только через `ModalPortal`** (`src/components/modals/ModalPortal.tsx`):
  UIkit при показе переносит модалку в `<body>`, и без портала React роняет приложение
  с `NotFoundError: removeChild` при уходе со страницы
- Шапка узнаёт сессию запросом `/api/auth/session` с клиента, а не через `cookies()` при рендере:
  `cookies()` в layout выключил бы статическую генерацию всех 80 публичных страниц
- TypeScript 6 проверяет side-effect импорты: css/scss объявлены в `src/types/styles.d.ts`
- Не запускать `npm run build` при живом `npm run dev` — они дерутся за `.next`, потом 404 на css;
  лечится `rm -rf .next`
- SSH на VPS по ключу (BatchMode ок), всё под root; диск 71% — картинки только в ImageKit
- Повторный прогон миграции безопасен, но title филиалов не уникален (6 из 9 — «Украине»)
