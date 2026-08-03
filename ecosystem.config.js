module.exports = {
  apps: [
    {
      name: 'studycz-strapi',
      script: 'npm',
      args: 'start',
      cwd: '/opt/studycz-strapi',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // порт выбран из свободных 13xx на сервере; перед первым запуском проверить `ss -tlnp`
        PORT: 1341,
      },
      error_file: '/var/log/pm2/studycz-strapi-error.log',
      out_file: '/var/log/pm2/studycz-strapi-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
