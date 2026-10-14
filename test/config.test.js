// -----------------------------------------------------------------------------
// The configuration as the code sees it: typed, trimmed, defaults applied.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('defaults when nothing is configured', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, {
    username: '',
    password: '',
    pollSeconds: 120,
    language: 'fr',
    appVersion: '',
  });
  assert.equal(isConfigured(config), false);
  assert.equal(normalizeConfig(DEFAULT_CONFIG).pollSeconds, 120);
});

test('values are typed and checked', () => {
  const config = normalizeConfig({
    username: '  someone@example.com ',
    password: ' spaced password ',
    poll_interval: '300',
    language: 'de',
    app_version: ' 1.22.4 ',
  });
  assert.deepEqual(config, {
    username: 'someone@example.com',
    password: ' spaced password ',
    pollSeconds: 300,
    language: 'de',
    appVersion: '1.22.4',
  });
  assert.equal(isConfigured(config), true);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollSeconds, 120);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
  assert.equal(normalizeConfig({ app_version: 'latest' }).appVersion, '');
  assert.equal(isConfigured(normalizeConfig({ username: 'a@b.c' })), false);
});
