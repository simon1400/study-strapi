import { callRequestMail, sendMail } from '../../../../utils/mail';

/**
 * Заявка на звонок с сайта: письмо админу сразу после создания записи.
 * Раньше фронт дёргал две лямбды подряд (`callCreate` + `sendAdminCall`) —
 * теперь достаточно одной записи, письмо уходит здесь.
 */
export default {
  async afterCreate(event: { result: { name?: string; phone?: string; time?: string } }) {
    const { name, phone, time } = event.result;
    if (!name || !phone) return;
    await sendMail(strapi, callRequestMail(name, phone, time));
  },
};
