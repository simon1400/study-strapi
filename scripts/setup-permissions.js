'use strict';

/**
 * Права ролей users-permissions для Next.js-клиента.
 *
 * public (этап 4) — чтение опубликованного контента: клиент ходит в Strapi без
 * токена, контент сайта публичный по определению, а Document Service отдаёт
 * анониму только published-версии. Плюс `create` у заявки на звонок (форма на главной)
 * и `account.register` (модалка «Заполнить анкету»).
 *
 * authenticated (этап 5) — только личный кабинет: свой профиль, своя анкета и
 * смена пароля. Прав на голые `api::questionnaire.*` роль не получает — анкету
 * отдаёт `account`-контроллер, который берёт её по `ctx.state.user`, так что
 * чужую увидеть нельзя.
 *
 * Идемпотентно: строка в up_permissions = разрешение включено, дубли не создаются.
 * Дополнительно удаляет у ролей невалидные api::-права (действия, которых нет
 * ни в одном контроллере) — например, оставшиеся от переименованных типов.
 *
 *   node scripts/setup-permissions.js          # выдать права
 *   node scripts/setup-permissions.js --list   # только показать текущее состояние
 */

const { bootStrapi } = require('./lib/strapi-app');

/** Типы, чтение которых анониму закрыто. */
const PRIVATE_APIS = new Set(['api::questionnaire', 'api::call-request', 'api::account']);
const READ_ACTIONS = new Set(['find', 'findOne']);

/** Права сверх «чтения всего публичного», выдаваемые роли public. */
const PUBLIC_EXTRA = new Set([
  // форма «Заказать звонок» на главной (раньше — лямбда callCreate)
  'api::call-request.call-request.create',
  // регистрация из модалки «Заполнить анкету»
  'api::account.account.register',
]);

/**
 * Права роли authenticated. Плагинные (`plugin::`) тоже разрешены —
 * смена пароля из ЛК идёт штатным `POST /api/auth/change-password`.
 */
const AUTHENTICATED = new Set([
  'api::account.account.me',
  'api::account.account.updateMe',
  'api::account.account.getQuestionnaire',
  'api::account.account.updateQuestionnaire',
  'plugin::users-permissions.auth.changePassword',
]);

/**
 * Реальные id прав content-api в формате `api::<api>.<controller>.<action>`
 * (для single type у контроллера есть только find).
 */
function collectActions(app) {
  const registry = app.plugin('users-permissions').service('users-permissions').getActions();
  const all = [];
  const publicGranted = [];

  for (const [apiName, { controllers }] of Object.entries(registry)) {
    if (!apiName.startsWith('api::')) continue;
    for (const [controller, actions] of Object.entries(controllers)) {
      for (const action of Object.keys(actions)) {
        const id = `${apiName}.${controller}.${action}`;
        all.push(id);
        const isPublicRead = READ_ACTIONS.has(action) && !PRIVATE_APIS.has(apiName);
        if (isPublicRead || PUBLIC_EXTRA.has(id)) publicGranted.push(id);
      }
    }
  }

  return { all: new Set(all), publicGranted: publicGranted.sort() };
}

/** Приводит права одной роли к списку `granted`: добавляет недостающие, чистит битые api::-права. */
async function syncRole(app, type, granted, allActions, listOnly) {
  const role = await app.db.query('plugin::users-permissions.role').findOne({ where: { type } });
  if (!role) throw new Error(`Роль ${type} не найдена`);

  const existing = await app.db.query('plugin::users-permissions.permission').findMany({
    where: { role: { id: role.id } },
  });
  const have = new Set(existing.map((p) => p.action));

  const missing = granted.filter((action) => !have.has(action));
  const stale = existing.filter((p) => p.action.startsWith('api::') && !allActions.has(p.action));

  if (listOnly) {
    console.log(`\nРоль ${type} (id ${role.id}), включено ${have.size} прав:`);
    for (const action of [...have].sort()) console.log(`  ✓ ${action}`);
    for (const action of missing) console.log(`  ✗ ${action} (не включено)`);
    for (const p of stale) console.log(`  ! ${p.action} (нет такого действия)`);
    return;
  }

  console.log(`\nРоль ${type} (id ${role.id}):`);
  for (const p of stale) {
    await app.db.query('plugin::users-permissions.permission').delete({ where: { id: p.id } });
    console.log(`  - ${p.action}`);
  }
  for (const action of missing) {
    await app.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } });
    console.log(`  + ${action}`);
  }
  console.log(
    `  итого положено ${granted.length} прав (добавлено ${missing.length}, удалено невалидных ${stale.length}).`
  );
}

async function main() {
  const listOnly = process.argv.includes('--list');
  const app = await bootStrapi();

  try {
    const { all, publicGranted } = collectActions(app);

    await syncRole(app, 'public', publicGranted, all, listOnly);
    await syncRole(app, 'authenticated', [...AUTHENTICATED].sort(), all, listOnly);

    if (!listOnly) console.log('\nГотово.');
  } finally {
    // на postgres app.destroy() иногда роняет knex уже после работы — см. scripts/README.md
    try {
      await app.destroy();
    } catch {}
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
