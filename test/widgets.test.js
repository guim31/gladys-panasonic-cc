// -----------------------------------------------------------------------------
// The `climate` widget: a content the core renders as sent (vocabulary and
// budget checked by the SDK's own validator), live tiles bound to features
// that exist, and buttons that do what they say.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createAll, createWorld, deviceId } from './helpers/world.js';

async function createdWorld(t, options) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createAll(world);
  return world;
}

const get = async (world, unit, language = 'en') => {
  const ack = await world.fake.widgetGet('climate', {
    settings: unit ? { device: deviceId(world.gladys, unit) } : {},
    language,
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

test('every unit, in every language, gets a content rendered as sent', async (t) => {
  const world = await createdWorld(t);
  const features = new Set(
    world.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  for (const unit of world.panasonic.units) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const content = await get(world, unit, language);
      assert.deepEqual(validateWidgetContent(content), [], `${unit.name} ${language}`);
      assert.ok(content.components.length <= 8);
      for (const component of content.components) {
        if (component.device_feature) {
          assert.ok(features.has(component.device_feature), component.device_feature);
        }
      }
    }
  }
});

test('the content says what to do without a unit, or with an unknown one', async (t) => {
  const world = await createdWorld(t);
  const none = await get(world, null, 'fr');
  assert.match(none.components[0].text, /Choisissez un climatiseur/);
  const unknown = await world.fake.widgetGet('climate', {
    settings: { device: 'ext:test-integration:ac:nope' },
    language: 'de',
  });
  assert.match(unknown.data.content.components[0].text, /noch unbekannt/);
});

test('the special mode row and form field exist only on units that have them', async (t) => {
  const world = await createdWorld(t);
  const [living, , office] = world.panasonic.units;
  const form = (content) => content.components.find((c) => c.action?.key === 'settings').action;
  const status = (content) => content.components.find((c) => c.type === 'status').items;
  const withSpecial = await get(world, living);
  assert.deepEqual(
    form(withSpecial).fields.map((field) => field.key),
    ['mode', 'fan_speed', 'special_mode'],
  );
  assert.equal(form(withSpecial).fields[2].default, 'quiet', 'the real answer is in quiet mode');
  assert.ok(status(withSpecial).some((item) => item.value === 'Quiet'));
  const without = await get(world, office);
  assert.deepEqual(
    form(without).fields.map((field) => field.key),
    ['mode', 'fan_speed'],
  );
});

test('the buttons: power toggles, setpoint steps, the form applies in one call', async (t) => {
  const world = await createdWorld(t);
  const [, bedroom] = world.panasonic.units;
  const settings = { device: deviceId(world.gladys, bedroom) };
  const off = await world.fake.widgetAction('climate', 'power', {}, { settings });
  assert.equal(off.success, true, off.error);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, { operate: 0 });

  // Off: the setpoint step is kept for the power-on, and said so.
  const up = await world.fake.widgetAction('climate', 'setpoint_up', {}, { settings });
  assert.match(up.data.message.fr, /Gardée jusqu'à l'allumage : 23 °C/);
  assert.equal(world.panasonic.calls.control, 1);

  const form = await world.fake.widgetAction(
    'climate',
    'settings',
    {},
    { settings, values: { mode: '2', fan_speed: '3', special_mode: 'powerful' } },
  );
  assert.equal(form.success, true, form.error);
  assert.deepEqual(world.panasonic.controls.at(-1).parameters, {
    temperatureSet: 23,
    operate: 1,
    operationMode: 3,
    fanSpeed: 3,
    ecoMode: 1,
  });

  const down = await world.fake.widgetAction('climate', 'setpoint_down', {}, { settings });
  assert.match(down.data.message.en, /^Setpoint: 22\.5 °C$/);

  const old = await world.fake.widgetAction('climate', 'settings', {}, { settings });
  assert.equal(old.success, false, 'a core without forms sends no values');
  const unknown = await world.fake.widgetAction('climate', 'nope', {}, { settings });
  assert.equal(unknown.success, false);
});

test('a sign-in problem shows in the widget', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  world.panasonic.revokeAll();
  world.panasonic.password = 'changed';
  world.clock.advance(31 * 60_000);
  await world.hub.pollAll();
  const content = await get(world, living, 'es');
  const items = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(items[0].value, 'inicio de sesión necesario');
});
