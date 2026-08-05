import crypto from 'crypto';
import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ApplicationError, ValidationError } = errors;

const USER_UID = 'plugin::users-permissions.user';
const QUESTIONNAIRE_UID = 'api::questionnaire.questionnaire';

/** Поля профиля из формы регистрации (старая модалка `components/modals/registration`). */
const REGISTER_FIELDS = ['name', 'surname', 'birthday', 'sex', 'country', 'city', 'phone'] as const;

/** Что пользователю позволено менять у себя — выбор программы в ЛК, и только он. */
const PROGRAM_FIELDS = ['programm', 'price', 'dateCourse'] as const;

/** Поля пользователя, которые уезжают на фронт. Пароль и токены сюда не попадают. */
const PUBLIC_USER_FIELDS = [
  'id',
  'documentId',
  'email',
  'name',
  'surname',
  'birthday',
  'sex',
  'country',
  'city',
  'phone',
  'programm',
  'programmSelected',
  'dateCourse',
  'price',
  'globalStep',
  'stepQuestionare',
  'numberProfil',
  'confirm',
] as const;

const NOT_SELECTED = 'Не выбрано';

/** Минимум от koa-контекста, который нужен этому контроллеру. */
type Ctx = {
  request: { body?: unknown };
  state: { user?: { id: number; documentId: string; globalStep?: number; stepQuestionare?: number } };
  body?: unknown;
  unauthorized: (message?: string) => unknown;
};

const emptyDate = () => ({ day: '', month: '', year: '' });
const emptyPeriod = () => ({ od: '', do: '' });

/**
 * Пустая анкета в том же виде, в каком её создавал mongoose-дефолтами старый
 * `userCreate.js`: шаги — плоские json-объекты, ключи 1:1 со старыми формами.
 */
const emptySteps = () => ({
  step1: {
    name: '',
    surname: '',
    sex: '',
    dateBirth: emptyDate(),
    status: '',
    country: '',
    city: '',
    citizenshipBirth: '',
    citizenship: '',
  },
  step2: {
    name: '',
    surname: '',
    passport: '',
    country: '',
    authority: '',
    datePassport: emptyDate(),
    valid: emptyDate(),
    waivers: false,
    yearWaivers: '',
    countryWaivers: '',
    typeVisa: '',
    reason: '',
  },
  step3: {
    nameFather: '',
    surnameFather: '',
    dateBirthFather: emptyDate(),
    citizenshipFather: '',
    addressFather: '',
    professionFather: '',
    nameMother: '',
    surnameMother: '',
    dateBirthMother: emptyDate(),
    citizenshipMother: '',
    addressMother: '',
    professionMother: '',
    countBrother: 0,
    countSister: 0,
    brothers: [],
    sisters: [],
  },
  step4: {
    nowStatus: '',
    educationalInstitution: '',
    adrress: '',
    phone: '',
    code: '',
    period: emptyPeriod(),
    countCollege: 0,
    countUniversity: 0,
    college: [],
    university: [],
  },
  step5: {
    countryRegistration: '',
    cityRegistration: '',
    addressRegistration: '',
    codeRegistration: '',
    countryLiving: '',
    cityLiving: '',
    addressLiving: '',
    codeLiving: '',
    telContact: '',
    phoneContact: '',
    phoneParentContact: '',
    emailContact: '',
    skypeContact: '',
  },
  step6: {
    dateEntry: emptyDate(),
    timeEntry: '',
    cityEntry: '',
    typeTransport: '',
    number: '',
    nameCompany: '',
  },
});

/** Пароль вида `scz_xxxxxxx` — тот же формат, что генерировала старая модалка регистрации. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(7);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `scz_${out}`;
}

/** Пятизначный номер анкеты — как `makeid(5)` в старой mongoose-модели пользователя. */
function generateNumberProfil(): number {
  return 10000 + (crypto.randomBytes(4).readUInt32BE(0) % 90000);
}

function pickPublicUser(user: Record<string, unknown> | null) {
  if (!user) return null;
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC_USER_FIELDS) out[field] = user[field] ?? null;
  return out;
}

/** Тот же токен, что отдаёт `POST /api/auth/local` (режим legacy-support, 30 дней). */
async function issueJwt(strapi: Core.Strapi, userId: number | string): Promise<string> {
  return strapi.plugin('users-permissions').service('jwt').issue({ id: userId });
}

/** Анкета текущего пользователя; заводится на лету, если её ещё нет. */
async function findOrCreateQuestionnaire(strapi: Core.Strapi, userId: number) {
  const [existing] = await strapi.documents(QUESTIONNAIRE_UID).findMany({
    filters: { user: { id: userId } },
    limit: 1,
  });
  if (existing) return existing;

  return strapi.documents(QUESTIONNAIRE_UID).create({
    data: { ...emptySteps(), user: userId },
  });
}

export default {
  /**
   * Регистрация из модалки «Заполнить анкету»: пользователь + пустая анкета + JWT.
   * Пароль генерируем сами (как на старом сайте) и возвращаем ровно один раз —
   * письмо с ним уходит на этапе 6 (Resend).
   */
  async register(ctx: Ctx) {
    const body = (ctx.request.body ?? {}) as Record<string, string>;

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError('Некорректный email', { field: 'email' });
    }

    const profile: Record<string, string> = {};
    const empty: string[] = [];
    for (const field of REGISTER_FIELDS) {
      const value = typeof body[field] === 'string' ? body[field].trim() : '';
      if (!value) empty.push(field);
      profile[field] = value;
    }
    if (empty.length) {
      throw new ValidationError('Заполнены не все поля', { empty });
    }

    const [existing] = await strapi.documents(USER_UID).findMany({ filters: { email }, limit: 1 });
    if (existing) {
      throw new ApplicationError('Пользователь с таким email уже существует', { field: 'email' });
    }

    const role = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' }, select: ['id'] });
    if (!role) throw new ApplicationError('Роль authenticated не найдена');

    const password = generatePassword();
    const user = await strapi.documents(USER_UID).create({
      data: {
        username: email,
        email,
        password,
        provider: 'local',
        confirmed: true,
        blocked: false,
        role: role.id,
        ...profile,
        programm: NOT_SELECTED,
        dateCourse: NOT_SELECTED,
        price: NOT_SELECTED,
        programmSelected: false,
        globalStep: 0,
        stepQuestionare: 1,
        numberProfil: generateNumberProfil(),
        confirm: false,
      },
    });

    await strapi.documents(QUESTIONNAIRE_UID).create({
      data: { ...emptySteps(), user: user.id },
    });

    ctx.body = {
      jwt: await issueJwt(strapi, user.id),
      user: pickPublicUser(user),
      // одноразово: письмо с паролем появится на этапе 6
      password,
    };
  },

  /** Текущий пользователь. Клиент дёргает это на каждый запрос ЛК — кеша нет. */
  async me(ctx: Ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const user = await strapi.documents(USER_UID).findOne({ documentId: ctx.state.user.documentId });
    if (!user) return ctx.unauthorized();
    ctx.body = { user: pickPublicUser(user) };
  },

  /**
   * Выбор программы обучения (модалка `#modal-select-program` в ЛК).
   * Всё остальное — служебные поля прогресса — считает сервер, клиент их не шлёт.
   */
  async updateMe(ctx: Ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const body = (ctx.request.body ?? {}) as Record<string, string>;

    const data: Record<string, unknown> = {};
    for (const field of PROGRAM_FIELDS) {
      const value = typeof body[field] === 'string' ? body[field].trim() : '';
      if (!value) throw new ValidationError('Не выбрана программа', { field });
      data[field] = value.slice(0, 200);
    }
    data.programmSelected = true;
    data.globalStep = Math.max(Number(ctx.state.user.globalStep ?? 0), 1);

    const user = await strapi.documents(USER_UID).update({
      documentId: ctx.state.user.documentId,
      data,
    });

    ctx.body = { user: pickPublicUser(user) };
  },

  async getQuestionnaire(ctx: Ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const questionnaire = await findOrCreateQuestionnaire(strapi, ctx.state.user.id);
    const user = await strapi.documents(USER_UID).findOne({ documentId: ctx.state.user.documentId });
    ctx.body = { user: pickPublicUser(user), questionnaire };
  },

  /**
   * Сохранение одного шага анкеты.
   *
   * Прогресс двигаем вперёд и никогда назад: старый `updateQuestion.js` при
   * правке уже заполненного шага откатывал `stepQuestionare` на номер этого шага
   * (правишь шаг 2 — теряешь 3 и 4). Здесь берётся максимум, потолок — 6,
   * как и раньше: шестой шаг остаётся редактируемым, а `globalStep` уходит в 2.
   */
  async updateQuestionnaire(ctx: Ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const body = (ctx.request.body ?? {}) as { step?: unknown; data?: unknown };

    const step = Number(body.step);
    if (!Number.isInteger(step) || step < 1 || step > 6) {
      throw new ValidationError('Шаг анкеты должен быть числом от 1 до 6', { step: body.step });
    }
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      throw new ValidationError('Данные шага должны быть объектом');
    }

    const current = await findOrCreateQuestionnaire(strapi, ctx.state.user.id);
    const questionnaire = await strapi.documents(QUESTIONNAIRE_UID).update({
      documentId: current.documentId,
      data: { [`step${step}`]: body.data },
    });

    const stepQuestionare = Math.min(
      6,
      Math.max(Number(ctx.state.user.stepQuestionare ?? 1), step + 1)
    );
    const globalStep = Math.max(Number(ctx.state.user.globalStep ?? 0), step === 6 ? 2 : 1);

    const user = await strapi.documents(USER_UID).update({
      documentId: ctx.state.user.documentId,
      data: { stepQuestionare, globalStep },
    });

    ctx.body = { user: pickPublicUser(user), questionnaire };
  },
};
