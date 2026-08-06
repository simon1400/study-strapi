'use strict';

/**
 * Email-провайдер Resend через HTTP API (https://api.resend.com/emails).
 *
 * Почему не SMTP (smtp.resend.com): SMTP-приём Resend портит quoted-printable —
 * литеральный `=` в теле письма съедается вместе с двумя hex-символами после него.
 * Ссылка восстановления пароля `/reset-password?code=<128 hex>` приходила как
 * `?code<мусор>` с токеном без первых двух символов, и сброс не работал.
 * HTTP API принимает JSON и собирает MIME на стороне Resend — класс проблем
 * с транспортным кодированием исчезает целиком (заодно и костыль с портом 2465:
 * Hetzner режет исходящие 25/465).
 *
 * Никаких зависимостей: fetch встроен в Node 18+.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Resend ждёт массив адресов; Strapi может прислать строку. */
const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : undefined);

/**
 * Обход бага конвейера Resend (воспроизводится и через их HTTP API):
 * HTML-часть письма помечается quoted-printable, но литеральный `=` не
 * экранируется, и получатель декодирует `=XX` (XX — hex-пара) в один байт.
 * Реальный кейс: ссылка `/reset-password?code=<hex-токен>` приходила с битым
 * токеном без первых двух символов. Текстовая часть письма не страдает.
 *
 * Меняем только опасные `=` (за которыми ровно две hex-цифры) на entity
 * `&#61;` — рендер у получателя не меняется, а байта `=` на проводе нет.
 * ВАЖНО: атрибуты в HTML писем всегда квотировать (`width="600"`,
 * не `width=600`) — незаквотированное hex-значение попадёт под замену.
 */
const escapeQpLandmines = (html) => html.replace(/=(?=[0-9a-fA-F]{2})/g, '&#61;');

module.exports = {
  init(providerOptions = {}, settings = {}) {
    const apiKey = providerOptions.apiKey;
    if (!apiKey) {
      throw new Error('email-resend: providerOptions.apiKey обязателен');
    }
    const timeoutMs = providerOptions.timeoutMs ?? 15000;

    return {
      async send(options) {
        const { from, to, cc, bcc, replyTo, subject, text, html } = options;

        const payload = {
          from: from || settings.defaultFrom,
          to: toArray(to),
          subject,
          ...(text ? { text } : {}),
          ...(html ? { html: escapeQpLandmines(html) } : {}),
          ...(toArray(cc) ? { cc: toArray(cc) } : {}),
          ...(toArray(bcc) ? { bcc: toArray(bcc) } : {}),
          ...(replyTo || settings.defaultReplyTo
            ? { reply_to: toArray(replyTo || settings.defaultReplyTo) }
            : {}),
        };

        const res = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`email-resend: Resend API ответил ${res.status}: ${await res.text()}`);
        }
      },
    };
  },
};
