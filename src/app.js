// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake) and
// returns the hub, so index.js stays a few lines and the tests drive the very
// same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { PanasonicHub } from './hub.js';
import { SCENE_ACTIONS } from './scenes.js';
import { Store } from './store.js';
import { CONNECTION_TEXT, INIT_FAILED, SIGN_IN_TEXT, refreshMessage } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'panasonic-cc-app' });

export const ACTIONS = { REFRESH: 'refresh', SIGN_IN_CODE: 'sign_in_code' };

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, timers, timings, createCloud, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new PanasonicHub({
    gladys,
    store: options.store ?? new Store(),
    timers: options.timers ?? true,
    timings: options.timings,
    createCloud: options.createCloud,
    now: options.now,
  });

  // Resolved once the hub has started; every handler waits for it, so a
  // command arriving during the first sign-in is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): re-sync what Gladys may have lost.
        await hub.resync(config);
        return;
      }
      started = true;
      await hub.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.refresh()));

  gladys.onSetValue(whenReady((device, feature, value) => hub.setValue(device, feature, value)));

  // Fallback of the container's own timer (src/hub.js), skipped while it runs.
  gladys.onPoll(whenReady((device) => hub.pollFromCore(device)));

  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      logger.info('Configuration updated');
      await hub.reconfigure(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    ACTIONS.REFRESH,
    whenReady(async () => {
      logger.info('Action: search for air conditioners');
      await hub.refresh();
      return refreshMessage(hub.summary());
    }),
  );

  gladys.onAction(
    ACTIONS.SIGN_IN_CODE,
    whenReady(async (fields = {}) => {
      logger.info('Action: sign in with a two-factor code');
      const code = String(fields.code ?? '').replace(/\s+/g, '');
      if (!/^\d{4,10}$/.test(code)) {
        return SIGN_IN_TEXT.noCode;
      }
      try {
        const outcome = await hub.signInWithCode(code);
        return outcome === 'signed-in' ? SIGN_IN_TEXT.signedIn : SIGN_IN_TEXT.notNeeded;
      } catch (err) {
        if (err.kind === 'mfa') {
          return SIGN_IN_TEXT.refused;
        }
        return CONNECTION_TEXT[err.kind] ?? CONNECTION_TEXT.unreachable;
      }
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => {
        logger.info(`Scene action: ${key}`);
        return handler(hub, { fields });
      }),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, context = {}) => {
        logger.info(`Widget action: ${actionKey}`);
        return widget.action(hub, { actionKey, params, ...context });
      }),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
