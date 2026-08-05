#!/usr/bin/env node
'use strict';

/**
 * Миграция пользователей и анкет MongoDB -> Strapi.
 *
 *   node scripts/migrate-mongo.js [--dir <migration-data>] [--dry]
 *
 * Источник — JSON-строчные выгрузки из mongodump (`users-preview.json`,
 * `questions-preview.json` в формате MongoDB Extended JSON; в дампе ровно
 * по 5 документов, коллекции calls/sessions пустые).
 *
 * Пароли в старой базе лежали открытым текстом (`scz_*`) — Document Service
 * users-permissions хеширует их сам при создании пользователя.
 * Скрипт идемпотентен: пользователь ищется по email, анкета — по связи с ним.
 */

const fs = require('fs');
const path = require('path');

const { bootStrapi } = require('./lib/strapi-app');

const USER_UID = 'plugin::users-permissions.user';
const QUESTIONNAIRE_UID = 'api::questionnaire.questionnaire';

// ---------------------------------------------------------------- аргументы

function parseArgs(argv) {
  const args = { dry: false, dir: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry' || arg === '--dry-run') args.dry = true;
    else if (arg.startsWith('--dir=')) args.dir = arg.slice(6);
    else if (arg === '--dir') args.dir = argv[argv.indexOf(arg) + 1];
  }
  return args;
}

function findDataDir(explicit) {
  const candidates = [
    explicit,
    process.env.MONGO_EXPORT_DIR,
    path.resolve(__dirname, '..', 'migration-data'),
    path.resolve(__dirname, '..', '..', 'studycz', 'migration-data'),
    '/root/migration-data',
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'users-preview.json'))) return dir;
  }
  throw new Error('не найден users-preview.json: укажите --dir <migration-data>');
}

// ------------------------------------------- MongoDB Extended JSON -> JS

function unwrapExtendedJson(value) {
  if (Array.isArray(value)) return value.map(unwrapExtendedJson);
  if (value === null || typeof value !== 'object') return value;

  const keys = Object.keys(value);
  if (keys.length === 1) {
    const [key] = keys;
    if (key === '$oid') return value.$oid;
    if (key === '$numberInt' || key === '$numberLong') return Number(value[key]);
    if (key === '$numberDouble' || key === '$numberDecimal') return Number(value[key]);
    if (key === '$date') return new Date(unwrapExtendedJson(value.$date)).toISOString();
  }

  const out = {};
  for (const key of keys) out[key] = unwrapExtendedJson(value[key]);
  return out;
}

function readJsonLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^﻿/, '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => unwrapExtendedJson(JSON.parse(line)));
}

// ------------------------------------------------------------------- main

const isFilled = (step) =>
  !!step && Object.values(step).some((v) => (typeof v === 'object' ? isFilled(v) : v !== '' && v !== 0 && v !== false));

async function main() {
  const args = parseArgs(process.argv);
  const dir = findDataDir(args.dir);
  const users = readJsonLines(path.join(dir, 'users-preview.json'));
  const questions = fs.existsSync(path.join(dir, 'questions-preview.json'))
    ? readJsonLines(path.join(dir, 'questions-preview.json'))
    : [];

  console.log(`Mongo-выгрузка: ${dir}`);
  console.log(`  users: ${users.length}, questions: ${questions.length}`);
  if (args.dry) console.log('  режим --dry: ничего не записывается');

  const app = await bootStrapi();
  const stats = { usersCreated: 0, usersUpdated: 0, quizCreated: 0, quizUpdated: 0, skipped: 0 };
  const warnings = [];

  try {
    const authenticatedRole = await app.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' }, select: ['id'] });
    if (!authenticatedRole) throw new Error('роль authenticated не найдена');

    const mongoIdToDocumentId = new Map();

    for (const user of users) {
      if (!user.email) {
        warnings.push(`пользователь ${user._id} без email — пропущен`);
        stats.skipped += 1;
        continue;
      }
      const email = user.email.trim().toLowerCase();
      const data = {
        username: email,
        email,
        provider: 'local',
        confirmed: true,
        blocked: false,
        role: authenticatedRole.id,
        name: user.name ? user.name.trim() : null,
        surname: user.surname ? user.surname.trim() : null,
        birthday: user.birthday || null,
        sex: user.sex || null,
        country: user.country || null,
        city: user.city || null,
        phone: user.phone || null,
        programm: user.programm || null,
        programmSelected: !!user.programmSelected,
        dateCourse: user.dateCourse || null,
        price: user.price || null,
        globalStep: user.globalStep ?? 0,
        stepQuestionare: user.stepQuestionare ?? 1,
        numberProfil: user.numberProfil ?? null,
        confirm: !!user.confirm,
      };

      const existing = await app.documents(USER_UID).findMany({ filters: { email }, limit: 1 });

      if (args.dry) {
        console.log(`  ${existing[0] ? '=' : '+'} user ${email} (dry)`);
        stats[existing[0] ? 'usersUpdated' : 'usersCreated'] += 1;
        continue;
      }

      let doc;
      if (existing[0]) {
        // пароль не перезаписываем: у существующего пользователя он уже хеширован
        doc = await app.documents(USER_UID).update({ documentId: existing[0].documentId, data });
        stats.usersUpdated += 1;
      } else {
        doc = await app.documents(USER_UID).create({ data: { ...data, password: user.password } });
        stats.usersCreated += 1;
      }
      mongoIdToDocumentId.set(user._id, doc.documentId);
      console.log(`  ${existing[0] ? '=' : '+'} user ${email}`);
    }

    for (const question of questions) {
      const userDocumentId = mongoIdToDocumentId.get(question.userId);
      if (!userDocumentId && !args.dry) {
        warnings.push(`анкета ${question._id}: пользователь ${question.userId} не найден — пропущена`);
        stats.skipped += 1;
        continue;
      }

      const data = {
        step1: question['step-1'] || null,
        step2: question['step-2'] || null,
        step3: question['step-3'] || null,
        step4: question['step-4'] || null,
        step5: question['step-5'] || null,
        step6: question['step-6'] || null,
        user: userDocumentId,
      };
      const filled = [1, 2, 3, 4, 5, 6].filter((n) => isFilled(question[`step-${n}`])).length;

      if (args.dry) {
        console.log(`  + questionnaire для ${question.userId} (заполнено шагов: ${filled}) (dry)`);
        stats.quizCreated += 1;
        continue;
      }

      const existing = await app.documents(QUESTIONNAIRE_UID).findMany({
        filters: { user: { documentId: userDocumentId } },
        limit: 1,
      });

      if (existing[0]) {
        await app.documents(QUESTIONNAIRE_UID).update({ documentId: existing[0].documentId, data });
        stats.quizUpdated += 1;
        console.log(`  = questionnaire (шагов заполнено: ${filled})`);
      } else {
        await app.documents(QUESTIONNAIRE_UID).create({ data });
        stats.quizCreated += 1;
        console.log(`  + questionnaire (шагов заполнено: ${filled})`);
      }
    }

    console.log('\n=== Итог ===');
    console.log(`  пользователи: создано ${stats.usersCreated}, обновлено ${stats.usersUpdated}`);
    console.log(`  анкеты: создано ${stats.quizCreated}, обновлено ${stats.quizUpdated}`);
    if (stats.skipped) console.log(`  пропущено: ${stats.skipped}`);
    if (warnings.length) {
      console.log('\nПредупреждения:');
      for (const warning of warnings) console.log(`  - ${warning}`);
    }
  } finally {
    // на postgres пул иногда отваливается с "aborted" уже после всей работы —
    // это не должно ронять успешную миграцию
    await app.destroy().catch((error) => console.warn(`(destroy: ${error.message})`));
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
