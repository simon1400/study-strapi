/**
 * Личный кабинет (этап 5).
 *
 * Штатный `/api/auth/local/register` принимает только username/email/password
 * (остальные ключи он отбивает как «Invalid parameters»), а анкету и профиль
 * при регистрации всё равно надо заводить одной транзакцией — поэтому свой API.
 *
 * Права выдаёт `scripts/setup-permissions.js`:
 *   public        — account.register
 *   authenticated — account.me / updateMe / getQuestionnaire / updateQuestionnaire
 */
export default {
  routes: [
    { method: 'POST', path: '/account/register', handler: 'account.register' },
    { method: 'GET', path: '/account/me', handler: 'account.me' },
    { method: 'PUT', path: '/account/me', handler: 'account.updateMe' },
    { method: 'GET', path: '/account/questionnaire', handler: 'account.getQuestionnaire' },
    { method: 'PUT', path: '/account/questionnaire', handler: 'account.updateQuestionnaire' },
  ],
};
