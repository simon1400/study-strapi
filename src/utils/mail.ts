/**
 * Транзакционные письма сайта.
 *
 * Раньше их слали Netlify-лямбды (`sendRegistration`, `sendAdminRegistration`,
 * `sendAdminCall`) через nodemailer + Gmail OAuth, а вёрстка лежала в
 * `src/lambda/mail_template/*.js` — простыни MJML на 400 строк ради одного
 * абзаца текста. Тексты перенесены дословно, разметка переписана на
 * компактную табличную (те же почтовики её понимают так же).
 *
 * Отправка всегда «мягкая»: письмо не должно ронять регистрацию или заявку.
 * Если ключа Resend нет (локальная разработка) или домен ещё не верифицирован,
 * в лог уходит предупреждение, а пользователь ошибки не видит.
 */

const SITE_URL = process.env.CLIENT_URL || 'https://studycz.cz';
const ADMIN_URL = process.env.MAIL_ADMIN || 'anketa@studycz.cz';
const SUPPORT_EMAIL = process.env.MAIL_REPLY_TO || 'info@studycz.cz';

type MailInput = { to: string; subject: string; text: string; html: string };

/** Общая рамка письма: шапка с названием, тело и подпись — как в старых шаблонах. */
function layout({ title, body, signature }: { title: string; body: string; signature: string }): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f2f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f5f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:4px;font-family:Arial,Helvetica,sans-serif;color:#333333;">
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;">Привет,</p>
              <h1 style="margin:0 0 24px 0;font-size:22px;line-height:30px;color:#0054b9;font-weight:bold;">${title}</h1>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px 32px;">
              <hr style="border:none;border-top:1px solid #e2e6e8;margin:24px 0;">
              <p style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:#777777;">
                Если вы не знаете, почему получили это письмо, просто игнорируйте его или напишите нам на
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#0054b9;">${SUPPORT_EMAIL}</a>.
              </p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#777777;">
                С уважением,<br>${signature}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const paragraph = (text: string) =>
  `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;">${text}</p>`;

/** Строка «Поле: значение» в письмах админу. */
const field = (label: string, value: string | null | undefined) =>
  `<p style="margin:0 0 8px 0;font-size:15px;line-height:22px;"><b>${label}:</b> ${value || '—'}</p>`;

/** Письмо человеку после регистрации — с паролем от личного кабинета. */
export function registrationMail(email: string, password: string): MailInput {
  return {
    to: email,
    subject: 'Регистрация',
    text: `Ваш пароль к личному кабинету — ${password}. Вход: ${SITE_URL}`,
    html: layout({
      title: 'Вы заполнили заявку на нашем сайте!',
      signature: 'команда Study in the Czech Republic',
      body: [
        paragraph('Ваш пароль к кабинету:'),
        `<p style="margin:0 0 24px 0;padding:12px 24px;background:#f2f5f7;border-radius:3px;font-size:18px;line-height:26px;font-family:Consolas,monaco,monospace;"><b>${password}</b></p>`,
        paragraph(
          `Войти в личный кабинет можно на <a href="${SITE_URL}" style="color:#0054b9;">${SITE_URL}</a>. Пароль потом можно сменить в кабинете.`
        ),
      ].join('\n'),
    }),
  };
}

type NewUser = {
  name?: string | null;
  surname?: string | null;
  birthday?: string | null;
  country?: string | null;
  city?: string | null;
  email: string;
  phone?: string | null;
};

/** Письмо админу о новом зарегистрированном пользователе. */
export function adminRegistrationMail(user: NewUser): MailInput {
  return {
    to: ADMIN_URL,
    subject: 'Регистрация',
    text: `Регистрация нового пользователя — ${user.email}`,
    html: layout({
      title: 'Новая регистрация на сайте!',
      signature: 'сайт Study in the Czech Republic',
      body: [
        paragraph(
          'На вашем сайте новый зарегистрированный пользователь! Пожалуйста, перейдите в администрацию и посмотрите всю информацию о пользователе.'
        ),
        field('Имя', user.name),
        field('Фамилия', user.surname),
        field('День рождения', user.birthday),
        field('Страна', user.country),
        field('Город', user.city),
        field('Е-мейл', user.email),
        field('Телефон', user.phone),
      ].join('\n'),
    }),
  };
}

/** Письмо админу о новой заявке на звонок. */
export function callRequestMail(name: string, phone: string, time?: string | null): MailInput {
  return {
    to: ADMIN_URL,
    subject: 'Заказ звонка',
    text: `Новый заказ звонка с сайта: ${name}, ${phone}`,
    html: layout({
      title: 'Новый заказ звонка!',
      signature: 'сайт Study in the Czech Republic',
      body: [
        paragraph(
          'На вашем сайте новый заказ звонка! Пожалуйста, перейдите в администрацию и посмотрите все последние заказанные звонки.'
        ),
        field('Имя', name),
        field('Телефон', phone),
        field('Время заявки', time),
      ].join('\n'),
    }),
  };
}

/**
 * Отправка, которая никогда не бросает наверх: письмо — побочный эффект,
 * из-за него не должна падать регистрация или заявка на звонок.
 */
export async function sendMail(strapi: { log: { info: (m: string) => void; warn: (m: string) => void }; plugin: (n: string) => { service: (s: string) => { send: (m: MailInput) => Promise<unknown> } } }, mail: MailInput): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    strapi.log.info(`[mail] пропущено «${mail.subject}» → ${mail.to}: RESEND_API_KEY не задан`);
    return false;
  }
  try {
    await strapi.plugin('email').service('email').send(mail);
    strapi.log.info(`[mail] отправлено «${mail.subject}» → ${mail.to}`);
    return true;
  } catch (error) {
    strapi.log.warn(`[mail] не отправлено «${mail.subject}» → ${mail.to}: ${(error as Error).message}`);
    return false;
  }
}
