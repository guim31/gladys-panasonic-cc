#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only check of the real Panasonic cloud, outside the tests (which never
// touch the network). The login is what breaks most often when Panasonic
// changes something: this runs the real client step by step.
//
//   node scripts/probe.mjs
//       Reads the application version from the stores, then runs the whole
//       login with an invented account until Panasonic refuses it: proves the
//       authorize redirect, the login page and its _csrf cookie, and the
//       credentials endpoint still answer as the client expects.
//
//   PANASONIC_USERNAME=... PANASONIC_PASSWORD=... node scripts/probe.mjs --account [--otp 123456]
//       Logs in with a real account, lists its units, reads (never writes)
//       the status and the energy history of each. The session is not saved.
//
// Nothing sensitive is printed: no password, token, cookie, code, query
// string, guid or serial number; unit names are shortened.
// -----------------------------------------------------------------------------

import { parseArgs } from 'node:util';
import { fetchStoreVersion } from '../src/panasonic/appversion.js';
import { ComfortCloud } from '../src/panasonic/cloud.js';
import { createHttp } from '../src/panasonic/http.js';
import { parseGroups, parseHistory, parseStatus } from '../src/panasonic/status.js';

const { values } = parseArgs({
  options: {
    account: { type: 'boolean', default: false },
    otp: { type: 'string' },
    'app-version': { type: 'string', default: '' },
  },
});

const say = (line) => process.stdout.write(`${line}\n`);
const short = (text) => (text.length > 3 ? `${text.slice(0, 2)}…` : '…');

// Every request, as "METHOD host/path -> status (location host/path)".
const http = createHttp();
const request = async (url, options = {}) => {
  const answer = await http(url, options);
  const where = (link) => {
    try {
      const parsed = new URL(link);
      return `${parsed.protocol === 'https:' ? '' : `${parsed.protocol}//`}${parsed.host}${parsed.pathname}`;
    } catch {
      return '?';
    }
  };
  const cookies =
    typeof answer.headers.getSetCookie === 'function'
      ? answer.headers
          .getSetCookie()
          .map((line) => line.split('=')[0])
          .join(', ')
      : '';
  say(
    `  ${options.method ?? 'GET'} ${where(url)} -> ${answer.status}` +
      (answer.location ? ` (to ${where(answer.location)})` : '') +
      (cookies ? ` [cookies: ${cookies}]` : ''),
  );
  return answer;
};

async function probeLogin() {
  const version = await fetchStoreVersion(request);
  say(`app version from the stores: ${version ?? 'not found'}`);
  const cloud = new ComfortCloud({
    username: `gladys-probe-${Date.now()}@example.com`,
    password: 'not-a-real-password-1A!',
    request,
    appVersion: values['app-version'],
  });
  say('login with an invented account:');
  try {
    await cloud.login();
    say('unexpected: the invented account was accepted');
    process.exitCode = 1;
  } catch (err) {
    const expected = err.kind === 'credentials';
    say(`${expected ? 'OK, refused as expected' : 'FAILED'}: ${err.kind}: ${err.message}`);
    if (!expected) process.exitCode = 1;
  }
}

async function probeAccount() {
  const username = process.env.PANASONIC_USERNAME;
  const password = process.env.PANASONIC_PASSWORD;
  if (!username || !password) {
    say('set PANASONIC_USERNAME and PANASONIC_PASSWORD');
    process.exitCode = 1;
    return;
  }
  const cloud = new ComfortCloud({
    username,
    password,
    request,
    appVersion: values['app-version'],
  });
  if (values.otp) {
    await cloud.login(values.otp);
  }
  const { units, others } = parseGroups(await cloud.getGroups());
  say(`${units.length} air conditioner(s), ${others.length} other appliance(s)`);
  for (const unit of units) {
    say(`unit ${short(unit.name)} model ${unit.model || '?'} type ${unit.deviceType ?? '?'}:`);
    const body = await cloud.getStatus(unit.guid);
    const { capabilities, state } = parseStatus(body, unit.deviceType);
    say(`  status keys: ${Object.keys(body).sort().join(', ')}`);
    say(
      `  parameters keys: ${Object.keys(body.parameters ?? {})
        .sort()
        .join(', ')}`,
    );
    say(`  capabilities: ${JSON.stringify(capabilities)}`);
    say(`  state: ${JSON.stringify(state)}`);
    try {
      const history = await cloud.getMonthHistory(unit.guid);
      const days = parseHistory(history);
      const first = history.historyDataList?.[0] ?? {};
      say(`  history keys: ${Object.keys(history).sort().join(', ')}`);
      say(`  history item keys: ${Object.keys(first).sort().join(', ')}`);
      say(`  days with a consumption this month: ${Object.keys(days).length}`);
    } catch (err) {
      say(`  history: ${err.message}`);
    }
  }
}

try {
  if (values.account) {
    await probeAccount();
  } else {
    await probeLogin();
  }
} catch (err) {
  say(`failed: ${err.kind ?? 'error'}: ${err.message}`);
  process.exitCode = 1;
}
