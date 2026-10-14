// -----------------------------------------------------------------------------
// What the container writes: at the default level (info), the life of the
// account, of the units and of Gladys, never one line per reading, a repeated
// failure once; at any level, never a password, a token or a two-factor code.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS } from '../src/devices.js';
import {
  CONFIG,
  FakePanasonic,
  PASSWORD,
  createAll,
  createClock,
  createWorld,
  featureId,
} from './helpers/world.js';

/**
 * The log lines written on stdout and stderr while `fn` runs, at `level`.
 * Anything else (the test runner's own reports) goes through untouched.
 */
async function capture(t, fn, level = 'info') {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const intercept = (stream) => {
    const original = stream.write.bind(stream);
    return t.mock.method(stream, 'write', (chunk, ...rest) => {
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      if (!/^\[\d{4}-\d\d-\d\dT/.test(text)) {
        return original(chunk, ...rest);
      }
      lines.push(...text.split('\n').filter(Boolean));
      return true;
    });
  };
  const stdout = intercept(process.stdout);
  const stderr = intercept(process.stderr);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = previous;
  }
  return lines;
}

async function createdWorld(t, options) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createAll(world);
  return world;
}

test('logs: normal readings, with changes, write nothing at the info level', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  const lines = await capture(t, async () => {
    for (const temperature of [21.5, 22, 22.5, 22.5]) {
      living.status.parameters.insideTemperature = temperature;
      world.clock.advance(6 * 60_000);
      await world.hub.pollAll();
    }
    world.clock.advance(31 * 60_000);
    await world.hub.pollAll();
    await world.hub.idle();
  });
  assert.equal(
    world.fake.lastState(featureId(world.gladys, living, FEATURE_KEYS.INDOOR_TEMPERATURE)),
    22.5,
  );
  assert.deepEqual(lines, []);
});

test('logs: a user command writes one info line', async (t) => {
  const world = await createdWorld(t);
  const [device] = world.fake.discoveredDevices;
  const lines = await capture(t, async () => {
    await world.fake.setValue(device, device.features[0], 0);
    await world.hub.idle();
  });
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[INFO\].*Command: "Living room" power = 0/);
});

test('logs: Gladys refusing the states at every reading is said once, and its return once', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  const refusal = t.mock.method(world.gladys, 'publishChangedStates', async () => {
    throw new GladysApiError(503, 'SERVICE_UNAVAILABLE', 'Gladys is restarting');
  });
  const failing = await capture(t, async () => {
    for (const temperature of [20, 21, 22, 23]) {
      living.status.parameters.insideTemperature = temperature;
      world.clock.advance(3 * 60_000);
      await world.hub.pollAll();
    }
    await world.hub.idle();
  });
  assert.equal(failing.length, 1, failing.join('\n'));
  assert.match(
    failing[0],
    /\[WARN\].*Gladys does not take the Panasonic updates: Gladys is restarting/,
  );

  refusal.mock.restore();
  const back = await capture(t, async () => {
    world.clock.advance(3 * 60_000);
    await world.hub.pollAll();
    world.clock.advance(3 * 60_000);
    await world.hub.pollAll();
  });
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*Gladys takes the Panasonic updates again/);
});

test('logs: Comfort Cloud down then back writes one line each, not one per cycle', async (t) => {
  const world = await createdWorld(t);
  const lines = await capture(t, async () => {
    world.panasonic.online = false;
    for (let i = 0; i < 6; i += 1) {
      world.clock.advance(10 * 60_000);
      await world.hub.pollAll();
    }
    world.panasonic.online = true;
    for (let i = 0; i < 3; i += 1) {
      world.clock.advance(10 * 60_000);
      await world.hub.pollAll();
    }
  });
  assert.equal(lines.length, 3, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*Comfort Cloud does not answer/);
  assert.match(lines[1], /\[INFO\].*Comfort Cloud answers again/);
  assert.match(lines[2], /\[INFO\].*Signed in to Panasonic Comfort Cloud: 3 air conditioner/);
});

test('logs: a unit lost then back writes one line each', async (t) => {
  const world = await createdWorld(t);
  const [living] = world.panasonic.units;
  const lines = await capture(t, async () => {
    living.offline = true;
    living.offlineCache = false;
    for (let i = 0; i < 5; i += 1) {
      world.clock.advance(3 * 60_000);
      await world.hub.pollAll();
    }
    living.offline = false;
    for (let i = 0; i < 3; i += 1) {
      world.clock.advance(20 * 60_000);
      await world.hub.pollAll();
    }
  });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /"Living room" no longer answers/);
  assert.match(lines[1], /"Living room" answers again/);
});

test('logs: no password, token or two-factor code at any level', async (t) => {
  const clock = createClock();
  const panasonic = new FakePanasonic({ now: clock.now });
  panasonic.mfa = 'otp';
  const lines = await capture(
    t,
    async () => {
      const world = await createWorld({ panasonic, clock });
      t.after(() => world.app.stop());
      await world.fake.action('sign_in_code', { code: '000000' });
      await world.fake.action('sign_in_code', { code: panasonic.otp });
      await createAll(world);
      clock.advance(2 * 3600_000);
      await world.hub.pollAll();
      const [device] = world.fake.discoveredDevices;
      await world.fake.setValue(device, device.features[0], 1);
      // Wrong password, then right again.
      await world.fake.configUpdated({ ...CONFIG, password: 'An0ther-Secret' });
      panasonic.revokeAll();
      await world.fake.action('refresh', {});
      await world.fake.configUpdated(CONFIG);
      await world.app.stop();
    },
    'debug',
  );
  assert.ok(lines.length >= 5, `debug lines were written: ${JSON.stringify(lines)}`);
  const secrets = [
    PASSWORD,
    'An0ther-Secret',
    panasonic.otp,
    ...panasonic.accessTokens.keys(),
    ...panasonic.refreshTokens,
    ...panasonic.mfaTokens,
  ];
  for (const line of lines) {
    for (const secret of secrets) {
      assert.ok(!line.includes(secret), `secret in: ${line}`);
    }
    assert.ok(!/refresh-\d+|eyJ[\w-]+\.eyJ/.test(line), `token in: ${line}`);
  }
});
