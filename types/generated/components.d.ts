import type { Schema, Struct } from '@strapi/strapi';

export interface HomeContactInfo extends Struct.ComponentSchema {
  collectionName: 'components_home_contact_infos';
  info: {
    description: '\u0411\u043B\u043E\u043A \u00AB\u0445\u043E\u0442\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441\u00BB \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u043E\u0439';
    displayName: 'Contact block';
    icon: 'envelop';
  };
  attributes: {
    append: Schema.Attribute.Text;
    content: Schema.Attribute.RichText;
    title: Schema.Attribute.String;
  };
}

export interface HomeService extends Struct.ComponentSchema {
  collectionName: 'components_home_services';
  info: {
    description: '\u0411\u043B\u043E\u043A \u00AB\u043D\u0430\u0448\u0438 \u0443\u0441\u043B\u0443\u0433\u0438\u00BB \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u043E\u0439';
    displayName: 'Service';
    icon: 'briefcase';
  };
  attributes: {
    content: Schema.Attribute.Text;
    image: Schema.Attribute.Media<'images'>;
    title: Schema.Attribute.String;
    url: Schema.Attribute.String;
  };
}

export interface HomeStep extends Struct.ComponentSchema {
  collectionName: 'components_home_steps';
  info: {
    description: '\u0428\u0430\u0433 \u00AB\u043A\u0430\u043A \u044D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u00BB \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u043E\u0439';
    displayName: 'Step';
    icon: 'arrowRight';
  };
  attributes: {
    content: Schema.Attribute.Text;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedContactDetails extends Struct.ComponentSchema {
  collectionName: 'components_shared_contact_details';
  info: {
    description: 'Email + \u0442\u0435\u043B\u0435\u0444\u043E\u043D (global)';
    displayName: 'Contact details';
    icon: 'phone';
  };
  attributes: {
    email: Schema.Attribute.Email;
    phone: Schema.Attribute.String;
  };
}

export interface SharedContactInfo extends Struct.ComponentSchema {
  collectionName: 'components_shared_contact_infos';
  info: {
    description: '\u0411\u043B\u043E\u043A \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0430 \u0444\u0438\u043B\u0438\u0430\u043B\u0430: \u0442\u0438\u043F + \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 (richtext)';
    displayName: 'Contact info';
    icon: 'phone';
  };
  attributes: {
    type: Schema.Attribute.String;
    value: Schema.Attribute.RichText;
  };
}

export interface SharedFaculty extends Struct.ComponentSchema {
  collectionName: 'components_shared_faculties';
  info: {
    description: '\u0424\u0430\u043A\u0443\u043B\u044C\u0442\u0435\u0442 \u0443\u043D\u0438\u0432\u0435\u0440\u0441\u0438\u0442\u0435\u0442\u0430 + \u0441\u043F\u0438\u0441\u043E\u043A \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u0435\u0439';
    displayName: 'Faculty';
    icon: 'book';
  };
  attributes: {
    specializations: Schema.Attribute.Component<'shared.text-item', true>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedMenuLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_menu_links';
  info: {
    description: '\u041F\u0443\u043D\u043A\u0442 \u043C\u0435\u043D\u044E';
    displayName: 'Menu link';
    icon: 'link';
  };
  attributes: {
    title: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedParametr extends Struct.ComponentSchema {
  collectionName: 'components_shared_parametrs';
  info: {
    description: '\u041F\u0430\u0440\u0430 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435/\u043F\u043E\u0434\u043F\u0438\u0441\u044C (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 \u00AB560 \u0447\u0430\u0441\u043E\u0432\u00BB / \u00AB\u0447\u0435\u0448\u0441\u043A\u043E\u0433\u043E \u044F\u0437\u044B\u043A\u0430\u00BB)';
    displayName: 'Parametr';
    icon: 'layer';
  };
  attributes: {
    name: Schema.Attribute.String;
    title: Schema.Attribute.String;
  };
}

export interface SharedPeriod extends Struct.ComponentSchema {
  collectionName: 'components_shared_periods';
  info: {
    description: '\u041F\u0435\u0440\u0438\u043E\u0434 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B (\u0434\u0430\u0442\u044B \u043A\u0430\u043A \u0441\u0442\u0440\u043E\u043A\u0438, 1:1 \u0441\u043E \u0441\u0442\u0430\u0440\u044B\u043C \u0441\u0430\u0439\u0442\u043E\u043C)';
    displayName: 'Period';
    icon: 'calendar';
  };
  attributes: {
    from: Schema.Attribute.String;
    to: Schema.Attribute.String;
  };
}

export interface SharedPerson extends Struct.ComponentSchema {
  collectionName: 'components_shared_people';
  info: {
    description: '\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u0432';
    displayName: 'Person';
    icon: 'user';
  };
  attributes: {
    email: Schema.Attribute.Email;
    image: Schema.Attribute.Media<'images'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    position: Schema.Attribute.String;
  };
}

export interface SharedSocLinks extends Struct.ComponentSchema {
  collectionName: 'components_shared_soc_links';
  info: {
    description: '\u0421\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0441\u043E\u0446\u0441\u0435\u0442\u0438';
    displayName: 'Social links';
    icon: 'earth';
  };
  attributes: {
    facebook: Schema.Attribute.String;
    instagram: Schema.Attribute.String;
    vkontakte: Schema.Attribute.String;
  };
}

export interface SharedTextItem extends Struct.ComponentSchema {
  collectionName: 'components_shared_text_items';
  info: {
    description: '\u041E\u0434\u0438\u043D \u043F\u0443\u043D\u043A\u0442 \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u043E\u0433\u043E \u0441\u043F\u0438\u0441\u043A\u0430 (benefits, faculties, include/notInclude \u0438 \u0442.\u043F.)';
    displayName: 'Text item';
    icon: 'bulletList';
  };
  attributes: {
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'home.contact-info': HomeContactInfo;
      'home.service': HomeService;
      'home.step': HomeStep;
      'shared.contact-details': SharedContactDetails;
      'shared.contact-info': SharedContactInfo;
      'shared.faculty': SharedFaculty;
      'shared.menu-link': SharedMenuLink;
      'shared.parametr': SharedParametr;
      'shared.period': SharedPeriod;
      'shared.person': SharedPerson;
      'shared.soc-links': SharedSocLinks;
      'shared.text-item': SharedTextItem;
    }
  }
}
