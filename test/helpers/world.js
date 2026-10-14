// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake Panasonic cloud and a
// temporary /data, with the integration wired on top through
// registerHandlers. No timer runs: the tests read the units with
// `world.hub.pollAll()` and move the clock with `world.clock.advance()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { DEVICE_TYPE } from '../../src/devices.js';
import { ComfortCloud } from '../../src/panasonic/cloud.js';
import { createHttp } from '../../src/panasonic/http.js';
import { Store } from '../../src/store.js';
import { FakePanasonic, PASSWORD, USERNAME, VECTORS, unitId } from './fakePanasonic.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const CONFIG = { username: USERNAME, password: PASSWORD, language: 'en' };

/** A clock the tests move by hand (starts on a fixed mid-month day). */
export function createClock(start = new Date(2026, 9, 14, 10, 0, 0).getTime()) {
  let now = start;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
    set(ms) {
      now = ms;
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.panasonic] a FakePanasonic (default: three units)
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.created] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir]
 * @param {object} [options.clock]
 */
export async function createWorld({
  clock = createClock(),
  panasonic,
  config = CONFIG,
  created = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-panasonic-cc-')),
  timings = {},
} = {}) {
  const cloud = panasonic ?? new FakePanasonic({ now: clock.now });
  const gladys = createFakeGladys({ config, devices: created });
  const clouds = [];
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    timers: false,
    timings,
    now: clock.now,
    createCloud: (options) => {
      const client = new ComfortCloud({
        ...options,
        request: createHttp({ fetch: cloud.fetch, timeoutMs: 1000 }),
        sleep: async () => {},
        now: clock.now,
      });
      clouds.push(client);
      return client;
    },
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return {
    gladys,
    fake: gladys.fake,
    panasonic: cloud,
    app,
    hub: app.hub,
    clock,
    clouds,
    dataDir,
  };
}

export const deviceId = (gladys, unit) => gladys.externalIds(DEVICE_TYPE, unitId(unit.guid)).device;
export const featureId = (gladys, unit, key) =>
  gladys.externalIds(DEVICE_TYPE, unitId(unit.guid)).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  await world.hub.idle();
}

export { FakePanasonic, PASSWORD, USERNAME, VECTORS };
