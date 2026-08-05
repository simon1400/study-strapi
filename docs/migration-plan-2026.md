# План модернизации studycz.cz — 2026

Утверждённые решения: Next.js + TypeScript, Strapi v5 вместо Sanity, всё на Hetzner VPS,
авто-миграция контента и юзеров, Resend для почты, i18n, дизайн 1:1 (редизайн + Tailwind — потом),
Instagram-блок скрываем (воскресим позже через Graph API).

---

## 1. Целевая архитектура

```
                        Hetzner VPS (pm2, без Docker)
┌─────────────────────────────────────────────────────────────┐
│  nginx (reverse proxy) + certbot (HTTPS)                    │
│    ├─ studycz.cz, www   ──►  pm2: Next.js (SSR/ISR)         │
│    └─ admin.studycz.cz  ──►  pm2: Strapi v5 (+ /admin)      │
│                                  │                          │
│                               PostgreSQL 17 (systemd)       │
│                               uploads/ (media)              │
└─────────────────────────────────────────────────────────────┘
Внешние сервисы: Resend (email), GTM/GA4, GitHub Actions (CI/CD)
```

## 2. Стек: было → станет

| Область | Было (2019) | Станет (2026) |
|---|---|---|
| Фреймворк | CRA 3 + React 16, классовые компоненты | **Next.js 16 (App Router) + React 19**, функции/хуки, RSC |
| Язык | JS + Babel-плагины | **TypeScript** (strict) |
| CMS | Sanity (@sanity/client 0.140) | **Strapi v5** self-hosted |
| Роутинг | react-router-dom 4 + connected-react-router | файловый роутинг Next.js |
| Стейт | Redux 4 + thunk | не нужен: RSC + серверные данные; для auth — cookie-сессия |
| Код-сплиттинг | react-loadable | нативный (Next.js / React.lazy) |
| SEO/метатеги | react-helmet 5 | Metadata API Next.js + generateMetadata |
| Стили | node-sass + UIkit 3.0 | **sass (dart-sass)** + UIkit 3.2x (перенос 1:1) |
| БД юзеров | MongoDB + mongoose 5 | **PostgreSQL** внутри Strapi |
| Бэкенд-API | Netlify Functions (netlify-lambda) | Strapi REST API + Next.js Route Handlers / Server Actions |
| Auth | plaintext-пароли, юзер в cookie | Strapi users-permissions: **bcrypt + JWT**, httpOnly cookie |
| Почта | Gmail OAuth2 + googleapis 40 + nodemailer | **Resend** + react-email (шаблоны в TSX) |
| HTTP-клиент | axios 0.18 | нативный fetch |
| Хостинг | Netlify | Hetzner VPS: **pm2** + nginx + certbot |
| i18n | нет (только RU) | **Strapi i18n + next-intl**, hreflang |
| Node | ~10–12 | **Node 20 LTS** (как на VPS), npm |

## 3. Что удаляем полностью (без замены)

- `src/lambda/*` — все 15 лямбд (заменяются Strapi + Server Actions)
- Redux-обвязка: `store.js`, `src/modules/*`, connected-react-router
- SSR-бойлерплейт-рудименты: `hydrate`, `__PRELOADED_STATE__`, react-frontload, react-loadable
- Мёртвые зависимости: `bcrypt` (не использовался!), `sparkpost`, `@babel/polyfill`, `encoding`,
  `md5-file`, `forcedomain`, `query-string`, `js-cookie`, `morgan`, `cors`, весь Babel-набор
- Instagram-блок на главной (Legacy API v1 мёртв; захардкоженный токен удалить) — скрыть, вернуть позже
- `src/app/data/country_copy.json` (дубликат), `.DS_Store` файлы
- Netlify: `netlify.toml`, `public/_redirects`, setupProxy.js

## 4. Этапы работ

### Этап 0 — Подготовка и доступы
- [x] ~~Read-token Sanity~~ — **не нужен**: датасет production проекта `h4jzy7aj` публичный (API и cdn.sanity.io
      читаются без токена). Полный экспорт снят 2026-08-03 → `migration-data/sanity-export-2026-08-03.ndjson`
      (364 док.: 30 university, 15 blog, 13 programs, 9 filials, 7 partners, 7 living, 5 menu, 3 city,
      269 imageAsset, синглтоны homepage/global/contacts/faq/additionalServices, 1 question)
- [x] Дамп MongoDB снят 2026-08-03 → `migration-data/mongo-dump-2026-08-03/` (+ `users-preview.json`,
      `questions-preview.json`, `DB_URL.txt`). Единственная БД кластера — `test`. Данных мало:
      **5 users** (пароли plaintext `scz_*`, один тестовый «Ivan Test»), **5 questions** (заполнена 1 анкета,
      остальные пустые), **0 calls**, **0 sessions**. Переносим всех, объём тривиальный.
- [ ] Аккаунт Resend + верификация домена studycz.cz (SPF/DKIM/DMARC записи)
- [x] DNS: зона перенесена на Wedos (NS ns.wedos.*, было dns1–4.p08.nsone.net) и применена 2026-08-03.
      `admin.studycz.cz` → 157.90.169.205 ✓, MX yandex и TXT-верификации на месте.
      **Решение юзера (2026-08-05): с Netlify уходим совсем — apex и www остаются на VPS,
      старый сайт намеренно лежит до запуска нового фронта. Возврат на Netlify-IP не делаем.**
      Осталось на юзере: TXT `v=spf1 redirect=_spf.yandex.net`; заменить lowercase-токен
      google-site-verification на оригинал `kCdhquuqnxGSVwEUlg8MUmt9T8yvrNLn2_eXmkjleR8`
- [x] Языки утверждены: **uk, ru, cz, en** (ru — базовая локаль, весь старый контент импортируется в неё)
- [x] **Два отдельных репозитория** созданы 2026-08-03 (имена по факту: **`study-strapi`** и **`study-client`**,
      GitHub simon1400); склонированы в `d:\study-strapi` и `d:\study-client` (пустые).
      Скрипты миграции — внутри `study-strapi/scripts/`

### Этап 1 — Инфраструктура VPS (по конвенциям сервера 157.90.169.205, эталон — barbitch)
**Strapi-часть СДЕЛАНА 2026-08-03**: БД studycz_db + юзер (пароль `/root/.studycz_db_pw`), клон
`/opt/studycz-strapi`, .env (18 переменных, без ImageKit — ключей ещё нет), build ok, pm2 `studycz-strapi`
порт 1341 + pm2 save, nginx `studycz-strapi` → admin.studycz.cz + certbot (https 200), бэкап-скрипт
+ cron 3:35, админ создан CLI (pechunka11@gmail.com, пароль в `/root/.studycz_admin_pw`).
**ImageKit подключён 2026-08-05** (ключи в .env, endpoint ik.imagekit.io/5sygns5ep, тестовый
upload проверен). Осталось: client-часть (после этапа 4).

Сервер уже готов: Ubuntu 24.04, Node 20.19.5, pm2, nginx + certbot, PostgreSQL 16. Ничего не ставим,
только добавляем проект по существующему паттерну:
- Клоны: `/opt/studycz-strapi` и `/opt/studycz-client` (git clone соответствующих репозиториев)
- Postgres: БД `studycz_db` + юзер `studycz_user` (пароль в `/root/.studycz_db_pw`)
- **pm2** — свой `ecosystem.config.js` в каждом репо:
  - `studycz-strapi`: `script: 'npm', args: 'start'`, порт из свободных 13xx (проверить `ss -tlnp`)
  - `studycz-client`: Next **standalone** (`output: 'standalone'` в next.config), `script: '.next/standalone/server.js'`,
    `node_args: '--max-old-space-size=384'`, порт из свободных 30xx
  - у обоих: `max_memory_restart: '1G'`, логи в `/var/log/pm2/studycz-*.log`; после запуска `pm2 save`
- nginx: два конфига в sites-available + симлинки (`studycz-client` → studycz.cz+www, `studycz-strapi` → admin.studycz.cz),
  по образцу существующих: security-headers, блок PHP/WP-сканеров (444), `client_max_body_size 100M`; certbot для обоих доменов
- Бэкап: `/root/backups/scripts/studycz_db_backup.sh` (копия barbitch-скрипта: pg_dump --format=custom,
  ротация 14 дней) + строка в crontab; uploads — в тот же бэкап-цикл, если храним локально
- Деплой: как на сервере принято — git pull → npm install → build → `pm2 reload`; позже можно обернуть в GitHub Actions
- Медиа: **ImageKit** как upload-провайдер Strapi (решено; ключи по образцу barbitch — IMAGEKIT_PUBLIC_KEY /
  IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT) — диск VPS (занят на 69%) картинками не нагружаем,
  бэкапить uploads не нужно, CDN и трансформации из коробки

### Этап 2 — Strapi v5: модель контента
Каркас сделан 2026-08-03 (коммит `3f712d4` в study-strapi, ветка main): Strapi 5.51.1 TS,
sqlite dev / postgres prod, ImageKit-плагин, локали ru/uk/cs/en bootstrap'ом,
ecosystem.config.js (порт 1341). Сборка и старт проверены локально.

Content-types (маппинг из Sanity, все контентные — с i18n):

| Sanity type | Strapi | Тип |
|---|---|---|
| homepage | homepage | Single type |
| global (контакты, соцсети) | global | Single type |
| contacts | contacts-page | Single type |
| menu (menu_top / footer_1-3 / sidebar) | menu (поле location: enum) | Collection |
| programs | program | Collection |
| university | university | Collection |
| living | living | Collection |
| blog (+articleOption) | article | Collection |
| faq | faq-item | Collection |
| additionalServices | service | Collection |
| partners | partner | Collection |
| filials (агенты) | branch | Collection |
| city | city | Collection |

Прикладные данные (без i18n, без публичного доступа):
- **user** — расширен users-permissions (name, surname, birthday, sex, country, city, phone, programm,
  programmSelected, dateCourse, price, globalStep, stepQuestionare, numberProfil, confirm)
- **questionnaire** — анкета 6 шагов (step1–step6 JSON, relation oneToOne → user)
- **call-request** — заявки на звонок (name, phone, time, done)

Роли/права: public — только read опубликованного контента; authenticated — свои анкеты (policy «только owner»); формы — через Next.js Server Actions с серверным API-токеном (не светить токены в браузер).

### Этап 3 — Скрипты миграции (`study-strapi/scripts/`) — **СДЕЛАН 2026-08-05**
Скрипты поднимают Strapi программно (`createStrapi().load()`) и пишут через Document Service —
без API-токенов, с валидацией, локалями, хешированием паролей и текущим upload-провайдером.
Документация: `study-strapi/scripts/README.md`.

- [x] **Sanity → Strapi** (`migrate-sanity.js`): ndjson-экспорт → маппинг полей → Document Service
  - [x] Portable Text → HTML своим сериализатором (`lib/portable-text.js`), разметка 1:1 со старым
        сайтом: blockquote, `.info.positive-info`, `.additions`, ссылки, списки, h2/h3, strong/em/u
  - [x] Картинки: 211 использованных ассетов скачаны с cdn.sanity.io и залиты в Media Library
        (на проде ушли в **ImageKit**, локально — local-провайдер)
  - [x] `city._ref` → relation по карте sanity `_id` → strapi `documentId` (города создаются первыми)
  - [x] Slug'и (`url.current`) 1:1, весь контент — в локаль **ru**
  - [x] Идемпотентность: поиск по естественным ключам (slug / title / title+order / location / email),
        картинки — по детерминированному имени `<оригинал>-<8 символов sanity-хеша>.<ext>`
- [x] **MongoDB → Strapi** (`migrate-mongo.js`): 5 users → users-permissions (plaintext-пароли
      хеширует сам Document Service, роль authenticated, confirmed=true), 5 questions → questionnaire
      (1 заполненная); calls/sessions в дампе пустые — переносить нечего
- [x] Отчёт миграции: счётчики создано/обновлено по типам + список предупреждений
- [x] Правки схем под реальные данные: `shared.faculty` (факультет + специализации),
      `university.facultyTitle/facultyImage/faculties`, `program.includeAdditional`,
      `home.service.url`, `shared.person.position`
- Не переносится: sanity-тип `question` — тестовый дубль faq с мусорным текстом

### Этап 4 — Next.js: перенос фронта — **СДЕЛАН 2026-08-05** (публичные страницы)
- [x] Права public-роли в Strapi: `study-strapi/scripts/setup-permissions.js` (идемпотентный,
      прогнан локально и на проде). Чтение всех публичных типов + `create` у call-request;
      анкеты и чтение заявок закрыты. **API-токен не понадобился.**
- [x] Каркас: Next.js 15 App Router + TS в `d:\study-client`, UIkit 3.1.4, sass, next-intl, qs
- [x] Роуты 1:1 со старыми URL: `/`, `/program`, `/program/[slug]`, `/university`, `/university/[slug]`,
      `/living`, `/living/[slug]`, `/blog`, `/blog/[slug]`, `/agents`, `/contacts`, `/services`,
      `/faq`, `/partners`, 404. `/user/*` — этап 5
- [x] Данные: `src/lib/strapi.ts` (getCollection/getBySlug/getSingle/mediaUrl), ISR на час + теги,
      вебхук на `POST /api/revalidate` (заголовок `x-revalidate-secret`)
- [x] Вёрстка 1:1: `src/styles/theme.css` — старый бандл app.css (тема + UIkit), поверх style.scss
      и постраничные `styles/legacy/*.scss`; react-animate-height заменён CSS-раскрытием
- [x] SEO: generateMetadata из Strapi (global/страница), фавиконки, GTM + Яндекс.Метрика через next/script
- [x] i18n: next-intl, `localePrefix: 'as-needed'`; активна одна локаль `ru` — переводов в Strapi
      пока нет, добавление локали в `src/i18n/routing.ts` включает `/cz/...` без ломки русских URL
- [ ] Осталось по этапу: sitemap.ts / robots.ts, hreflang (появится вместе со вторым языком),
      next/image (сейчас `<img>` + трансформации ImageKit `?tr=w-…,h-…`, ближе к старой вёрстке
      и не грузит VPS), секция «Наша медиатека» на Instagram Graph API

### Этап 5 — Личный кабинет и auth
- Регистрация/логин через Strapi (`/api/auth/local`), JWT → **httpOnly secure cookie** (не localStorage)
- Middleware Next.js защищает `/user/*`
- Анкета 6 шагов — перенос форм, сохранение через Server Actions → Strapi
- Восстановление пароля — штатный flow Strapi (forgot/reset) + письмо через Resend

### Этап 6 — Почта (Resend)
- Шаблоны `registration`, `admin_registration`, `call` переписать на **react-email** (TSX)
- Отправка из Server Actions / Strapi lifecycle hooks; адреса и получатели-админы — в env

### Этап 7 — Аналитика и GDPR
- GTM + GA4 через `@next/third-parties`; события форм (регистрация, звонок)
- Cookie-consent баннер (перенести имеющийся gdpr-компонент, подключить к consent mode v2)
- Пиксели (Meta и др.) — через GTM после consent

### Этап 8 — Запуск и вывод старого
- [ ] Прогон: Lighthouse, проверка всех URL по списку из Sanity, формы, письма, ЛК
- [ ] 301-редиректы старых доменов (studyinczech.tk/.net) — на уровне nginx
- [x] ~~Переключение DNS studycz.cz → VPS~~ — уже сделано: apex/www смотрят на 157.90.169.205,
      нужен только nginx-конфиг + certbot для сайта, когда фронт будет готов
- [ ] Мониторинг: uptime-чекер + Sentry (web и cms)
- [ ] После стабилизации: закрыть Netlify (деплой уже не используется), MongoDB Atlas, Sanity
      (после финальной сверки контента)

## 5. Отложено (следующая фаза, держим в памяти)
1. **Instagram** — воскресить через Instagram Graph API (бизнес-аккаунт Meta, серверный токен, кэш)
2. **Редизайн + Tailwind CSS** — после стабильного запуска 1:1

## 6. Риски
- Portable Text → HTML: сложные кастомные блоки могут потребовать ручного маппинга — проверить на реальном контенте рано (этап 3 начать с 1–2 документов каждого типа)
- Схемы Sanity недоступны (репозиторий Studio отдельный) — схему восстанавливаем из GROQ-запросов фронта + живых данных API
- Plaintext-пароли: до запуска нового auth старый сайт остаётся дырявым — не затягивать переключение
- i18n: старый контент одноязычный (ru) — импортируем как базовую локаль, переводы добавляются в Strapi потом
