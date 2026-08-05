#!/usr/bin/env node
'use strict';

/**
 * Миграция контента Sanity -> Strapi.
 *
 *   node scripts/migrate-sanity.js [--file <export.ndjson>] [--dry] [--skip-images] [--only=uid,uid]
 *
 * Скрипт идемпотентен: документы ищутся по естественному ключу (slug/title/location),
 * картинки — по детерминированному имени файла в Media Library. Повторный прогон
 * обновляет уже созданное, а не плодит дубли.
 *
 * Весь старый контент заливается в локаль ru (базовую).
 */

const fs = require('fs');
const path = require('path');

const { bootStrapi } = require('./lib/strapi-app');
const { MediaUploader } = require('./lib/media');
const { portableTextToHtml } = require('./lib/portable-text');

const LOCALE = 'ru';

// ---------------------------------------------------------------- аргументы

function parseArgs(argv) {
  const args = { dry: false, skipImages: false, only: null, file: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry' || arg === '--dry-run') args.dry = true;
    else if (arg === '--skip-images') args.skipImages = true;
    else if (arg.startsWith('--only=')) args.only = arg.slice(7).split(',').map((s) => s.trim());
    else if (arg.startsWith('--file=')) args.file = arg.slice(7);
    else if (arg === '--file') args.file = argv[argv.indexOf(arg) + 1];
  }
  return args;
}

function findExportFile(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.SANITY_EXPORT) return path.resolve(process.env.SANITY_EXPORT);

  const dirs = [
    path.resolve(__dirname, '..', 'migration-data'),
    path.resolve(__dirname, '..', '..', 'studycz', 'migration-data'),
    '/root/migration-data',
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const match = fs
      .readdirSync(dir)
      .filter((f) => /^sanity-export.*\.ndjson$/i.test(f))
      .sort()
      .pop();
    if (match) return path.join(dir, match);
  }
  throw new Error(
    'не найден ndjson-экспорт Sanity: укажите --file <путь> или переменную SANITY_EXPORT'
  );
}

// ------------------------------------------------------------ данные Sanity

function loadExport(file) {
  const docs = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  const assets = new Map();
  const byType = new Map();
  for (const doc of docs) {
    if (doc._type === 'sanity.imageAsset') {
      assets.set(doc._id, doc);
      continue;
    }
    if (!byType.has(doc._type)) byType.set(doc._type, []);
    byType.get(doc._type).push(doc);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a._id.localeCompare(b._id));
  }
  return { assets, byType, total: docs.length };
}

// --------------------------------------------------------- мелкие хелперы

const textItems = (values) =>
  (values || []).filter((v) => v !== null && v !== undefined && `${v}`.trim() !== '').map((text) => ({ text }));

const slugOf = (doc) => (typeof doc.url === 'string' ? doc.url : doc.url && doc.url.current) || null;

// ------------------------------------------------------------ upsert-слой

class Migrator {
  constructor(app, { dry, media, log, assets }) {
    this.app = app;
    this.dry = dry;
    this.media = media;
    this.log = log;
    this.assets = assets;
    this.warnings = [];
    this.stats = {};
    this.sanityToDocument = new Map(); // sanity _id -> strapi documentId
  }

  warn(message) {
    this.warnings.push(message);
  }

  count(uid, kind) {
    this.stats[uid] = this.stats[uid] || { created: 0, updated: 0 };
    this.stats[uid][kind] += 1;
  }

  html(blocks, context) {
    return portableTextToHtml(blocks, (message) => this.warn(`${context}: ${message}`));
  }

  /** картинка Sanity ({asset:{_ref}}) -> id файла в Strapi */
  async image(imageField, context) {
    const ref = imageField && imageField.asset && imageField.asset._ref;
    if (!ref) return null;
    const asset = this.assets.get(ref);
    if (!asset) {
      this.warn(`${context}: asset ${ref} отсутствует в экспорте`);
      return null;
    }
    return this.media.ensure(asset);
  }

  async gallery(list, context) {
    const ids = [];
    for (const item of list || []) {
      const id = await this.image(item, context);
      if (id) ids.push(id);
    }
    return ids;
  }

  async upsert(uid, { where, data, dp = true, single = false, sanityId = null, label = '' }) {
    const docs = this.app.documents(uid);
    const query = { locale: LOCALE };
    if (dp) query.status = 'draft';

    let existing;
    if (single) {
      existing = await docs.findFirst(query);
    } else {
      const found = await docs.findMany({ ...query, filters: where, limit: 1 });
      existing = found[0];
    }

    if (this.dry) {
      this.count(uid, existing ? 'updated' : 'created');
      this.log(`    ${existing ? '=' : '+'} ${uid} ${label} (dry)`);
      return existing ? existing.documentId : null;
    }

    const payload = { data, locale: LOCALE };
    if (dp) payload.status = 'published';

    const doc = existing
      ? await docs.update({ documentId: existing.documentId, ...payload })
      : await docs.create(payload);

    this.count(uid, existing ? 'updated' : 'created');
    if (sanityId) this.sanityToDocument.set(sanityId, doc.documentId);
    this.log(`    ${existing ? '=' : '+'} ${uid} ${label}`);
    return doc.documentId;
  }

  cityRef(doc) {
    const ref = doc.city && doc.city._ref;
    if (!ref) return null;
    const documentId = this.sanityToDocument.get(ref);
    if (!documentId && !this.dry) this.warn(`${doc._type}/${doc._id}: город ${ref} не найден`);
    return documentId || null;
  }
}

// --------------------------------------------------------------- маппинги

async function migrateCities(m, docs) {
  for (const doc of docs) {
    await m.upsert('api::city.city', {
      where: { title: doc.title },
      data: { title: doc.title },
      dp: false,
      sanityId: doc._id,
      label: doc.title,
    });
  }
}

async function migrateUniversities(m, docs) {
  for (const doc of docs) {
    const uf = doc.university_faculty || {};
    await m.upsert('api::university.university', {
      where: { slug: slugOf(doc) },
      sanityId: doc._id,
      label: doc.title,
      data: {
        title: doc.title,
        slug: slugOf(doc),
        order: doc.order ?? 0,
        shortContent: doc.shortContent || null,
        content: m.html(doc.content, `university/${slugOf(doc)}`),
        image: await m.image(doc.image, `university/${slugOf(doc)}`),
        galery: await m.gallery(doc.galery, `university/${slugOf(doc)}`),
        facultyTitle: uf.title || null,
        facultyImage: await m.image(uf.image, `university/${slugOf(doc)}/faculty`),
        faculties: (uf.faculties || []).map((f) => ({
          title: f.title,
          specializations: textItems(f.specializations),
        })),
        city: m.cityRef(doc),
      },
    });
  }
}

async function migratePrograms(m, docs) {
  for (const doc of docs) {
    const include = doc.includeProgram || {};
    await m.upsert('api::program.program', {
      where: { slug: slugOf(doc) },
      sanityId: doc._id,
      label: doc.title,
      data: {
        title: doc.title,
        slug: slugOf(doc),
        order: doc.order ?? 0,
        price: doc.price || null,
        period: doc.period ? { from: doc.period.from || null, to: doc.period.to || null } : null,
        shortContent: doc.shortContent || null,
        content: m.html(doc.content, `program/${slugOf(doc)}`),
        include: (doc.include || []).map((i) => ({ title: i.title, name: i.name })),
        includeBefore: textItems(include.before),
        includeAfter: textItems(include.after),
        includeAdditional: textItems(include.additional),
        notInclude: textItems(doc.notIncludeProgram && doc.notIncludeProgram.notInclude),
        options: doc.options || [],
        city: m.cityRef(doc),
      },
    });
  }
}

async function migrateLivings(m, docs) {
  for (const doc of docs) {
    await m.upsert('api::living.living', {
      where: { slug: slugOf(doc) },
      sanityId: doc._id,
      label: doc.title,
      data: {
        title: doc.title,
        slug: slugOf(doc),
        order: doc.order ?? 0,
        price: doc.price || null,
        shortContent: doc.shortContent || null,
        content: m.html(doc.content, `living/${slugOf(doc)}`),
        benefits: textItems(doc.benefits),
        detailedPrices: textItems(doc.detailedPrices),
        image: await m.image(doc.image, `living/${slugOf(doc)}`),
        galery: await m.gallery(doc.galery, `living/${slugOf(doc)}`),
        city: m.cityRef(doc),
      },
    });
  }
}

async function migrateArticles(m, docs) {
  for (const doc of docs) {
    await m.upsert('api::article.article', {
      where: { slug: slugOf(doc) },
      sanityId: doc._id,
      label: doc.title,
      data: {
        title: doc.title,
        slug: slugOf(doc),
        order: doc.order ?? 0,
        shortContent: doc.shortContent || null,
        content: m.html(doc.content, `blog/${slugOf(doc)}`),
        image: await m.image(doc.image, `blog/${slugOf(doc)}`),
        showOnBlog: (doc.articleOption || []).includes('show_on_blog'),
      },
    });
  }
}

async function migratePartners(m, docs) {
  for (const doc of docs) {
    await m.upsert('api::partner.partner', {
      where: { title: doc.title },
      sanityId: doc._id,
      label: doc.title,
      data: {
        title: doc.title,
        url: typeof doc.url === 'string' ? doc.url : null,
        order: doc.order ?? 0,
        content: m.html(doc.content, `partner/${doc.title}`),
        image: await m.image(doc.image, `partner/${doc.title}`),
      },
    });
  }
}

async function migrateBranches(m, docs) {
  for (const doc of docs) {
    // у филиалов нет slug, а title не уникален (6 из 9 — «Украине»),
    // поэтому естественный ключ — пара title + order
    await m.upsert('api::branch.branch', {
      where: { title: doc.title, order: doc.order ?? 0 },
      sanityId: doc._id,
      label: doc.title,
      data: {
        title: doc.title,
        order: doc.order ?? 0,
        flag: await m.image(doc.flag, `branch/${doc.title}`),
        contactInformations: (doc.contactInformations || []).map((item) => ({
          type: item.typeContact || null,
          value: m.html(item.valueContact, `branch/${doc.title}/${item.typeContact}`),
        })),
      },
    });
  }
}

async function migrateMenus(m, docs) {
  for (const doc of docs) {
    await m.upsert('api::menu.menu', {
      where: { location: doc.location },
      dp: false,
      sanityId: doc._id,
      label: `${doc.location} (${doc.title})`,
      data: {
        title: doc.title || null,
        location: doc.location,
        items: (doc.items || []).map((item) => ({ title: item.title, url: item.menuUrl })),
      },
    });
  }
}

async function migrateFaq(m, docs) {
  const source = docs.find((d) => (d.faqs || []).some((f) => f.question)) || docs[0];
  if (!source) return;
  let order = 0;
  for (const item of source.faqs || []) {
    const question = item.question || item.question_head;
    if (!question) continue;
    await m.upsert('api::faq-item.faq-item', {
      where: { question },
      label: question.slice(0, 60),
      data: {
        question,
        answer: m.html(item.ask, `faq/${question.slice(0, 30)}`),
        order: (order += 1),
      },
    });
  }
}

async function migrateServices(m, docs) {
  const source = docs[0];
  if (!source) return;
  let order = 0;
  for (const item of source.service || []) {
    const title = item.name || item.title;
    if (!title) continue;
    await m.upsert('api::service.service', {
      where: { title },
      label: title,
      data: {
        title,
        description: m.html(item.description, `service/${title}`),
        order: (order += 1),
      },
    });
  }
}

async function migrateGlobal(m, docs) {
  const doc = docs[0];
  if (!doc) return;
  await m.upsert('api::global.global', {
    single: true,
    dp: false,
    label: doc.title,
    data: {
      title: doc.title,
      description: doc.description || null,
      contacts: doc.contacts
        ? { email: doc.contacts.email || null, phone: doc.contacts.phone || null }
        : null,
      socLinks: doc.socLinks
        ? {
            facebook: doc.socLinks.facebook || null,
            instagram: doc.socLinks.instagram || null,
            vkontakte: doc.socLinks.vkontakte || null,
          }
        : null,
    },
  });
}

async function migrateContactsPage(m, docs) {
  const doc = docs[0];
  if (!doc) return;
  const peoples = [];
  for (const person of doc.peoples || []) {
    peoples.push({
      name: person.name,
      position: person.position || null,
      email: person.email || null,
      phone: person.phone || null,
      image: await m.image(person.image, `contacts/${person.name}`),
    });
  }
  await m.upsert('api::contacts-page.contacts-page', {
    single: true,
    label: 'contacts',
    data: {
      address: doc.address || null,
      email: doc.email || null,
      phone: doc.phone || null,
      skype: doc.skype || null,
      peoples,
    },
  });
}

async function migrateHomepage(m, docs) {
  const doc = docs[0];
  if (!doc) return;
  const ourServices = [];
  for (const service of doc.ourServices || []) {
    ourServices.push({
      title: service.title || null,
      content: service.content || null,
      url: service.url || null,
      image: await m.image(service.image, `homepage/service/${service.title}`),
    });
  }
  await m.upsert('api::homepage.homepage', {
    single: true,
    label: doc.title,
    data: {
      title: doc.title,
      description: doc.description || null,
      homepageSteps: (doc.homepageSteps || []).map((step) => ({
        title: step.title,
        content: step.content || null,
      })),
      ourServices,
      contactInfo: doc.contactInfo
        ? {
            title: doc.contactInfo.title || null,
            content: m.html(doc.contactInfo.content, 'homepage/contactInfo'),
            append: doc.contactInfo.append || null,
          }
        : null,
    },
  });
}

// порядок важен: города создаются первыми, на них ссылаются остальные типы
const PIPELINE = [
  { uid: 'api::city.city', sanityType: 'city', run: migrateCities },
  { uid: 'api::university.university', sanityType: 'university', run: migrateUniversities },
  { uid: 'api::program.program', sanityType: 'programs', run: migratePrograms },
  { uid: 'api::living.living', sanityType: 'living', run: migrateLivings },
  { uid: 'api::article.article', sanityType: 'blog', run: migrateArticles },
  { uid: 'api::partner.partner', sanityType: 'partners', run: migratePartners },
  { uid: 'api::branch.branch', sanityType: 'filials', run: migrateBranches },
  { uid: 'api::menu.menu', sanityType: 'menu', run: migrateMenus },
  { uid: 'api::faq-item.faq-item', sanityType: 'faq', run: migrateFaq },
  { uid: 'api::service.service', sanityType: 'additionalServices', run: migrateServices },
  { uid: 'api::global.global', sanityType: 'global', run: migrateGlobal },
  { uid: 'api::contacts-page.contacts-page', sanityType: 'contacts', run: migrateContactsPage },
  { uid: 'api::homepage.homepage', sanityType: 'homepage', run: migrateHomepage },
];

// ------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv);
  const file = findExportFile(args.file);
  const log = (message) => console.log(message);

  log(`Sanity-экспорт: ${file}`);
  const { assets, byType, total } = loadExport(file);
  log(`  документов: ${total}, картинок-ассетов: ${assets.size}`);
  if (args.dry) log('  режим --dry: ничего не записывается');

  const app = await bootStrapi();
  const media = new MediaUploader(app, { dryRun: args.dry, skipImages: args.skipImages, log });
  const migrator = new Migrator(app, { dry: args.dry, media, log, assets });

  try {
    for (const step of PIPELINE) {
      if (args.only && !args.only.includes(step.uid) && !args.only.includes(step.sanityType)) continue;
      const docs = byType.get(step.sanityType) || [];
      if (!docs.length) {
        log(`\n${step.sanityType} -> ${step.uid}: нет документов`);
        continue;
      }
      log(`\n${step.sanityType} -> ${step.uid}: ${docs.length} док.`);
      await step.run(migrator, docs);
    }

    // Тип `question` в Sanity — тестовый дубль faq с мусорным содержимым, не переносим.
    const junk = byType.get('question');
    if (junk) log(`\nпропущен sanity-тип "question" (${junk.length} док.) — тестовые данные`);

    log('\n=== Итог ===');
    for (const [uid, s] of Object.entries(migrator.stats)) {
      log(`  ${uid}: создано ${s.created}, обновлено ${s.updated}`);
    }
    log(
      `  media: залито ${media.stats.uploaded}, переиспользовано ${media.stats.reused}, ошибок ${media.stats.failed}`
    );
    if (migrator.warnings.length) {
      log(`\nПредупреждения (${migrator.warnings.length}):`);
      for (const warning of migrator.warnings.slice(0, 40)) log(`  - ${warning}`);
      if (migrator.warnings.length > 40) log(`  ... ещё ${migrator.warnings.length - 40}`);
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
