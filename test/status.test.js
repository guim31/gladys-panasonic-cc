// -----------------------------------------------------------------------------
// Reading the Comfort Cloud answers and building the control requests, checked
// against what aio-panasonic-comfort-cloud computes on the same inputs
// (test/fixtures/reference-vectors.json, scripts/reference-vectors.py), and
// the Gladys mapping of the values.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AC_MODE,
  AC_SWING,
  FEATURE_KEYS,
  commandChange,
  deviceValues,
  horizontalToGladys,
  verticalToGladys,
} from '../src/devices.js';
import { SWING_LR, SWING_UD } from '../src/panasonic/constants.js';
import {
  applyParameters,
  buildParameters,
  parseGroups,
  parseHistory,
  parseStatus,
  unitId,
} from '../src/panasonic/status.js';
import { VECTORS } from './helpers/fakePanasonic.js';

test('every status vector reads as the reference reads it', () => {
  for (const [name, { status, deviceType, parsed }] of Object.entries(VECTORS.devices)) {
    const { capabilities, state } = parseStatus(status, deviceType);
    const at = `vector "${name}"`;
    assert.equal(state.power, parsed.power, `${at}: power`);
    assert.equal(state.mode, parsed.mode, `${at}: mode`);
    assert.equal(state.fanSpeed, parsed.fanSpeed, `${at}: fan`);
    assert.equal(state.targetTemperature, parsed.targetTemperature, `${at}: setpoint`);
    assert.equal(state.insideTemperature, parsed.insideTemperature, `${at}: inside`);
    assert.equal(state.outsideTemperature, parsed.outsideTemperature, `${at}: outside`);
    assert.equal(state.swingVertical, parsed.verticalSwing, `${at}: vertical swing`);
    assert.equal(state.swingHorizontal, parsed.horizontalSwing, `${at}: horizontal swing`);
    assert.equal(state.ecoMode, parsed.ecoMode, `${at}: eco mode`);
    assert.equal(state.nanoe, parsed.nanoe, `${at}: nanoe`);
    assert.equal(capabilities.hasNanoe, parsed.hasNanoe, `${at}: has nanoe`);
    assert.equal(capabilities.hasEcoNavi, parsed.hasEcoNavi, `${at}: has ECONAVI`);
    assert.equal(capabilities.hasEcoFunction, parsed.hasEcoFunction, `${at}: has AI Eco`);
    assert.equal(capabilities.horizontalSwing, parsed.hasHorizontalSwing, `${at}: has LR swing`);
    for (const [key, value] of Object.entries(parsed.features)) {
      assert.equal(capabilities[key], value, `${at}: feature ${key}`);
    }
  }
});

test('every control request is built as the reference builds it', () => {
  const ops = {
    vertical: (value) => ({ swingVertical: value }),
    horizontal: (value) => ({ swingHorizontal: value }),
    mode: (value) => ({ mode: value }),
    temperature: (value) => ({ targetTemperature: value }),
    eco: (value) => ({ ecoMode: value }),
  };
  assert.ok(VECTORS.changeRequests.length > 50);
  for (const { device, op, value, request } of VECTORS.changeRequests) {
    const { state } = parseStatus(VECTORS.devices[device].status);
    const ours = buildParameters(state, ops[op](value));
    // The reference powers an off unit on for every one of these; we only do
    // for a mode change and keep the rest until power-on (src/hub.js).
    const expected = { ...request };
    if (op !== 'mode' && state.power !== 1) {
      delete expected.operate;
    }
    assert.deepEqual(ours, expected, `${device} ${op} ${value}`);
  }
});

test('a setting applied locally reads back as sent', () => {
  const { state } = parseStatus(VECTORS.devices['heat-fixed'].status);
  const parameters = buildParameters(state, {
    swingVertical: SWING_UD.AUTO,
    targetTemperature: 21,
    fanSpeed: 3,
  });
  const next = applyParameters(state, parameters);
  assert.equal(next.swingVertical, SWING_UD.AUTO);
  assert.equal(next.swingHorizontal, state.swingHorizontal, 'the other axis kept');
  assert.equal(next.targetTemperature, 21);
  assert.equal(next.fanSpeed, 3);
  const back = applyParameters(next, buildParameters(next, { swingHorizontal: SWING_LR.LEFT }));
  assert.equal(back.swingVertical, SWING_UD.AUTO);
  assert.equal(back.swingHorizontal, SWING_LR.LEFT);
});

test('the unit list keeps the air conditioners, sets the others apart', () => {
  const { units, others } = parseGroups({
    groupList: [
      {
        groupName: 'Home',
        deviceList: [
          { deviceGuid: 'CS-A+1', deviceName: ' Salon ', deviceType: '3', parameters: {} },
          { deviceGuid: 'AQ+2', deviceType: '2', deviceName: 'Aquarea' },
          { deviceGuid: 'HW+3', deviceType: '11', deviceName: 'Tank', parameters: {} },
          null,
          { deviceName: 'no guid', parameters: {} },
        ],
      },
      { groupName: 'Old', deviceIdList: [{ deviceGuid: 'CS-B/4', parameters: {} }] },
    ],
  });
  assert.deepEqual(
    units.map((unit) => [unit.guid, unit.name, unit.group]),
    [
      ['CS-A+1', 'Salon', 'Home'],
      ['CS-B/4', '', 'Old'],
    ],
  );
  assert.equal(others.length, 2);
  assert.equal(units[0].id, unitId('CS-A+1'));
  assert.match(units[0].id, /^[0-9a-f]{32}$/);
  assert.deepEqual(parseGroups(null), { units: [], others: [] });
});

test('the history keeps the days with a consumption', () => {
  assert.deepEqual(
    parseHistory({
      historyDataList: [
        { dataTime: '20261001', consumption: 1.2 },
        { dataTime: '20261002', consumption: -255 },
        { dataTime: '20261003', consumption: 0 },
        { dataTime: 'bad', consumption: 3 },
        { consumption: 3 },
      ],
    }),
    { 20261001: 1.2, 20261003: 0 },
  );
  assert.deepEqual(parseHistory({}), {});
});

test('Gladys values: modes, fan, swing positions, special modes', () => {
  const { state } = parseStatus(VECTORS.devices['cool-nanoe'].status, '1');
  const values = deviceValues(state);
  assert.equal(values[FEATURE_KEYS.POWER], 1);
  assert.equal(values[FEATURE_KEYS.MODE], AC_MODE.COOLING);
  assert.equal(values[FEATURE_KEYS.FAN_SPEED], 4);
  assert.equal(values[FEATURE_KEYS.SWING_VERTICAL], AC_SWING.SWING);
  assert.equal(values[FEATURE_KEYS.SWING_HORIZONTAL], AC_SWING.POSITION_5, 'right');
  assert.equal(values[FEATURE_KEYS.QUIET], 1);
  assert.equal(values[FEATURE_KEYS.POWERFUL], 0);
  assert.equal(values[FEATURE_KEYS.NANOE], 1);
  assert.equal(values[FEATURE_KEYS.ECO_NAVI], 0, 'ecoNavi 1 is off');
  assert.equal(values[FEATURE_KEYS.AI_ECO], 1);

  assert.deepEqual(
    [SWING_UD.UP, SWING_UD.UP_MID, SWING_UD.MID, SWING_UD.DOWN_MID, SWING_UD.DOWN].map(
      verticalToGladys,
    ),
    [2, 3, 4, 5, 6],
  );
  assert.equal(verticalToGladys(SWING_UD.SWING), AC_SWING.SWING);
  assert.deepEqual(
    [SWING_LR.LEFT, SWING_LR.LEFT_MID, SWING_LR.MID, SWING_LR.RIGHT_MID, SWING_LR.RIGHT].map(
      horizontalToGladys,
    ),
    [2, 3, 4, 5, 6],
  );
  assert.equal(horizontalToGladys(SWING_LR.UNAVAILABLE), null);
});

test('Gladys commands become Comfort Cloud changes, refused when impossible', () => {
  const { capabilities, state } = parseStatus(VECTORS.devices['cool-nanoe'].status, '1');
  const record = { capabilities, state };
  assert.deepEqual(commandChange(record, FEATURE_KEYS.MODE, AC_MODE.HEATING), { mode: 3 });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.MODE, AC_MODE.DRYING), { mode: 1 });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.TARGET_TEMPERATURE, 22.3), {
    targetTemperature: 22.5,
  });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.TARGET_TEMPERATURE, 40), {
    targetTemperature: 30,
  });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.TARGET_TEMPERATURE, 5), {
    targetTemperature: 8,
  });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.SWING_VERTICAL, AC_SWING.SWING), {
    swingVertical: SWING_UD.AUTO,
  });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.SWING_HORIZONTAL, AC_SWING.POSITION_1), {
    swingHorizontal: SWING_LR.LEFT,
  });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.POWERFUL, 1), { ecoMode: 1 });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.POWERFUL, 0), {}, 'quiet stays');
  assert.deepEqual(commandChange(record, FEATURE_KEYS.QUIET, 0), { ecoMode: 0 });
  assert.deepEqual(commandChange(record, FEATURE_KEYS.NANOE, 0), { nanoe: 1 });
  assert.throws(() => commandChange(record, FEATURE_KEYS.SWING_VERTICAL, AC_SWING.OFF));
  assert.throws(() => commandChange(record, FEATURE_KEYS.FAN_SPEED, 7));
  assert.throws(() => commandChange(record, FEATURE_KEYS.INDOOR_TEMPERATURE, 1));
  assert.throws(() => commandChange(record, FEATURE_KEYS.POWER, 'on'));

  const noHeat = { capabilities: { ...capabilities, heat: false }, state };
  assert.throws(() => commandChange(noHeat, FEATURE_KEYS.MODE, AC_MODE.HEATING));
  const noSummer = { capabilities: { ...capabilities, summerHouse: 0 }, state };
  assert.deepEqual(commandChange(noSummer, FEATURE_KEYS.TARGET_TEMPERATURE, 5), {
    targetTemperature: 16,
  });
});
