'use strict';

/**
 * Права public-роли на чтение опубликованного контента.
 *
 * Next.js-клиент (этап 4) ходит в Strapi без токена: контент сайта публичный
 * по определению, а Document Service отдаёт анониму только published-версии.
 *
 * Идемпотентно: строка в up_permissions = разрешение включено, дубли не создаются.
 * Дополнительно удаляет у public невалидные api::-права (действия, которых нет
 * ни в одном контроллере) — например, оставшиеся от переименованных типов.
 *
 *   node scripts/setup-permissions.js          # включить чтение
 *   node scripts/setup-permissions.js --list   # только показать текущее состояние
 *
 * Анкеты пользователя и заявки на звонок на чтение НЕ открываем: у заявки
 * публичен только create (форма на главной), остальное — через JWT на этапах 5–6.
 */

const { bootStrapi } = require('./lib/strapi-app');

const PRIVATE_APIS = new Set(['api::questionnaire', 'api::call-request']);
const READ_ACTIONS = new Set(['find', 'findOne']);

/**
 * Кроме чтения: форма «Заказать звонок» на главной создаёт заявку без авторизации
 * (раньше это делала Netlify-лямбда callCreate). Читать заявки анониму по-прежнему нельзя.
 */
const EXTRA_ACTIONS = new Set(['api::call-request.call-request.create']);

/**
 * Реальные id прав content-api в формате `api::<api>.<controller>.<action>`
 * (для single type у контроллера есть только find).
 */
function collectActions(app) {
  const registry = app.plugin('users-permissions').service('users-permissions').getActions();
  const all = [];
  const granted = [];

  for (const [apiName, { controllers }] of Object.entries(registry)) {
    if (!apiName.startsWith('api::')) continue;
    for (const [controller, actions] of Object.entries(controllers)) {
      for (const action of Object.keys(actions)) {
        const id = `${apiName}.${controller}.${action}`;
        all.push(id);
        const isPublicRead = READ_ACTIONS.has(action) && !PRIVATE_APIS.has(apiName);
        if (isPublicRead || EXTRA_ACTIONS.has(id)) granted.push(id);
      }
    }
  }

  return { all: new Set(all), granted: granted.sort() };
}

async function main() {
  const listOnly = process.argv.includes('--list');
  const app = await bootStrapi();

  try {
    const role = await app.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
    if (!role) throw new Error('Роль public не найдена');

    const existing = await app.db.query('plugin::users-permissions.permission').findMany({
      where: { role: { id: role.id } },
    });
    const have = new Set(existing.map((p) => p.action));

    const { all, granted } = collectActions(app);
    const missing = granted.filter((action) => !have.has(action));
    const stale = existing.filter((p) => p.action.startsWith('api::') && !all.has(p.action));

    if (listOnly) {
      console.log(`Роль public (id ${role.id}), включено ${have.size} прав:`);
      for (const action of [...have].sort()) console.log(`  ✓ ${action}`);
      for (const action of missing) console.log(`  ✗ ${action} (не включено)`);
      for (const p of stale) console.log(`  ! ${p.action} (нет такого действия)`);
      return;
    }

    for (const p of stale) {
      await app.db.query('plugin::users-permissions.permission').delete({ where: { id: p.id } });
      console.log(`  - ${p.action}`);
    }

    for (const action of missing) {
      await app.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } });
      console.log(`  + ${action}`);
    }

    console.log(
      `Готово: public-роли положено ${granted.length} прав (добавлено ${missing.length}, удалено невалидных ${stale.length}).`
    );
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
