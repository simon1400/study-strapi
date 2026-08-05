'use strict';

/**
 * Настройки писем users-permissions: русский шаблон восстановления пароля
 * и адрес страницы сброса на фронте.
 *
 * Эти значения живут не в коде, а в таблице настроек плагина (core_store),
 * поэтому их нельзя просто закоммитить — их выставляет этот скрипт.
 * Идемпотентно: перезапись теми же значениями безопасна.
 *
 *   node scripts/setup-email.js          # применить
 *   node scripts/setup-email.js --list   # только показать текущее
 *
 * Ссылка в письме собирается плагином как `<%= URL %>?code=<%= TOKEN %>`,
 * где URL — это `email_reset_password` ниже.
 */

// значения читаются до старта Strapi, поэтому .env подхватываем сами
require('dotenv').config();

const { bootStrapi } = require('./lib/strapi-app');

const CLIENT_URL = (process.env.CLIENT_URL || 'https://studycz.cz').replace(/\/$/, '');
const SUPPORT_EMAIL = process.env.MAIL_REPLY_TO || 'info@studycz.cz';

/**
 * Отправитель берётся из того же `MAIL_FROM`, что и у остальных писем
 * (формат «Имя <адрес>»), — чтобы адрес не пришлось держать в двух местах.
 * Шаблон users-permissions хранит имя и адрес отдельными полями.
 */
function parseFrom(value) {
  const match = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value || '');
  if (match) return { name: match[1] || 'Study in the Czech Republic', email: match[2] };
  return {
    name: 'Study in the Czech Republic',
    email: (value || '').trim() || 'noreply@studycz.cz',
  };
}

const FROM = parseFrom(process.env.MAIL_FROM);

const RESET_MESSAGE = `<p>Привет,</p>
<p>Вы запросили восстановление пароля на сайте studycz.cz.</p>
<p>Чтобы задать новый пароль, перейдите по ссылке:</p>
<p><a href="<%= URL %>?code=<%= TOKEN %>"><%= URL %>?code=<%= TOKEN %></a></p>
<p>Ссылка одноразовая. Если вы не запрашивали восстановление, просто игнорируйте это письмо
или напишите нам на <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
<p>С уважением,<br>команда Study in the Czech Republic</p>`;

async function main() {
  const listOnly = process.argv.includes('--list');
  const app = await bootStrapi();

  try {
    const store = app.store({ type: 'plugin', name: 'users-permissions' });

    const emails = (await store.get({ key: 'email' })) || {};
    const advanced = (await store.get({ key: 'advanced' })) || {};

    if (listOnly) {
      console.log('email.reset_password.options:');
      console.log(JSON.stringify(emails.reset_password?.options ?? null, null, 2));
      console.log(`advanced.email_reset_password: ${advanced.email_reset_password ?? '(не задан)'}`);
      console.log(`advanced.allow_register: ${advanced.allow_register}`);
      return;
    }

    emails.reset_password = {
      ...(emails.reset_password || {}),
      display: 'Email.template.reset_password',
      icon: 'sync',
      options: {
        ...(emails.reset_password?.options || {}),
        from: FROM,
        response_email: SUPPORT_EMAIL,
        object: 'Восстановление пароля',
        message: RESET_MESSAGE,
      },
    };
    await store.set({ key: 'email', value: emails });
    console.log(`  ✓ шаблон письма о восстановлении пароля (от ${FROM.name} <${FROM.email}>)`);

    advanced.email_reset_password = `${CLIENT_URL}/reset-password`;
    await store.set({ key: 'advanced', value: advanced });
    console.log(`  ✓ ссылка сброса: ${advanced.email_reset_password}`);

    console.log('\nГотово.');
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
