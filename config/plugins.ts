import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedExecutableTypes = [
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      /**
       * Сессию личного кабинета держит Next.js: JWT лежит в httpOnly secure
       * куке на studycz.cz, браузер со Strapi напрямую не разговаривает.
       * Поэтому режим refresh-токенов не нужен — с ним access живёт 10 минут,
       * а ротацию пришлось бы делать в middleware (и ловить гонки при
       * параллельных запросах). `legacy-support` отдаёт обычный JWT на 30 дней.
       */
      jwtManagement: 'legacy-support',
      jwt: {
        expiresIn: '30d',
      },
    },
  },
  /**
   * Почта — Resend по SMTP (host smtp.resend.com, логин всегда `resend`,
   * пароль — API-ключ). Отсюда уходят письмо с паролем после регистрации,
   * уведомления админу и штатное восстановление пароля users-permissions.
   *
   * Порт **2465**, а не привычный 465: Hetzner режет исходящие 25 и 465,
   * и соединение просто виснет до таймаута nginx. У Resend 2465 — тот же
   * implicit TLS, только на открытом порту (ещё открыты 587 и 2587).
   *
   * Таймауты обязательны: без них зависший SMTP держит http-запрос до упора,
   * и регистрация отваливается 504-й вместо того, чтобы пройти без письма.
   *
   * Без ключа блок не подключается вовсе и Strapi остаётся на дефолтном
   * sendmail: локальная разработка не должна требовать доступа к Resend.
   */
  ...(env('RESEND_API_KEY', '')
    ? {
        email: {
          config: {
            provider: 'nodemailer',
            providerOptions: {
              host: env('SMTP_HOST', 'smtp.resend.com'),
              port: env.int('SMTP_PORT', 2465),
              secure: env.bool('SMTP_SECURE', true),
              auth: {
                user: env('SMTP_USER', 'resend'),
                pass: env('RESEND_API_KEY'),
              },
              connectionTimeout: 8000,
              greetingTimeout: 8000,
              socketTimeout: 12000,
            },
            settings: {
              defaultFrom: env('MAIL_FROM', 'Study in the Czech Republic <noreply@studycz.cz>'),
              defaultReplyTo: env('MAIL_REPLY_TO', 'info@studycz.cz'),
            },
          },
        },
      }
    : {}),
  upload: {
    config: {
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes: deniedExecutableTypes,
      },
    },
  },
  imagekit: {
    // включается только когда заданы ключи (локальная разработка работает без ImageKit)
    enabled: env('IMAGEKIT_PRIVATE_KEY', '') !== '',
    config: {
      publicKey: env('IMAGEKIT_PUBLIC_KEY'),
      privateKey: env('IMAGEKIT_PRIVATE_KEY'),
      urlEndpoint: env('IMAGEKIT_URL_ENDPOINT'),
      uploadEnabled: true,
      useTransformUrls: true,
    },
  },
});

export default config;
