// -----------------------------------------------------------------------------
// Reading the answers of Comfort Cloud (unit list, status, history) into plain
// objects, and building the `parameters` of a control request. The rules are
// those of aio-panasonic-comfort-cloud's panasonicdevice.py and
// changerequestbuilder.py; test/fixtures/reference-vectors.json holds what the
// reference itself computes on the same inputs.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import {
  ECO_MODE,
  FAN_AUTO_MODE,
  INVALID_TEMPERATURE,
  NANOE,
  NOT_AIR_CONDITIONERS,
  NO_CONSUMPTION,
  ON_OFF_FLAG,
  POWER,
  SWING_LR,
  SWING_UD,
} from './constants.js';

const has = (object, key) => object && Object.hasOwn(object, key);
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Our stable id of a unit: the MD5 of its guid (the guid holds "+" and "/"). */
export const unitId = (guid) => createHash('md5').update(String(guid), 'utf8').digest('hex');

/**
 * The air conditioners of the account, from /device/group. Aquarea heat
 * pumps and hot water tanks are listed apart (not supported).
 * @returns {{ units: object[], others: object[] }}
 */
export function parseGroups(body) {
  const units = [];
  const others = [];
  for (const group of Array.isArray(body?.groupList) ? body.groupList : []) {
    const list = Array.isArray(group?.deviceList)
      ? group.deviceList
      : Array.isArray(group?.deviceIdList)
        ? group.deviceIdList
        : [];
    for (const device of list) {
      if (!device || typeof device.deviceGuid !== 'string' || !device.deviceGuid) {
        continue;
      }
      const unit = {
        id: unitId(device.deviceGuid),
        guid: device.deviceGuid,
        name: typeof device.deviceName === 'string' ? device.deviceName.trim() : '',
        group: typeof group.groupName === 'string' ? group.groupName : '',
        model: typeof device.deviceModuleNumber === 'string' ? device.deviceModuleNumber : '',
        deviceType: device.deviceType === undefined ? null : String(device.deviceType),
      };
      const airConditioner =
        has(device, 'parameters') && !NOT_AIR_CONDITIONERS.includes(unit.deviceType);
      (airConditioner ? units : others).push(unit);
    }
  }
  return { units, others };
}

const temperature = (value) => {
  const number = finite(value);
  return number === null || number === INVALID_TEMPERATURE ? null : number;
};

/** The swing of each axis: a fixed position, or AUTO when fanAutoMode sweeps it. */
function readSwing(parameters) {
  let vertical = finite(parameters.airSwingUD);
  let horizontal = finite(parameters.airSwingLR);
  const auto = finite(parameters.fanAutoMode);
  if (auto === FAN_AUTO_MODE.BOTH || auto === FAN_AUTO_MODE.HORIZONTAL) {
    horizontal = SWING_LR.AUTO;
  }
  if (auto === FAN_AUTO_MODE.BOTH || auto === FAN_AUTO_MODE.VERTICAL) {
    vertical = SWING_UD.AUTO;
  }
  return { vertical, horizontal };
}

/**
 * A /deviceStatus answer: what the unit can do (`features`) and its state.
 * @param {object} body
 * @param {string|null} deviceType from the unit list
 */
export function parseStatus(body, deviceType = null) {
  const p = body?.parameters ?? {};
  const flag = (key) => body?.[key] === true;
  const features = {
    auto: flag('autoMode'),
    cool: flag('coolMode'),
    heat: flag('heatMode'),
    dry: flag('dryMode'),
    fan: flag('fanMode'),
    powerful: flag('powerfulMode'),
    quiet: flag('quietMode'),
    nanoe: flag('nanoe'),
    ecoNavi: flag('ecoNavi'),
    ecoFunction: (finite(body?.ecoFunction) ?? 0) > 0,
    airSwingLR: flag('airSwingLR'),
    autoSwingUD: flag('autoSwingUD'),
    summerHouse: finite(body?.summerHouse) ?? 0,
  };
  const { vertical, horizontal } = readSwing(p);
  const state = {
    power: finite(p.operate),
    mode: finite(p.operationMode),
    fanSpeed: finite(p.fanSpeed),
    targetTemperature: temperature(p.temperatureSet),
    insideTemperature: temperature(p.insideTemperature),
    outsideTemperature: temperature(p.outTemperature),
    swingVertical: vertical,
    swingHorizontal: horizontal,
    ecoMode: finite(p.ecoMode),
    nanoe: finite(p.nanoe),
    ecoNavi: finite(p.ecoNavi),
    ecoFunction: finite(p.ecoFunctionData),
    airDirection: finite(p.airDirection) ?? 0,
  };
  // The application hides the left/right louver of ducted units and when
  // airDirection says it is disabled; type 7 only checks the flag.
  let horizontalSwing = features.airSwingLR && state.swingHorizontal !== SWING_LR.UNAVAILABLE;
  if (horizontalSwing && deviceType !== '7') {
    horizontalSwing =
      !['4', '5', '6', '8', '9', '10'].includes(deviceType) && ![1, 3].includes(state.airDirection);
  }
  const capabilities = {
    ...features,
    horizontalSwing,
    hasNanoe: features.nanoe && state.nanoe !== null && state.nanoe !== NANOE.UNAVAILABLE,
    hasEcoNavi:
      features.ecoNavi && state.ecoNavi !== null && state.ecoNavi !== ON_OFF_FLAG.UNAVAILABLE,
    hasEcoFunction:
      features.ecoFunction &&
      state.ecoFunction !== null &&
      state.ecoFunction !== ON_OFF_FLAG.UNAVAILABLE,
  };
  const timestamp = finite(body?.timestamp);
  return { capabilities, state, timestamp };
}

/**
 * The consumption of every day of a /deviceHistoryData answer (month mode),
 * in kWh, by "YYYYMMDD". Days without data (-255) are left out.
 */
export function parseHistory(body) {
  const days = {};
  for (const item of Array.isArray(body?.historyDataList) ? body.historyDataList : []) {
    const day = typeof item?.dataTime === 'string' ? item.dataTime : null;
    const consumption = finite(item?.consumption);
    if (!day || !/^\d{8}$/.test(day) || consumption === null) {
      continue;
    }
    if (consumption === NO_CONSUMPTION || consumption < 0) {
      continue;
    }
    days[day] = consumption;
  }
  return days;
}

/**
 * Settings to send for a change, from the current state. Like the reference
 * builder: a swing change sets fanAutoMode for both axes; a mode change
 * powers the unit on.
 * @param {object} state current state (parseStatus().state)
 * @param {object} change `{ power, mode, targetTemperature, fanSpeed, swingVertical, swingHorizontal, ecoMode, nanoe, ecoNavi, ecoFunction }`, each optional
 * @returns {object} the `parameters` of /deviceStatus/control
 */
export function buildParameters(state, change) {
  const parameters = {};
  if (change.power !== undefined) {
    parameters.operate = change.power;
  }
  if (change.mode !== undefined) {
    parameters.operationMode = change.mode;
    if (state.power !== POWER.ON && change.power === undefined) {
      parameters.operate = POWER.ON;
    }
  }
  if (change.targetTemperature !== undefined) {
    parameters.temperatureSet = change.targetTemperature;
  }
  if (change.fanSpeed !== undefined) {
    parameters.fanSpeed = change.fanSpeed;
  }
  if (change.ecoMode !== undefined) {
    parameters.ecoMode = change.ecoMode;
  }
  if (change.nanoe !== undefined) {
    parameters.nanoe = change.nanoe;
  }
  if (change.ecoNavi !== undefined) {
    parameters.ecoNavi = change.ecoNavi;
  }
  if (change.ecoFunction !== undefined) {
    parameters.ecoFunctionData = change.ecoFunction;
  }
  if (change.swingVertical !== undefined || change.swingHorizontal !== undefined) {
    const vertical = change.swingVertical ?? state.swingVertical;
    const horizontal = change.swingHorizontal ?? state.swingHorizontal;
    const verticalAuto = vertical === SWING_UD.AUTO;
    const horizontalAuto = horizontal === SWING_LR.AUTO;
    parameters.fanAutoMode =
      verticalAuto && horizontalAuto
        ? FAN_AUTO_MODE.BOTH
        : verticalAuto
          ? FAN_AUTO_MODE.VERTICAL
          : horizontalAuto
            ? FAN_AUTO_MODE.HORIZONTAL
            : FAN_AUTO_MODE.DISABLED;
    if (change.swingVertical !== undefined && !verticalAuto) {
      parameters.airSwingUD = change.swingVertical;
    }
    if (change.swingHorizontal !== undefined && !horizontalAuto) {
      parameters.airSwingLR = change.swingHorizontal;
    }
  }
  return parameters;
}

/** The state after a change was accepted, until the next reading confirms it. */
export function applyParameters(state, parameters) {
  const next = { ...state };
  const map = {
    operate: 'power',
    operationMode: 'mode',
    temperatureSet: 'targetTemperature',
    fanSpeed: 'fanSpeed',
    ecoMode: 'ecoMode',
    nanoe: 'nanoe',
    ecoNavi: 'ecoNavi',
    ecoFunctionData: 'ecoFunction',
  };
  for (const [key, field] of Object.entries(map)) {
    if (parameters[key] !== undefined) {
      next[field] = parameters[key];
    }
  }
  if (parameters.fanAutoMode !== undefined) {
    const swing = readSwing({
      airSwingUD:
        parameters.airSwingUD ??
        (state.swingVertical === SWING_UD.AUTO ? null : state.swingVertical),
      airSwingLR:
        parameters.airSwingLR ??
        (state.swingHorizontal === SWING_LR.AUTO ? null : state.swingHorizontal),
      fanAutoMode: parameters.fanAutoMode,
    });
    next.swingVertical = swing.vertical ?? state.swingVertical;
    next.swingHorizontal = swing.horizontal ?? state.swingHorizontal;
  }
  return next;
}

export { ECO_MODE };
