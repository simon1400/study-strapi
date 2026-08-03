import type { Core } from '@strapi/strapi';

// Локали проекта: ru — базовая, весь старый контент импортируется в неё.
// Чешский в Strapi — ISO-код `cs` (в URL фронта может маппиться на /cz).
const LOCALES: Array<{ code: string; name: string }> = [
  { code: 'ru', name: 'Русский (ru)' },
  { code: 'uk', name: 'Українська (uk)' },
  { code: 'cs', name: 'Čeština (cs)' },
  { code: 'en', name: 'English (en)' },
];

const DEFAULT_LOCALE = 'ru';

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const localesService = strapi.plugin('i18n').service('locales');
    const existing: Array<{ code: string }> = await localesService.find();
    const existingCodes = new Set(existing.map((l) => l.code));

    for (const locale of LOCALES) {
      if (!existingCodes.has(locale.code)) {
        await localesService.create(locale);
        strapi.log.info(`i18n: created locale ${locale.code}`);
      }
    }

    const store = strapi.store({ type: 'plugin', name: 'i18n' });
    const current = await store.get({ key: 'default_locale' });
    if (current !== DEFAULT_LOCALE) {
      await store.set({ key: 'default_locale', value: DEFAULT_LOCALE });
      strapi.log.info(`i18n: default locale set to ${DEFAULT_LOCALE}`);
    }
  },
};
