// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`): `climate`, one indoor unit.
//
// What it adds to the Gladys device box: the room, the setpoint and the
// outdoor temperature side by side, the mode, fan, special mode and energy of
// the day at a glance, and one-tap buttons: on/off, setpoint down/up, and a
// small form (Gladys 5.2+, #3168) to change mode, fan and special mode
// together in one Comfort Cloud call.
//
// Budget (8 components, 2 texts, 6 tiles, 1 status, 4 buttons): three live
// tiles at most, one status list, four buttons. No button style marks a
// state: `primary` is invisible in dark mode (#3153).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  FEATURE_KEYS,
  NAMES,
  clampSetpoint,
  deviceIds,
  deviceValues,
  fanName,
  modeName,
  setpointRange,
  supportedFanSpeeds,
  supportedModes,
} from './devices.js';
import { energyValues } from './energy.js';
import { WIDGET_KEY } from './hub.js';

export const ACTIONS = {
  POWER: 'power',
  DOWN: 'setpoint_down',
  UP: 'setpoint_up',
  SETTINGS: 'settings',
};

export const TEXT = {
  pick: {
    en: 'Choose an air conditioner in the settings of this widget.',
    fr: 'Choisissez un climatiseur dans les réglages de ce widget.',
    de: 'Wähle in den Einstellungen dieses Widgets eine Klimaanlage aus.',
    es: 'Elija un aire acondicionado en la configuración de este widget.',
  },
  unknown: {
    en: 'This air conditioner is not known yet: run a search in the integration.',
    fr: 'Ce climatiseur est inconnu : lancez une recherche dans l’intégration.',
    de: 'Diese Klimaanlage ist noch unbekannt: Starte eine Suche in der Integration.',
    es: 'Este aire acondicionado aún no es conocido: inicie una búsqueda en la integración.',
  },
  room: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Estancia' },
  setpoint: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  outdoor: { en: 'Outdoor', fr: 'Extérieur', de: 'Außen', es: 'Exterior' },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  fan: { en: 'Fan', fr: 'Ventilation', de: 'Lüfter', es: 'Ventilador' },
  special: { en: 'Special mode', fr: 'Mode spécial', de: 'Sondermodus', es: 'Modo especial' },
  normal: { en: 'Normal', fr: 'Normal', de: 'Normal', es: 'Normal' },
  powerful: { en: 'Powerful', fr: 'Powerful', de: 'Powerful', es: 'Powerful' },
  quiet: { en: 'Quiet', fr: 'Silencieux', de: 'Leise', es: 'Silencioso' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  settings: {
    en: 'Mode and fan',
    fr: 'Mode et ventilation',
    de: 'Modus und Lüfter',
    es: 'Modo y ventilador',
  },
  unreachable: {
    en: 'not answering',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  signIn: {
    en: 'sign-in needed',
    fr: 'connexion requise',
    de: 'Anmeldung nötig',
    es: 'inicio de sesión necesario',
  },
  switchedOn: { en: 'Turned on', fr: 'Allumé', de: 'Eingeschaltet', es: 'Encendido' },
  switchedOff: { en: 'Turned off', fr: 'Éteint', de: 'Ausgeschaltet', es: 'Apagado' },
  setpointSet: { en: 'Setpoint: ', fr: 'Consigne : ', de: 'Sollwert: ', es: 'Consigna: ' },
  keptOff: {
    en: 'Kept until power-on: ',
    fr: "Gardée jusqu'à l'allumage : ",
    de: 'Bis zum Einschalten: ',
    es: 'Guardada hasta encender: ',
  },
  applied: {
    en: 'Settings applied',
    fr: 'Réglages appliqués',
    de: 'Einstellungen übernommen',
    es: 'Ajustes aplicados',
  },
};

const t = (text, language) => text[language] ?? text.en;

// A form field label must be a multi-language object (the core's rule).
const everyLanguage = (render) =>
  Object.fromEntries(Object.keys(NAMES).map((language) => [language, render(language)]));

/** "24.5 °C" written the way the language writes decimals. */
export function formatTemperature(value, language) {
  const number = language === 'en' ? String(value) : String(value).replace('.', ',');
  return `${number} °C`;
}

/** "1.25 kWh", the same way. */
function formatEnergy(value, language) {
  const number = language === 'en' ? String(value) : String(value).replace('.', ',');
  return `${number} kWh`;
}

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The special modes a unit offers, as form options. */
function specialModes(caps) {
  const modes = ['normal'];
  if (caps.powerful) modes.push('powerful');
  if (caps.quiet) modes.push('quiet');
  return modes;
}

function currentSpecial(values) {
  if (values[FEATURE_KEYS.POWERFUL] === 1) return 'powerful';
  if (values[FEATURE_KEYS.QUIET] === 1) return 'quiet';
  return 'normal';
}

async function get(hub, { settings, language = 'en' }) {
  const record = settings?.device ? hub.resolveDevice(settings.device) : null;
  if (!record?.capabilities || !record.listed) {
    return message(settings?.device ? TEXT.unknown : TEXT.pick, language);
  }
  const lang = NAMES[language] ? language : 'en';
  const caps = record.capabilities;
  const ids = deviceIds(hub.gladys, record.id);
  const values = deviceValues(hub.shownState(record));
  const { step } = setpointRange(caps);

  const components = [];
  const tile = (key, label, icon) => ({
    type: 'value',
    device_feature: ids.feature(key),
    label: t(label, lang),
    icon,
  });
  if (record.flags.hasIndoor) {
    components.push(tile(FEATURE_KEYS.INDOOR_TEMPERATURE, TEXT.room, 'thermometer'));
  }
  components.push(tile(FEATURE_KEYS.TARGET_TEMPERATURE, TEXT.setpoint, 'target'));
  // Three tiles at most: with the status and the four buttons, the 8 of the budget.
  let energyShown = false;
  if (record.flags.hasOutdoor) {
    components.push(tile(FEATURE_KEYS.OUTDOOR_TEMPERATURE, TEXT.outdoor, 'cloud'));
  } else if (record.flags.hasEnergy) {
    components.push(tile(FEATURE_KEYS.ENERGY_TODAY, TEXT.today, 'zap'));
    energyShown = true;
  }

  const on = values[FEATURE_KEYS.POWER] === 1;
  const known = values[FEATURE_KEYS.POWER] !== undefined;
  const items = [
    {
      label: NAMES[lang].mode,
      icon: 'power',
      value: known
        ? on
          ? (modeName(values[FEATURE_KEYS.MODE], lang) ?? '-')
          : t(TEXT.off, lang)
        : '-',
      color: on ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t(TEXT.fan, lang),
      icon: 'wind',
      value: fanName(values[FEATURE_KEYS.FAN_SPEED], lang) ?? '-',
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (caps.powerful || caps.quiet) {
    const special = currentSpecial(values);
    items.push({
      label: t(TEXT.special, lang),
      icon: 'sliders',
      value: t(TEXT[special], lang),
      color: special === 'normal' ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.INFO,
    });
  }
  if (record.flags.hasEnergy && !energyShown) {
    const { today } = energyValues(record.energy, new Date(hub.now()));
    items.push({
      label: t(TEXT.today, lang),
      icon: 'zap',
      value: formatEnergy(today, lang),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (hub.problem) {
    items.unshift({
      label: 'Comfort Cloud',
      icon: 'cloud-off',
      value: t(
        ['credentials', 'mfa', 'agreement'].includes(hub.problem) ? TEXT.signIn : TEXT.unreachable,
        lang,
      ),
      color: WIDGET_COLORS.WARNING,
    });
  } else if (record.reachable === false) {
    items.unshift({
      label: 'Comfort Cloud',
      icon: 'wifi-off',
      value: t(TEXT.unreachable, lang),
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items });

  const stepText = language === 'en' ? String(step) : String(step).replace('.', ',');
  const fields = [
    {
      key: 'mode',
      type: 'select',
      required: true,
      label: everyLanguage((language) => NAMES[language].mode),
      default: String(values[FEATURE_KEYS.MODE] ?? supportedModes(caps)[0]),
      options: supportedModes(caps).map((value) => ({
        value: String(value),
        label: everyLanguage((language) => modeName(value, language)),
      })),
    },
    {
      key: 'fan_speed',
      type: 'select',
      required: true,
      label: everyLanguage((language) => NAMES[language]['fan-speed']),
      default: String(values[FEATURE_KEYS.FAN_SPEED] ?? 0),
      options: supportedFanSpeeds().map((value) => ({
        value: String(value),
        label: everyLanguage((language) => fanName(value, language)),
      })),
    },
  ];
  if (caps.powerful || caps.quiet) {
    fields.push({
      key: 'special_mode',
      type: 'select',
      required: true,
      label: TEXT.special,
      default: currentSpecial(values),
      options: specialModes(caps).map((value) => ({ value, label: TEXT[value] })),
    });
  }
  components.push(
    {
      type: 'button',
      label: t(on ? TEXT.turnOff : TEXT.turnOn, lang),
      icon: 'power',
      style: 'secondary',
      // The tap toggles the state the unit has then, not the one shown.
      action: { key: ACTIONS.POWER },
    },
    {
      type: 'button',
      label: `−${stepText} °C`,
      icon: 'minus',
      style: 'secondary',
      action: { key: ACTIONS.DOWN },
    },
    {
      type: 'button',
      label: `+${stepText} °C`,
      icon: 'plus',
      style: 'secondary',
      action: { key: ACTIONS.UP },
    },
    {
      type: 'button',
      label: t(TEXT.settings, lang),
      icon: 'sliders',
      style: 'secondary',
      action: { key: ACTIONS.SETTINGS, fields },
    },
  );
  return { ttl_seconds: 60, components };
}

async function action(hub, { actionKey, values, settings }) {
  const device = settings?.device;
  if (!device) {
    throw new Error(TEXT.pick.en);
  }
  const record = hub.require(device);
  if (actionKey === ACTIONS.POWER) {
    const state = await hub.currentState(record);
    const on = state.power !== 1;
    await hub.applySettings(device, { power: on ? 1 : 0 });
    return { message: on ? TEXT.switchedOn : TEXT.switchedOff };
  }
  if (actionKey === ACTIONS.DOWN || actionKey === ACTIONS.UP) {
    const state = await hub.currentState(record);
    const { step } = setpointRange(record.capabilities);
    const target = clampSetpoint(
      record.capabilities,
      state.targetTemperature + (actionKey === ACTIONS.UP ? step : -step),
    );
    await hub.applySettings(device, { targetTemperature: target });
    const prefix = state.power === 1 ? TEXT.setpointSet : TEXT.keptOff;
    return {
      message: Object.fromEntries(
        Object.entries(prefix).map(([language, text]) => [
          language,
          `${text}${formatTemperature(target, language)}`,
        ]),
      ),
    };
  }
  if (actionKey === ACTIONS.SETTINGS) {
    if (!values || values.mode === undefined) {
      // A core older than 5.2 drops the form and relays the tap without values.
      throw new Error('This action needs Gladys 5.2 or later');
    }
    await hub.applySettings(device, {
      power: 1,
      mode: Number(values.mode),
      fanSpeed: Number(values.fan_speed),
      special: values.special_mode,
    });
    return { message: TEXT.applied };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
