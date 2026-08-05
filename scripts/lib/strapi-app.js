'use strict';

const path = require('path');

/**
 * Поднимает Strapi программно (без HTTP-сервера) — скрипты работают с той же БД
 * и тем же upload-провайдером, что и приложение (локально local, на проде ImageKit).
 */
async function bootStrapi({ quiet = true } = {}) {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const appDir = path.resolve(__dirname, '..', '..');
  const appContext = await compileStrapi({ appDir, distDir: path.join(appDir, 'dist') });
  const app = await createStrapi(appContext).load();
  if (quiet) app.log.level = 'warn';
  return app;
}

module.exports = { bootStrapi };
