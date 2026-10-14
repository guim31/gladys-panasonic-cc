// -----------------------------------------------------------------------------
// The hub against the fake Gladys and the fake Panasonic cloud: discovery,
// the container's own polling (without the core's onPoll), commands and their
// re-reading, the settings kept while a unit is off, the account problems and
// their trigger, the energy counter, the restart from /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AC_MODE, AC_SWING, FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS } from '../src/hub.js';
import {
  CONFIG,
  FakePanasonic,
  PASSWORD,
  createAll,
  createClock,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';

async function createdWorld(t, options) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createAll(world);
  return world;
}

const feature = (world, unit, key) =>
  world.fake.discoveredDevices
    .flatMap((device) => device.features)
    .find((candidate) => candidate.external_id === featureId(world.gladys, unit, key));

const device = (world, unit) =>
  world.fake.discoveredDevices.find(
    (candidate) => candidate.external_id === deviceId(world.gladys, unit),
  );

test('discovery: one device per indoor unit, Aquarea set apart, connected', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((candidate) => candidate.name),
    ['Living room', 'Bedroom', 'Office'],
  );
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.hub.others, 1);
  // Nothing is published for devices the user has not added.
  assert.equal(world.fake.states.length, 0);
  const [living, bedroom, office] = world.panasonic.units;
  assert.ok(feature(world, living, FEATURE_KEYS.ENERGY_TOTAL));
  assert.ok(!feature(world, living, FEATURE_KEYS.SWING_HORIZONTAL), 'airDirection 1');
  assert.ok(feature(world, bedroom, FEATURE_KEYS.SWING_HORIZONTAL));
  assert.ok(feature(world, bedroom, FEATURE_KEYS.NANOE));
  assert.ok(!feature(world, office, FEATURE_KEYS.OUTDOOR_TEMPERATURE), 'no outdoor sensor');
  assert.ok(!feature(world, office, FEATURE_KEYS.ENERGY_TODAY), 'no energy data');
  assert.ok(!feature(world, office, FEATURE_KEYS.POWERFUL));
  assert.equal(feature(world, living, FEATURE_KEYS.TARGET_TEMPERATURE).min, 8, 'frost preset');
  assert.equal(feature(world, office, FEATURE_KEYS.TARGET_TEMPERATURE).min, 16);
});

test('the container refreshes the states by its own timer, without onPoll', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  const indoor = featureId(world.gladys, living, FEATURE_KEYS.INDOOR_TEMPERATURE);
  assert.equal(world.fake.lastState(indoor), 21);
  living.status.parameters.insideTemperature = 23.5;
  world.clock.advance(120_000);
  // What the setInterval of the hub runs (timers are off in the tests).
  await world.hub.pollAll();
  assert.equal(world.fake.lastState(indoor), 23.5);
  assert.equal(
    world.fake.wsMessages.filter((message) => message.type === 'poll').length,
    0,
    'the core never polled',
  );
});

test('the core onPoll is a fallback, skipped while the timer runs', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  const before = world.panasonic.calls.status;
  await world.fake.poll(device(world, living));
  assert.equal(world.panasonic.calls.status, before, 'read moments ago by the timer');
  world.clock.advance(120_000);
  await world.fake.poll(device(world, living));
  assert.equal(world.panasonic.calls.status, before + 1);
});

test('only the units added to Gladys are read by the timer', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const [living] = world.panasonic.units;
  await world.fake.deviceCreated(device(world, living));
  await world.hub.idle();
  const before = world.panasonic.calls.status;
  world.clock.advance(120_000);
  await world.hub.pollAll();
  assert.equal(world.panasonic.calls.status, before + 1);
});

test('the unit list is read again every 30 minutes, not at every cycle', async (t) => {
  const world = await createdWorld(t);
  const before = world.panasonic.calls.groups;
  world.clock.advance(120_000);
  await world.hub.pollAll();
  assert.equal(world.panasonic.calls.groups, before);
  world.clock.advance(30 * 60_000);
  await world.hub.pollAll();
  assert.equal(world.panasonic.calls.groups, before + 1);
});

test('a command is sent at once, shown at once, and the unit read again', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  const target = feature(world, bedroom, FEATURE_KEYS.TARGET_TEMPERATURE);
  const statusBefore = world.panasonic.calls.status;
  const ack = await world.fake.setValue(device(world, bedroom), target, 19.3);
  assert.equal(ack.success, true, ack.error);
  await world.hub.idle();
  assert.deepEqual(world.panasonic.controls.at(-1), {
    guid: bedroom.guid,
    parameters: { temperatureSet: 19.5 },
  });
  assert.equal(world.fake.lastState(target.external_id), 19.5);
  assert.equal(world.panasonic.calls.status, statusBefore + 1, 'read again after the command');
});

test('a mode change turns an off unit on, in the same request', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  bedroom.status.parameters.operate = 0;
  await world.hub.pollAll({ force: true });
  const mode = feature(world, bedroom, FEATURE_KEYS.MODE);
  await world.fake.setValue(device(world, bedroom), mode, AC_MODE.HEATING);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, { operationMode: 3, operate: 1 });
  assert.equal(world.fake.lastState(featureId(world.gladys, bedroom, FEATURE_KEYS.POWER)), 1);
});

test('a setpoint asked while the unit is off waits for its power-on', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  bedroom.status.parameters.operate = 0;
  await world.hub.pollAll({ force: true });
  const unit = device(world, bedroom);
  const target = feature(world, bedroom, FEATURE_KEYS.TARGET_TEMPERATURE);
  const swing = feature(world, bedroom, FEATURE_KEYS.SWING_VERTICAL);
  const controls = world.panasonic.controls.length;
  await world.fake.setValue(unit, target, 18);
  await world.fake.setValue(unit, swing, AC_SWING.POSITION_5);
  assert.equal(world.panasonic.controls.length, controls, 'nothing sent: the unit stays off');
  assert.equal(world.fake.lastState(target.external_id), 18, 'shown as asked');
  // A reading of the cloud (still the old setpoint) does not erase it.
  world.clock.advance(120_000);
  await world.hub.pollAll();
  assert.equal(world.fake.lastState(target.external_id), 18);

  await world.fake.setValue(unit, feature(world, bedroom, FEATURE_KEYS.POWER), 1);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, {
    operate: 1,
    temperatureSet: 18,
    fanAutoMode: 1,
    airSwingUD: 1,
  });
  assert.deepEqual(
    world.hub.records.get(world.hub.resolveDevice(unit.external_id).id).settingsWhenOff,
    {},
  );
});

test('the fan speed and nanoe are sent even to an off unit (like the reference)', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  bedroom.status.parameters.operate = 0;
  await world.hub.pollAll({ force: true });
  const unit = device(world, bedroom);
  await world.fake.setValue(unit, feature(world, bedroom, FEATURE_KEYS.FAN_SPEED), 2);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, { fanSpeed: 2 });
  await world.fake.setValue(unit, feature(world, bedroom, FEATURE_KEYS.NANOE), 0);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, { nanoe: 1 });
});

test('a refused command fails its ack', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  const ack = await world.fake.setValue(
    device(world, bedroom),
    feature(world, bedroom, FEATURE_KEYS.SWING_VERTICAL),
    AC_SWING.OFF,
  );
  assert.equal(ack.success, false);
  bedroom.offline = true;
  const off = await world.fake.setValue(
    device(world, bedroom),
    feature(world, bedroom, FEATURE_KEYS.FAN_SPEED),
    1,
  );
  assert.equal(off.success, false);
});

test('a unit the cloud cannot reach: cached status, then "not answering", then back', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  living.offline = true;
  world.clock.advance(120_000);
  await world.hub.pollAll();
  assert.equal(world.panasonic.calls.cachedStatus, 1, 'the cloud copy after a failed live read');
  const transport = () =>
    world.fake.transports
      .filter((entry) => entry.device_external_id === deviceId(world.gladys, living))
      .at(-1)?.transport;
  assert.equal(transport(), 'cloud');
  living.offlineCache = false;
  for (let i = 0; i < 3; i += 1) {
    world.clock.advance(120_000);
    await world.hub.pollAll();
  }
  assert.equal(transport(), 'unreachable');
  living.offline = false;
  world.clock.advance(20 * 60_000);
  await world.hub.pollAll();
  assert.equal(transport(), 'cloud');
});

test('a wrong password: said in Gladys, the trigger fired once, never retried alone', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, password: 'wrong' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /refuses this e-mail address or password/);
  assert.deepEqual(world.fake.sceneEvents, [
    { key: TRIGGERS.SIGN_IN_REQUIRED, data: { reason: 'password' } },
  ]);
  for (let i = 0; i < 5; i += 1) {
    world.clock.advance(60 * 60_000);
    await world.hub.pollAll();
  }
  assert.equal(world.panasonic.calls.password, 1, 'the password is not tried again and again');
  assert.equal(world.fake.sceneEvents.length, 1);

  // The user fixes it: one login, connected, devices.
  await world.fake.configUpdated({ ...CONFIG, password: PASSWORD });
  await world.hub.idle();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.fake.discoveredDevices.length, 3);
});

test('two-factor: asked, the trigger fired, then the sign-in action completes it', async (t) => {
  const panasonic = new FakePanasonic();
  panasonic.mfa = 'otp';
  const clock = createClock();
  panasonic.now = clock.now;
  const world = await createWorld({ panasonic, clock });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.fr, /code à deux facteurs/);
  assert.deepEqual(world.fake.sceneEvents.at(-1).data, { reason: 'two_factor' });

  const wrong = await world.fake.action('sign_in_code', { code: '000000' });
  assert.match(wrong.data.message.en, /refused this code/);
  const bad = await world.fake.action('sign_in_code', { code: 'abc' });
  assert.match(bad.data.message.en, /6-digit code/);
  const ok = await world.fake.action('sign_in_code', { code: ' 123 456 ' });
  assert.match(ok.data.message.en, /^Signed in\. The session is kept/);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.fake.discoveredDevices.length, 3);
});

test('new terms to accept: said, retried every 30 minutes, back once accepted', async (t) => {
  const panasonic = new FakePanasonic();
  panasonic.agreementPending = true;
  const clock = createClock();
  panasonic.now = clock.now;
  const world = await createWorld({ panasonic, clock });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /new terms of use/);
  assert.deepEqual(world.fake.sceneEvents.at(-1).data, { reason: 'terms' });
  const tries = panasonic.calls.groups;
  clock.advance(5 * 60_000);
  await world.hub.pollAll();
  assert.equal(panasonic.calls.groups, tries, 'not before 30 minutes');
  panasonic.agreementPending = false;
  clock.advance(30 * 60_000);
  await world.hub.pollAll();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('Comfort Cloud down: unreachable, the pace slows down, then back', async (t) => {
  const world = await createdWorld(t);
  world.panasonic.online = false;
  world.clock.advance(120_000);
  await world.hub.pollAll();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  const tried = world.panasonic.requests.length;
  world.clock.advance(120_000);
  await world.hub.pollAll();
  assert.equal(world.panasonic.requests.length, tried, 'skipped while backing off');
  world.panasonic.online = true;
  world.clock.advance(10 * 60_000);
  await world.hub.pollAll();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.fake.sceneEvents.length, 0, 'an outage is not a sign-in problem');
});

test('a restart reuses the session from /data: no password sent', async (t) => {
  const clock = createClock();
  const panasonic = new FakePanasonic({ now: clock.now });
  const first = await createWorld({ panasonic, clock });
  await first.app.stop();
  const file = join(first.dataDir, 'panasonic-cc.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const saved = await readFile(file, 'utf8');
  assert.ok(!saved.includes(PASSWORD), 'the password is never written');

  clock.advance(2 * 3600_000);
  const second = await createWorld({ panasonic, clock, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.equal(panasonic.calls.password, 1);
  assert.equal(panasonic.calls.refresh, 1);
  assert.deepEqual(second.fake.connectionStatus, { connected: true });
});

test('another account forgets the saved session', async (t) => {
  const clock = createClock();
  const panasonic = new FakePanasonic({ now: clock.now });
  const first = await createWorld({ panasonic, clock });
  await first.app.stop();
  panasonic.username = 'other@example.com';
  const second = await createWorld({
    panasonic,
    clock,
    dataDir: first.dataDir,
    config: { ...CONFIG, username: 'other@example.com' },
  });
  t.after(() => second.app.stop());
  assert.equal(panasonic.calls.password, 2);
});

test('energy: today and a counter that only goes up, across days and months', async (t) => {
  const clock = createClock(new Date(2026, 9, 30, 22, 0).getTime());
  const panasonic = new FakePanasonic({ now: clock.now });
  const [living] = panasonic.units;
  living.consumption = { 20261029: 3, 20261030: 1 };
  const world = await createdWorld(t, { panasonic, clock });
  const today = featureId(world.gladys, living, FEATURE_KEYS.ENERGY_TODAY);
  const total = featureId(world.gladys, living, FEATURE_KEYS.ENERGY_TOTAL);
  assert.equal(world.fake.lastState(today), 1);
  const start = world.fake.lastState(total);
  assert.ok(start > 4);

  // Later the same day: today grows, so does the counter.
  living.consumption['20261030'] = 1.5;
  clock.advance(6 * 60_000);
  await world.hub.pollAll();
  assert.equal(world.fake.lastState(today), 1.5);
  assert.equal(world.fake.lastState(total), start + 0.5);

  // A lower value later (a correction) never lowers the counter.
  living.consumption['20261030'] = 1.2;
  clock.advance(6 * 60_000);
  await world.hub.pollAll();
  assert.equal(world.fake.lastState(total), start + 0.5);

  // Next month: the last day of October is read once more, then November.
  living.consumption['20261031'] = 2;
  living.consumption['20261101'] = 0.25;
  clock.set(new Date(2026, 10, 1, 0, 30).getTime());
  await world.hub.pollAll();
  assert.equal(world.fake.lastState(today), 0.25);
  assert.equal(world.fake.lastState(total), start + 0.5 + 2 + 0.25);
});

test('energy history is read at most every 5 minutes', async (t) => {
  const world = await createdWorld(t);
  const before = world.panasonic.calls.history;
  world.clock.advance(60_000);
  await world.hub.pollAll({ force: true });
  assert.equal(world.panasonic.calls.history, before);
  world.clock.advance(5 * 60_000);
  await world.hub.pollAll({ force: true });
  assert.equal(world.panasonic.calls.history, before + 2, 'the two units with energy');
});

test('the scene action applies mode, setpoint, fan and special mode in one call', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  bedroom.status.parameters.operate = 0;
  await world.hub.pollAll({ force: true });
  const ack = await world.fake.sceneAction('apply_preset', {
    device: deviceId(world.gladys, bedroom),
    mode: '2',
    target_temperature: '21,5',
    fan_speed: '1',
    special_mode: 'quiet',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { target_temperature: 21.5 });
  assert.equal(world.panasonic.calls.control, 1);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, {
    operate: 1,
    operationMode: 3,
    temperatureSet: 21.5,
    fanSpeed: 1,
    ecoMode: 2,
  });
  const bad = await world.fake.sceneAction('apply_preset', {
    device: deviceId(world.gladys, bedroom),
    target_temperature: 'warm',
  });
  assert.equal(bad.success, false);
  const office = world.panasonic.units[2];
  const none = await world.fake.sceneAction('apply_preset', {
    device: deviceId(world.gladys, office),
    special_mode: 'powerful',
  });
  assert.equal(none.success, false, 'no powerful mode on this unit');
});

test('the search action lists the units', async (t) => {
  const world = await createdWorld(t);
  world.panasonic.units[2].offline = true;
  world.panasonic.units[2].offlineCache = false;
  const ack = await world.fake.action('refresh', {});
  assert.equal(ack.success, true);
  const { message } = ack.data;
  assert.match(message.en, /3 air conditioner\(s\)/);
  assert.match(message.fr, /- Living room \(CS-Z25XKEW\): répond/);
  assert.match(message.de, /1 andere\(s\) Panasonic-Gerät/);
  const notConfigured = await createWorld({ config: {} });
  t.after(() => notConfigured.app.stop());
  const empty = await notConfigured.fake.action('refresh', {});
  assert.match(empty.data.message.en, /Enter the e-mail address/);
  assert.match(notConfigured.fake.connectionStatus.message.es, /Panasonic ID/);
});

test('a reconnection to Gladys publishes everything again', async (t) => {
  const world = await createdWorld(t);
  const count = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  await world.hub.idle();
  assert.ok(world.fake.states.length > count, 'states sent again');
});
