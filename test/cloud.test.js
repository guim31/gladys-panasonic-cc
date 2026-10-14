// -----------------------------------------------------------------------------
// The Comfort Cloud client: the computations checked against what
// aio-panasonic-comfort-cloud itself produces (test/fixtures/
// reference-vectors.json), and the login, refresh and API calls against the
// fake Panasonic cloud.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ComfortCloud,
  apiKey,
  appTimestamp,
  codeChallenge,
  historyDate,
  randomString,
  tokenExpiry,
  utcOffset,
} from '../src/panasonic/cloud.js';
import { parseAppBrain, parsePlayStore, compareVersions } from '../src/panasonic/appversion.js';
import { guardianConfig, hiddenInputs, unescapeJs } from '../src/panasonic/html.js';
import { CookieJar, createHttp, refusalDetails } from '../src/panasonic/http.js';
import { FakePanasonic, PASSWORD, USERNAME, VECTORS } from './helpers/fakePanasonic.js';
import { createClock } from './helpers/world.js';

function client(panasonic, clock, options = {}) {
  const saved = [];
  const cloud = new ComfortCloud({
    username: USERNAME,
    password: PASSWORD,
    request: createHttp({ fetch: panasonic.fetch, timeoutMs: 1000 }),
    sleep: async () => {},
    now: clock.now,
    save: (session) => saved.push(session),
    ...options,
  });
  return { cloud, saved };
}

function world(options) {
  const clock = createClock();
  const panasonic = new FakePanasonic({ now: clock.now });
  return { clock, panasonic, ...client(panasonic, clock, options) };
}

// --- Computations, against the reference ---------------------------------------

test('x-cfc-api-key matches the reference for every vector', () => {
  for (const { timestamp, token, key } of VECTORS.apiKey) {
    assert.equal(apiKey(timestamp, token), key, `${timestamp} / ${token.slice(0, 8)}`);
  }
});

test('the PKCE challenge matches the reference', () => {
  for (const { verifier, challenge } of VECTORS.pkce) {
    assert.equal(codeChallenge(verifier), challenge);
  }
  assert.match(randomString(43), /^[A-Za-z0-9]{43}$/);
  assert.notEqual(randomString(43), randomString(43));
});

test('the hidden fields of the callback form match BeautifulSoup', () => {
  assert.deepEqual(hiddenInputs(VECTORS.hiddenInputs.html), VECTORS.hiddenInputs.parameters);
  assert.deepEqual(hiddenInputs('<p>no form</p>'), {});
});

test('the Guardian two-factor configuration matches the reference', () => {
  assert.deepEqual(guardianConfig(VECTORS.guardian.html), VECTORS.guardian.config);
  assert.equal(guardianConfig('<html>nothing</html>'), VECTORS.guardian.none);
  assert.equal(
    unescapeJs(VECTORS.guardian.config.postActionURL),
    'https://authglb.digital.panasonic.com/login/callback?state=abc&x=1',
  );
});

test('timestamps, offsets and dates are written like the application', () => {
  const date = new Date(2026, 0, 5, 7, 8, 9);
  assert.equal(appTimestamp(date), '2026-01-05 07:08:09');
  assert.equal(historyDate(date), '20260105');
  assert.match(utcOffset(date), /^[+-]\d\d:\d\d$/);
  assert.equal(ComfortCloud.pathGuid('S-60PU2E5B/0123+456'), 'S-60PU2E5Bf0123%2B456');
});

test('the application version is read from Google Play, AppBrain as a fallback', () => {
  assert.equal(parsePlayStore('x,[["1.22.4"]],y'), '1.22.4');
  assert.equal(parsePlayStore('nothing'), null);
  assert.equal(
    parseAppBrain('<meta itemprop="softwareVersion" content="1.23.0"><meta name="x">'),
    '1.23.0',
  );
  assert.equal(parseAppBrain('<meta content="1.0" name="other">'), null);
  assert.ok(compareVersions('1.22.10', '1.22.4') > 0);
  assert.equal(compareVersions('1.22', '1.22.0'), 0);
});

test('a refusal keeps its code and message, never the rest of the answer', () => {
  assert.deepEqual(
    refusalDetails('{"code":4106,"message":"New version","access_token":"secret"}'),
    { code: '4106', message: 'New version' },
  );
  assert.deepEqual(refusalDetails('<html>secret</html>'), {});
});

test('the cookie jar keeps, sends and expires cookies per host', () => {
  const jar = new CookieJar();
  const headers = new Headers();
  headers.append('set-cookie', '_csrf=abc; Path=/x; HttpOnly');
  headers.append('set-cookie', 'did=1; Max-Age=60');
  jar.store('https://authglb.digital.panasonic.com/login', headers);
  assert.equal(jar.get('https://authglb.digital.panasonic.com/', '_csrf'), 'abc');
  assert.equal(jar.header('https://authglb.digital.panasonic.com/y'), '_csrf=abc; did=1');
  assert.equal(jar.header('https://other.example.com/'), undefined);
  const gone = new Headers({ 'set-cookie': 'did=; Max-Age=0' });
  jar.store('https://authglb.digital.panasonic.com/', gone);
  assert.equal(jar.header('https://authglb.digital.panasonic.com/'), '_csrf=abc');
});

// --- Login and API ---------------------------------------------------------------

test('login: authorize, login page, credentials, callback, resume, token, client id', async () => {
  const { cloud, panasonic, saved } = world();
  const groups = await cloud.getGroups();
  assert.equal(groups.groupList[0].deviceList.length, 4);
  for (const step of ['authorize', 'loginPage', 'password', 'callback', 'resume', 'token']) {
    assert.equal(panasonic.calls[step], 1, step);
  }
  assert.equal(panasonic.calls.clientId, 1);
  const session = saved.at(-1);
  assert.ok(session.accessToken && session.refreshToken && session.clientId);
  assert.equal(session.appVersion, '1.22.4', 'read from Google Play');
  // The session never holds the password.
  for (const entry of saved) {
    assert.ok(!JSON.stringify(entry).includes(PASSWORD));
  }
  assert.ok(tokenExpiry(session.accessToken) > Date.now() - 365 * 24 * 3600_000);
});

test('a saved session is refreshed, never logged in again with the password', async () => {
  const first = world();
  await first.cloud.getGroups();
  const session = first.saved.at(-1);
  first.clock.advance(2 * 3600_000); // the access token expired
  const { cloud } = client(first.panasonic, first.clock, { session });
  await cloud.getGroups();
  assert.equal(first.panasonic.calls.password, 1, 'one login only');
  assert.equal(first.panasonic.calls.refresh, 1);
});

test('a revoked refresh token falls back to a new login', async () => {
  const { cloud, panasonic, clock } = world();
  await cloud.getGroups();
  panasonic.revokeAll();
  clock.advance(2 * 3600_000);
  await cloud.getGroups();
  assert.equal(panasonic.calls.password, 2);
});

test('a token refused before its expiry is renewed once', async () => {
  const { cloud, panasonic } = world();
  await cloud.getGroups();
  panasonic.expireAccessTokens();
  await cloud.getGroups();
  assert.equal(panasonic.calls.refresh, 1);
  assert.equal(panasonic.calls.groups, 2, 'answered after the renewal');
});

test('a wrong password is a credentials error, sent once', async () => {
  const { cloud, panasonic } = world({ password: 'wrong' });
  await assert.rejects(cloud.getGroups(), (err) => err.kind === 'credentials');
  assert.equal(panasonic.calls.password, 1);
  assert.equal(panasonic.calls.groups, undefined);
});

test('two-factor (Universal Login): asked, then completed with the code', async () => {
  const { cloud, panasonic } = world();
  panasonic.mfa = 'otp';
  await assert.rejects(cloud.getGroups(), (err) => err.kind === 'mfa');
  await assert.rejects(cloud.login('999999'), (err) => err.kind === 'mfa');
  await cloud.login('123 456');
  await cloud.getGroups();
  assert.equal(panasonic.calls.groups, 1);
});

test('two-factor (Guardian page): start, verify, state, signed callback', async () => {
  const { cloud, panasonic } = world();
  panasonic.mfa = 'guardian';
  await assert.rejects(cloud.getGroups(), (err) => err.kind === 'mfa');
  await assert.rejects(cloud.login('000000'), (err) => err.kind === 'mfa');
  await cloud.login('123456');
  await cloud.getGroups();
  assert.equal(panasonic.calls.groups, 1);
});

test('error 4106: the version is read again from the store and the call retried', async () => {
  const { cloud, panasonic, saved } = world();
  await cloud.getGroups();
  panasonic.minVersion = '1.23.0';
  panasonic.storeVersion = '1.23.1';
  await cloud.getGroups();
  assert.equal(saved.at(-1).appVersion, '1.23.1');
  assert.equal(panasonic.calls.store, 2);
});

test('error 4106 with the stores out of reach is a version error; a pinned version works', async () => {
  const { cloud, panasonic } = world();
  panasonic.minVersion = '9.0.0';
  panasonic.storeReachable = false;
  await assert.rejects(cloud.getGroups(), (err) => err.kind === 'version');
  assert.ok(panasonic.calls.appbrain >= 1, 'AppBrain tried after Google Play');

  const pinned = client(panasonic, createClock(), { appVersion: '9.0.1' });
  await pinned.cloud.getGroups();
  assert.equal(panasonic.calls.store, 2, 'a pinned version reads no store');
});

test('new terms to accept (4103) are an agreement error', async () => {
  const { cloud, panasonic } = world();
  panasonic.agreementPending = true;
  await assert.rejects(cloud.getGroups(), (err) => err.kind === 'agreement');
});

test('Comfort Cloud out of reach is a network error', async () => {
  const { cloud, panasonic } = world();
  panasonic.online = false;
  await assert.rejects(cloud.getGroups(), (err) => err.kind === 'network');
});

test('status, cached status, control and history reach the right unit', async () => {
  const { cloud, panasonic } = world();
  const office = panasonic.units[2];
  assert.equal((await cloud.getStatus(office.guid)).parameters.operate, 1);
  assert.equal((await cloud.getCachedStatus(office.guid)).parameters.operate, 1);
  await cloud.control(office.guid, { operate: 0 });
  assert.deepEqual(panasonic.controls, [{ guid: office.guid, parameters: { operate: 0 } }]);
  const history = await cloud.getMonthHistory(panasonic.units[0].guid);
  assert.ok(history.historyDataList.length >= 28);
});

test('one call at a time, like the application', async () => {
  const { cloud, panasonic } = world();
  await cloud.getGroups();
  let running = 0;
  let most = 0;
  const original = panasonic.fetch;
  panasonic.fetch = async (...args) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      return await original(...args);
    } finally {
      running -= 1;
    }
  };
  const fresh = client(panasonic, createClock(), { session: cloud.session });
  const guids = panasonic.units.map((unit) => unit.guid);
  await Promise.all(guids.map((guid) => fresh.cloud.getStatus(guid)));
  assert.equal(most, 1);
});
