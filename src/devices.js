// -----------------------------------------------------------------------------
// The Gladys device of a Panasonic indoor unit: its features (from what the
// unit announces), the Gladys value of each, and the translation of a Gladys
// command into Comfort Cloud settings. Aligned on gladys-midea and
// gladys-gree: same categories, types, feature keys and names.
//
// Feature keys are part of the external ids: never rename one.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import {
  ECO_MODE,
  FAN_SPEED,
  MODE,
  NANOE,
  ON_OFF_FLAG,
  POWER,
  SWING_LR,
  SWING_UD,
} from './panasonic/constants.js';

export const DEVICE_TYPE = 'ac';

export const FEATURE_KEYS = {
  POWER: 'power',
  MODE: 'mode',
  TARGET_TEMPERATURE: 'target-temperature',
  FAN_SPEED: 'fan-speed',
  SWING_VERTICAL: 'swing-vertical',
  SWING_HORIZONTAL: 'swing-horizontal',
  INDOOR_TEMPERATURE: 'indoor-temperature',
  OUTDOOR_TEMPERATURE: 'outdoor-temperature',
  POWERFUL: 'powerful',
  QUIET: 'quiet',
  NANOE: 'nanoe',
  ECO_NAVI: 'eco-navi',
  AI_ECO: 'ai-eco',
  ENERGY_TODAY: 'energy-today',
  ENERGY_TOTAL: 'energy-total',
};

// Gladys' AC_MODE, AC_FAN_SPEED and AC_SWING_* values (server/utils/constants.js).
export const AC_MODE = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
export const AC_FAN_SPEED = { AUTO: 0, LOW: 1, LOW_MID: 2, MID: 3, MID_HIGH: 4, HIGH: 5 };
export const AC_SWING = {
  OFF: 0,
  SWING: 1,
  POSITION_1: 2,
  POSITION_2: 3,
  POSITION_3: 4,
  POSITION_4: 5,
  POSITION_5: 6,
};

const MODE_TO_GLADYS = {
  [MODE.AUTO]: AC_MODE.AUTO,
  [MODE.COOL]: AC_MODE.COOLING,
  [MODE.HEAT]: AC_MODE.HEATING,
  [MODE.DRY]: AC_MODE.DRYING,
  [MODE.FAN]: AC_MODE.FAN,
};
const MODE_FROM_GLADYS = Object.fromEntries(
  Object.entries(MODE_TO_GLADYS).map(([panasonic, gladys]) => [gladys, Number(panasonic)]),
);
// Panasonic's six speeds are Gladys' first six, value for value.
const FAN_SPEEDS = Object.values(FAN_SPEED);

// Positions 1 to 5: top to bottom, left to right (the Gladys labels).
const VERTICAL_POSITIONS = [
  SWING_UD.UP,
  SWING_UD.UP_MID,
  SWING_UD.MID,
  SWING_UD.DOWN_MID,
  SWING_UD.DOWN,
];
const HORIZONTAL_POSITIONS = [
  SWING_LR.LEFT,
  SWING_LR.LEFT_MID,
  SWING_LR.MID,
  SWING_LR.RIGHT_MID,
  SWING_LR.RIGHT,
];

export const modeToGladys = (mode) => MODE_TO_GLADYS[mode] ?? null;
export const modeFromGladys = (value) => MODE_FROM_GLADYS[value] ?? null;

/** Gladys value of a louver: SWING when it sweeps, else its position. */
function swingToGladys(value, positions, auto, sweep) {
  if (value === auto || value === sweep) {
    return AC_SWING.SWING;
  }
  const index = positions.indexOf(value);
  return index === -1 ? null : AC_SWING.POSITION_1 + index;
}
function swingFromGladys(value, positions, auto) {
  if (value === AC_SWING.SWING) {
    return auto;
  }
  return positions[value - AC_SWING.POSITION_1] ?? null;
}
export const verticalToGladys = (value) =>
  swingToGladys(value, VERTICAL_POSITIONS, SWING_UD.AUTO, SWING_UD.SWING);
export const horizontalToGladys = (value) =>
  swingToGladys(value, HORIZONTAL_POSITIONS, SWING_LR.AUTO, undefined);

// Names, one table per language. German says "du", Spanish "usted".
export const NAMES = {
  en: {
    device: 'Air conditioner',
    power: 'On/off',
    mode: 'Mode',
    'target-temperature': 'Target temperature',
    'fan-speed': 'Fan speed',
    'swing-vertical': 'Vertical swing',
    'swing-horizontal': 'Horizontal swing',
    'indoor-temperature': 'Indoor temperature',
    'outdoor-temperature': 'Outdoor temperature',
    powerful: 'Powerful mode',
    quiet: 'Quiet mode',
    nanoe: 'nanoe',
    'eco-navi': 'ECONAVI',
    'ai-eco': 'AI Eco',
    'energy-today': 'Energy today',
    'energy-total': 'Energy consumed',
    'mode-auto': 'Auto',
    'mode-cooling': 'Cool',
    'mode-heating': 'Heat',
    'mode-drying': 'Dry',
    'mode-fan': 'Fan',
    'fan-0': 'Auto',
    'fan-1': 'Low',
    'fan-2': 'Low-Med',
    'fan-3': 'Medium',
    'fan-4': 'Med-High',
    'fan-5': 'High',
    'swing-1': 'Swing',
    'vertical-2': 'Position 1 (Top)',
    'vertical-3': 'Position 2',
    'vertical-4': 'Position 3',
    'vertical-5': 'Position 4',
    'vertical-6': 'Position 5 (Bottom)',
    'horizontal-2': 'Position 1 (Left)',
    'horizontal-3': 'Position 2',
    'horizontal-4': 'Position 3 (Center)',
    'horizontal-5': 'Position 4',
    'horizontal-6': 'Position 5 (Right)',
  },
  fr: {
    device: 'Climatiseur',
    power: 'Marche/arrêt',
    mode: 'Mode',
    'target-temperature': 'Température de consigne',
    'fan-speed': 'Vitesse de ventilation',
    'swing-vertical': 'Balayage vertical',
    'swing-horizontal': 'Balayage horizontal',
    'indoor-temperature': 'Température intérieure',
    'outdoor-temperature': 'Température extérieure',
    powerful: 'Mode Powerful',
    quiet: 'Mode silencieux',
    nanoe: 'nanoe',
    'eco-navi': 'ECONAVI',
    'ai-eco': 'AI Eco',
    'energy-today': "Énergie aujourd'hui",
    'energy-total': 'Énergie consommée',
    'mode-auto': 'Auto',
    'mode-cooling': 'Froid',
    'mode-heating': 'Chaud',
    'mode-drying': 'Déshumidification',
    'mode-fan': 'Ventilation',
    'fan-0': 'Auto',
    'fan-1': 'Faible',
    'fan-2': 'Faible-Moyen',
    'fan-3': 'Moyen',
    'fan-4': 'Moyen-Fort',
    'fan-5': 'Fort',
    'swing-1': 'Balayage',
    'vertical-2': 'Position 1 (Haut)',
    'vertical-3': 'Position 2',
    'vertical-4': 'Position 3',
    'vertical-5': 'Position 4',
    'vertical-6': 'Position 5 (Bas)',
    'horizontal-2': 'Position 1 (Gauche)',
    'horizontal-3': 'Position 2',
    'horizontal-4': 'Position 3 (Centre)',
    'horizontal-5': 'Position 4',
    'horizontal-6': 'Position 5 (Droite)',
  },
  de: {
    device: 'Klimaanlage',
    power: 'Ein/Aus',
    mode: 'Modus',
    'target-temperature': 'Solltemperatur',
    'fan-speed': 'Lüftergeschwindigkeit',
    'swing-vertical': 'Vertikaler Schwenk',
    'swing-horizontal': 'Horizontaler Schwenk',
    'indoor-temperature': 'Innentemperatur',
    'outdoor-temperature': 'Außentemperatur',
    powerful: 'Powerful-Modus',
    quiet: 'Leiser Modus',
    nanoe: 'nanoe',
    'eco-navi': 'ECONAVI',
    'ai-eco': 'AI Eco',
    'energy-today': 'Energie heute',
    'energy-total': 'Verbrauchte Energie',
    'mode-auto': 'Automatisch',
    'mode-cooling': 'Kühlen',
    'mode-heating': 'Heizen',
    'mode-drying': 'Entfeuchten',
    'mode-fan': 'Lüften',
    'fan-0': 'Automatisch',
    'fan-1': 'Niedrig',
    'fan-2': 'Niedrig-Mittel',
    'fan-3': 'Mittel',
    'fan-4': 'Mittel-Hoch',
    'fan-5': 'Hoch',
    'swing-1': 'Schwenken',
    'vertical-2': 'Position 1 (Oben)',
    'vertical-3': 'Position 2',
    'vertical-4': 'Position 3',
    'vertical-5': 'Position 4',
    'vertical-6': 'Position 5 (Unten)',
    'horizontal-2': 'Position 1 (Links)',
    'horizontal-3': 'Position 2',
    'horizontal-4': 'Position 3 (Mitte)',
    'horizontal-5': 'Position 4',
    'horizontal-6': 'Position 5 (Rechts)',
  },
  es: {
    device: 'Aire acondicionado',
    power: 'Encendido/apagado',
    mode: 'Modo',
    'target-temperature': 'Temperatura objetivo',
    'fan-speed': 'Velocidad del ventilador',
    'swing-vertical': 'Oscilación vertical',
    'swing-horizontal': 'Oscilación horizontal',
    'indoor-temperature': 'Temperatura interior',
    'outdoor-temperature': 'Temperatura exterior',
    powerful: 'Modo Powerful',
    quiet: 'Modo silencioso',
    nanoe: 'nanoe',
    'eco-navi': 'ECONAVI',
    'ai-eco': 'AI Eco',
    'energy-today': 'Energía de hoy',
    'energy-total': 'Energía consumida',
    'mode-auto': 'Auto',
    'mode-cooling': 'Frío',
    'mode-heating': 'Calor',
    'mode-drying': 'Seco',
    'mode-fan': 'Ventilador',
    'fan-0': 'Auto',
    'fan-1': 'Baja',
    'fan-2': 'Baja-Media',
    'fan-3': 'Media',
    'fan-4': 'Media-Alta',
    'fan-5': 'Alta',
    'swing-1': 'Oscilante',
    'vertical-2': 'Posición 1 (Arriba)',
    'vertical-3': 'Posición 2',
    'vertical-4': 'Posición 3',
    'vertical-5': 'Posición 4',
    'vertical-6': 'Posición 5 (Abajo)',
    'horizontal-2': 'Posición 1 (Izquierda)',
    'horizontal-3': 'Posición 2',
    'horizontal-4': 'Posición 3 (Centro)',
    'horizontal-5': 'Posición 4',
    'horizontal-6': 'Posición 5 (Derecha)',
  },
};

const MODE_NAME = {
  [AC_MODE.AUTO]: 'mode-auto',
  [AC_MODE.COOLING]: 'mode-cooling',
  [AC_MODE.HEATING]: 'mode-heating',
  [AC_MODE.DRYING]: 'mode-drying',
  [AC_MODE.FAN]: 'mode-fan',
};

const names = (language) => NAMES[language] ?? NAMES.en;
export const modeName = (value, language) => names(language)[MODE_NAME[value]] ?? null;
export const fanName = (value, language) => names(language)[`fan-${value}`] ?? null;

/** The Gladys modes a unit offers, in display order (fan is always offered). */
export function supportedModes(capabilities) {
  const modes = [];
  if (capabilities.auto) modes.push(AC_MODE.AUTO);
  if (capabilities.cool) modes.push(AC_MODE.COOLING);
  if (capabilities.heat) modes.push(AC_MODE.HEATING);
  if (capabilities.dry) modes.push(AC_MODE.DRYING);
  modes.push(AC_MODE.FAN);
  return modes;
}

export const supportedFanSpeeds = () => [...FAN_SPEEDS];

/** Setpoint range: 16-30 °C, from 8 °C on units with the frost protection (8/15 °C) preset. */
export function setpointRange(capabilities) {
  return { min: capabilities.summerHouse > 0 ? 8 : 16, max: 30, step: 0.5 };
}

/** Round a setpoint to the half degree the units take, within their range. */
export function clampSetpoint(capabilities, value) {
  const { min, max, step } = setpointRange(capabilities);
  const rounded = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, rounded));
}

const options = (values, label) =>
  values.map((value, index) => ({ value, label: label(value), sort_order: index }));

/**
 * The features of a unit: `{ key, name, category, type, ... }` without ids.
 * @param {object} record the hub record (capabilities, flags)
 * @param {string} language
 */
export function featureSpecs(record, language) {
  const text = names(language);
  const { capabilities: caps, flags } = record;
  const control = (key, category, type, extra) => ({
    key,
    name: text[key],
    category,
    type,
    read_only: false,
    has_feedback: true,
    min: 0,
    max: 1,
    ...extra,
  });
  const sensor = (key, category, type, extra) => ({
    key,
    name: text[key],
    category,
    type,
    read_only: true,
    has_feedback: false,
    ...extra,
  });
  const swingOptions = (axis) =>
    options(
      [
        AC_SWING.SWING,
        AC_SWING.POSITION_1,
        AC_SWING.POSITION_2,
        AC_SWING.POSITION_3,
        AC_SWING.POSITION_4,
        AC_SWING.POSITION_5,
      ],
      (value) => (value === AC_SWING.SWING ? text['swing-1'] : text[`${axis}-${value}`]),
    );
  const range = setpointRange(caps);
  const specs = [
    control(FEATURE_KEYS.POWER, 'air-conditioning', 'binary'),
    control(FEATURE_KEYS.MODE, 'air-conditioning', 'mode', {
      max: 4,
      supported_options: options(supportedModes(caps), (value) => modeName(value, language)),
    }),
    control(FEATURE_KEYS.TARGET_TEMPERATURE, 'air-conditioning', 'target-temperature', {
      unit: 'celsius',
      min: range.min,
      max: range.max,
      step: range.step,
    }),
    control(FEATURE_KEYS.FAN_SPEED, 'air-conditioning', 'fan-speed', {
      max: 7,
      supported_options: options(supportedFanSpeeds(), (value) => fanName(value, language)),
    }),
    control(FEATURE_KEYS.SWING_VERTICAL, 'air-conditioning', 'swing-vertical', {
      max: 6,
      supported_options: swingOptions('vertical'),
    }),
  ];
  if (caps.horizontalSwing) {
    specs.push(
      control(FEATURE_KEYS.SWING_HORIZONTAL, 'air-conditioning', 'swing-horizontal', {
        max: 7,
        supported_options: swingOptions('horizontal'),
      }),
    );
  }
  if (flags.hasIndoor) {
    specs.push(
      sensor(FEATURE_KEYS.INDOOR_TEMPERATURE, 'temperature-sensor', 'decimal', {
        unit: 'celsius',
        min: -20,
        max: 60,
      }),
    );
  }
  if (flags.hasOutdoor) {
    specs.push(
      sensor(FEATURE_KEYS.OUTDOOR_TEMPERATURE, 'temperature-sensor', 'decimal', {
        unit: 'celsius',
        min: -40,
        max: 70,
      }),
    );
  }
  if (caps.powerful) {
    specs.push(control(FEATURE_KEYS.POWERFUL, 'switch', 'binary'));
  }
  if (caps.quiet) {
    specs.push(control(FEATURE_KEYS.QUIET, 'switch', 'binary'));
  }
  if (caps.hasNanoe) {
    specs.push(control(FEATURE_KEYS.NANOE, 'switch', 'binary'));
  }
  if (caps.hasEcoNavi) {
    specs.push(control(FEATURE_KEYS.ECO_NAVI, 'switch', 'binary'));
  }
  if (caps.hasEcoFunction) {
    specs.push(control(FEATURE_KEYS.AI_ECO, 'switch', 'binary'));
  }
  if (flags.hasEnergy) {
    specs.push(
      sensor(FEATURE_KEYS.ENERGY_TODAY, 'energy-sensor', 'index-today', {
        unit: 'kilowatt-hour',
        min: 0,
        max: 1000,
      }),
      sensor(FEATURE_KEYS.ENERGY_TOTAL, 'energy-sensor', 'index', {
        unit: 'kilowatt-hour',
        min: 0,
        max: 10000000,
      }),
    );
  }
  return specs;
}

export const deviceIds = (gladys, unitId) => gladys.externalIds(DEVICE_TYPE, String(unitId));

/** The name given in the Comfort Cloud application, else "Air conditioner". */
export function deviceName(record, language) {
  return record.name || names(language).device;
}

/**
 * The discovery payload of a unit.
 * @param {object} gladys
 * @param {object} record
 * @param {string} language
 */
export function buildDevice(gladys, record, language) {
  const ids = deviceIds(gladys, record.id);
  return {
    name: deviceName(record, language),
    external_id: ids.device,
    model: record.model ? `Panasonic ${record.model}` : 'Panasonic',
    // The container reads the units by its own timer (src/hub.js); the core's
    // poll, once a minute, is only a fallback (GladysAssistant/Gladys#3198)
    // and is skipped while the timer runs.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: record.group ? [{ name: 'GROUP', value: record.group }] : [],
    features: featureSpecs(record, language).map(({ key, ...feature }) => ({
      ...feature,
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The Gladys value of every feature, by key (undefined when unknown).
 * @param {object} state the unit state, pending settings applied
 * @param {object} [energy] `{ today, total }`
 */
export function deviceValues(state, energy) {
  if (!state) {
    return {};
  }
  const bool = (condition) => (condition ? 1 : 0);
  const known = (value, convert) =>
    value === null || value === undefined ? undefined : convert(value);
  return {
    [FEATURE_KEYS.POWER]: known(state.power, (power) => bool(power === POWER.ON)),
    [FEATURE_KEYS.MODE]: known(state.mode, (mode) => modeToGladys(mode) ?? undefined),
    [FEATURE_KEYS.TARGET_TEMPERATURE]: state.targetTemperature ?? undefined,
    [FEATURE_KEYS.FAN_SPEED]: known(state.fanSpeed, (speed) =>
      FAN_SPEEDS.includes(speed) ? speed : undefined,
    ),
    [FEATURE_KEYS.SWING_VERTICAL]: known(
      state.swingVertical,
      (v) => verticalToGladys(v) ?? undefined,
    ),
    [FEATURE_KEYS.SWING_HORIZONTAL]: known(
      state.swingHorizontal,
      (h) => horizontalToGladys(h) ?? undefined,
    ),
    [FEATURE_KEYS.INDOOR_TEMPERATURE]: state.insideTemperature ?? undefined,
    [FEATURE_KEYS.OUTDOOR_TEMPERATURE]: state.outsideTemperature ?? undefined,
    [FEATURE_KEYS.POWERFUL]: known(state.ecoMode, (eco) => bool(eco === ECO_MODE.POWERFUL)),
    [FEATURE_KEYS.QUIET]: known(state.ecoMode, (eco) => bool(eco === ECO_MODE.QUIET)),
    [FEATURE_KEYS.NANOE]: known(state.nanoe, (nanoe) =>
      bool([NANOE.ON, NANOE.MODE_G, NANOE.ALL].includes(nanoe)),
    ),
    [FEATURE_KEYS.ECO_NAVI]: known(state.ecoNavi, (flag) => bool(flag === ON_OFF_FLAG.ON)),
    [FEATURE_KEYS.AI_ECO]: known(state.ecoFunction, (flag) => bool(flag === ON_OFF_FLAG.ON)),
    [FEATURE_KEYS.ENERGY_TODAY]: energy?.today ?? undefined,
    [FEATURE_KEYS.ENERGY_TOTAL]: energy?.total ?? undefined,
  };
}

/**
 * The Comfort Cloud change of a Gladys command on a feature.
 * @param {object} record
 * @param {string} key feature key
 * @param {number} value Gladys value
 * @returns {object} a change for buildParameters (may be empty: nothing to do)
 * @throws on an unknown feature or a value the unit cannot take
 */
export function commandChange(record, key, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid value ${value} for ${key}`);
  }
  const caps = record.capabilities;
  const state = record.state ?? {};
  const onOff = (on, active, inactive) => (on ? active : inactive);
  switch (key) {
    case FEATURE_KEYS.POWER:
      return { power: number === 1 ? POWER.ON : POWER.OFF };
    case FEATURE_KEYS.MODE: {
      const mode = modeFromGladys(number);
      if (mode === null || !supportedModes(caps).includes(number)) {
        throw new Error(`This unit has no mode ${value}`);
      }
      return { mode };
    }
    case FEATURE_KEYS.TARGET_TEMPERATURE:
      return { targetTemperature: clampSetpoint(caps, number) };
    case FEATURE_KEYS.FAN_SPEED:
      if (!FAN_SPEEDS.includes(number)) {
        throw new Error(`This unit has no fan speed ${value}`);
      }
      return { fanSpeed: number };
    case FEATURE_KEYS.SWING_VERTICAL: {
      const position = swingFromGladys(number, VERTICAL_POSITIONS, SWING_UD.AUTO);
      if (position === null) {
        throw new Error('The louver either swings or takes one of five positions');
      }
      return { swingVertical: position };
    }
    case FEATURE_KEYS.SWING_HORIZONTAL: {
      const position = swingFromGladys(number, HORIZONTAL_POSITIONS, SWING_LR.AUTO);
      if (!caps.horizontalSwing || position === null) {
        throw new Error('The louver either swings or takes one of five positions');
      }
      return { swingHorizontal: position };
    }
    case FEATURE_KEYS.POWERFUL:
    case FEATURE_KEYS.QUIET: {
      const target = key === FEATURE_KEYS.POWERFUL ? ECO_MODE.POWERFUL : ECO_MODE.QUIET;
      if (number === 1) {
        return { ecoMode: target };
      }
      // Off: back to normal, unless the other one is on (nothing to do then).
      return state.ecoMode === target ? { ecoMode: ECO_MODE.AUTO } : {};
    }
    case FEATURE_KEYS.NANOE:
      return { nanoe: onOff(number === 1, NANOE.ON, NANOE.OFF) };
    case FEATURE_KEYS.ECO_NAVI:
      return { ecoNavi: onOff(number === 1, ON_OFF_FLAG.ON, ON_OFF_FLAG.OFF) };
    case FEATURE_KEYS.AI_ECO:
      return { ecoFunction: onOff(number === 1, ON_OFF_FLAG.ON, ON_OFF_FLAG.OFF) };
    default:
      throw new Error(`The feature ${key} cannot be controlled`);
  }
}
