# Скрипты миграции данных (этап 3)

Переносят контент старого сайта studycz.cz в Strapi:

| Скрипт | Источник | Что переносит |
|---|---|---|
| `migrate-sanity.js` | ndjson-экспорт Sanity (`h4jzy7aj/production`) | весь контент + 211 картинок |
| `migrate-mongo.js` | `users-preview.json` / `questions-preview.json` из mongodump | 5 пользователей + 5 анкет |

Оба скрипта поднимают Strapi программно (`createStrapi().load()`), поэтому пишут
через Document Service — с валидацией, локалями, хешированием паролей и текущим
upload-провайдером (локально — local, на проде — ImageKit). API-токен не нужен.

## Запуск

```bash
# локально (sqlite), сначала вхолостую
node scripts/migrate-sanity.js --dry
node scripts/migrate-sanity.js
node scripts/migrate-mongo.js

# на проде — из /opt/studycz-strapi, .env подхватывается автоматически
NODE_ENV=production node scripts/migrate-sanity.js
NODE_ENV=production node scripts/migrate-mongo.js
```

Флаги `migrate-sanity.js`: `--dry` (ничего не пишет), `--skip-images` (без Media Library),
`--only=api::university.university,blog` (подмножество типов), `--file=<путь к ndjson>`.
Флаги `migrate-mongo.js`: `--dry`, `--dir=<папка с *-preview.json>`.

Файлы данных ищутся автоматически: `./migration-data`, `../studycz/migration-data`,
`/root/migration-data`; либо через `--file` / `--dir` / `SANITY_EXPORT` / `MONGO_EXPORT_DIR`.
Сами дампы в репозиторий не коммитятся.

## Идемпотентность

Повторный прогон обновляет, а не дублирует. Естественные ключи:

- slug — university, program, living, article;
- title — city, partner, service;
- title + order — branch (title не уникален: 6 из 9 филиалов называются «Украине»);
- question — faq-item; location — menu; single types — единственный документ;
- email — пользователи; связь с пользователем — анкеты;
- картинки — по детерминированному имени `<оригинал>-<8 символов sanity-хеша>.<ext>`
  (`MediaUploader.fileNameFor`), поиск в `plugin::upload.file` по `name`.

Пароли существующих пользователей при повторном прогоне не перезаписываются
(в старой базе они лежали открытым текстом, Strapi хеширует их при создании).

## Особенности переноса

- Portable Text → HTML (`lib/portable-text.js`), разметка повторяет сериализаторы
  старого сайта: `blockquote`, `.info.positive-info`, `.additions`, ссылки, списки,
  h2/h3, strong/em/underline.
- Весь старый контент — в локаль **ru**; slug'и перенесены 1:1, чтобы не ломать URL.
- Sanity-тип `question` не переносится: это тестовый дубль faq с мусорным текстом.
- `blog.articleOption: ["show_on_blog"]` → `article.showOnBlog`;
  `additionalServices.service[].name` → `service.title`;
  `filials.contactInformations[].typeContact/valueContact` → `branch.contactInformations[].type/value`.
