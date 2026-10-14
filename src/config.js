// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { isVersion } from './panasonic/appversion.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two readings of every unit (`poll_interval` options). The
// reference reads every 2 minutes; Comfort Cloud is slow and throttles.
export const POLL_INTERVALS = [60, 120, 300, 600];

export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  poll_interval: '120',
  language: 'fr',
  app_version: '',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const interval = Number(source.poll_interval ?? DEFAULT_CONFIG.poll_interval);
  const appVersion = text(source.app_version);
  return {
    username: text(source.username),
    // A password may start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    pollSeconds: POLL_INTERVALS.includes(interval)
      ? interval
      : Number(DEFAULT_CONFIG.poll_interval),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
    appVersion: isVersion(appVersion) ? appVersion : '',
  };
}

export const isConfigured = (config) => Boolean(config.username && config.password);
