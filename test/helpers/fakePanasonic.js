// -----------------------------------------------------------------------------
// A fake Panasonic cloud, as a `fetch`: the Auth0 login of the Android
// application (authorize, login page and its _csrf cookie, credentials,
// callback form, resume, token, refresh, both two-factor flavours), the
// Comfort Cloud API (signed headers checked, client id, version 4106, terms
// 4103) and the units behind it.
//
// The unit statuses come from test/fixtures/reference-vectors.json: the first
// is a real /deviceStatus answer (aio-panasonic-comfort-cloud's testdata.py),
// the others variants of it, each parsed by the reference client itself. The
// list and history answers are rebuilt from the fields the reference reads.
// Identifiers (guids, serials) are invented.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { apiKey, codeChallenge } from '../../src/panasonic/cloud.js';
import { ACC_BASE, APP_CLIENT_ID, AUTH_BASE, REDIRECT_URI } from '../../src/panasonic/constants.js';

export const VECTORS = JSON.parse(
  readFileSync(new URL('../fixtures/reference-vectors.json', import.meta.url), 'utf8'),
);

export const USERNAME = 'someone@example.com';
export const PASSWORD = 'Sup3r-Secret-Passw0rd';

const clone = (value) => structuredClone(value);

/** Three indoor units: real answer, Etherea-like with nanoe, ducted without sensors. */
export function defaultUnits() {
  const office = clone(VECTORS.devices.ducted.status);
  Object.assign(office, { powerfulMode: false, quietMode: false, summerHouse: 0 });
  office.parameters.outTemperature = 126;
  return [
    {
      guid: 'CS-Z25XKEW+4954061234',
      name: 'Living room',
      model: 'CS-Z25XKEW',
      deviceType: '3',
      status: clone(VECTORS.devices.real.status),
      energy: true,
    },
    {
      guid: 'CS-TZ35ZKEW+5012345678',
      name: 'Bedroom',
      model: 'CS-TZ35ZKEW',
      deviceType: '1',
      status: clone(VECTORS.devices['cool-nanoe'].status),
      energy: true,
    },
    {
      guid: 'S-60PU2E5B/0123456789',
      name: 'Office',
      model: 'S-60PU2E5B',
      deviceType: '5',
      status: office,
      energy: false,
    },
  ];
}

const pad = (number) => String(number).padStart(2, '0');
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const html = (status, body, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });
const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location, ...headers } });

function cookies(request) {
  const found = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) {
      found[part.slice(0, at).trim()] = part.slice(at + 1).trim();
    }
  }
  return found;
}

export class FakePanasonic {
  /**
   * @param {object} [options]
   * @param {object[]} [options.units]
   * @param {() => number} [options.now] the clock the tokens are dated with
   */
  constructor({ units = defaultUnits(), now = () => Date.now() } = {}) {
    this.units = units;
    this.now = now;
    this.username = USERNAME;
    this.password = PASSWORD;
    /** null, 'otp' (Universal Login) or 'guardian' */
    this.mfa = null;
    this.otp = '123456';
    this.minVersion = '1.21.0';
    this.storeVersion = '1.22.4';
    this.storeReachable = true;
    this.agreementPending = false;
    this.online = true;
    this.tokenLifetime = 3600;
    this.others = [
      {
        deviceGuid: '0080A7B8C9D0E1F2+AQUAREA',
        deviceType: '2',
        deviceName: 'Heat pump',
        deviceModuleNumber: 'WH-MDC05J3E5',
      },
    ];
    this.requests = [];
    this.calls = {};
    this.controls = [];
    this.sessions = new Map(); // state -> { challenge, user }
    this.codes = new Map(); // code -> challenge
    this.accessTokens = new Map(); // token -> exp (ms)
    this.refreshTokens = new Set();
    this.clientIds = new Set();
    this.mfaTokens = new Set();
    this.counter = 0;
    this.fetch = (url, init) => this.handle(new Request(url, init));
  }

  count(name) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  next(prefix) {
    this.counter += 1;
    return `${prefix}${this.counter}`;
  }

  unit(guid) {
    return this.units.find((unit) => unit.guid === guid);
  }

  /** Revoke every token: the next call needs a new login. */
  revokeAll() {
    this.accessTokens.clear();
    this.refreshTokens.clear();
  }

  expireAccessTokens() {
    this.accessTokens.clear();
  }

  issueTokens() {
    const exp = this.now() + this.tokenLifetime * 1000;
    const access = `${b64({ alg: 'RS256' })}.${b64({ exp: Math.floor(exp / 1000), n: this.next('a') })}.c2ln`;
    const refresh = this.next('refresh-');
    this.accessTokens.set(access, exp);
    this.refreshTokens.add(refresh);
    return {
      access_token: access,
      refresh_token: refresh,
      id_token: 'id.token.x',
      scope: 'openid offline_access comfortcloud.control a2w.control',
      expires_in: this.tokenLifetime,
      token_type: 'Bearer',
    };
  }

  async handle(request) {
    const url = new URL(request.url);
    const body = ['POST', 'PUT'].includes(request.method) ? await request.text() : '';
    this.requests.push({ method: request.method, url: request.url, body });
    if (!this.online) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (url.origin === AUTH_BASE) {
      return this.auth(request, url, body);
    }
    if (url.origin === ACC_BASE) {
      return this.api(request, url, body);
    }
    if (url.origin === 'https://mfa.example.com') {
      return this.guardian(request, url, body);
    }
    if (url.hostname === 'play.google.com') {
      this.count('store');
      return this.storeReachable
        ? html(200, `<script>AF_initDataCallback({data:[[["${this.storeVersion}"]]]})</script>`)
        : html(503, 'unavailable');
    }
    if (url.hostname === 'www.appbrain.com') {
      this.count('appbrain');
      return html(503, 'unavailable');
    }
    return html(404, 'not found');
  }

  // --- Auth0 -------------------------------------------------------------------

  async auth(request, url, body) {
    const path = url.pathname;
    if (path === '/authorize' && request.method === 'GET') {
      this.count('authorize');
      const params = url.searchParams;
      if (
        params.get('client_id') !== APP_CLIENT_ID ||
        params.get('redirect_uri') !== REDIRECT_URI
      ) {
        return html(400, 'bad client');
      }
      const state = params.get('state');
      this.sessions.set(state, { challenge: params.get('code_challenge') });
      return redirect(`/login?state=${state}&client=${APP_CLIENT_ID}`);
    }
    if (path === '/login' && request.method === 'GET') {
      this.count('loginPage');
      return html(200, '<html>login</html>', {
        'set-cookie': `_csrf=csrf-${url.searchParams.get('state')}; Path=/usernamepassword/login; HttpOnly; Secure`,
      });
    }
    if (path === '/usernamepassword/login') {
      this.count('password');
      const data = JSON.parse(body);
      const session = this.sessions.get(data.state);
      if (
        !session ||
        cookies(request)._csrf !== data._csrf ||
        data._csrf !== `csrf-${data.state}`
      ) {
        return json(403, { code: 'invalid_csrf', description: 'Invalid state' });
      }
      if (data.username !== this.username || data.password !== this.password) {
        return json(401, {
          name: 'ValidationError',
          code: 'invalid_user_password',
          description: 'Wrong email or password.',
          statusCode: 401,
        });
      }
      if (this.mfa === 'otp') {
        const token = this.next('mfa-');
        this.mfaTokens.add(token);
        return html(
          200,
          `<form><input type="hidden" name="mfa_token" value="${token}"><input type="hidden" name="state" value="${data.state}"></form>`,
        );
      }
      if (this.mfa === 'guardian') {
        session.guardian = this.next('req-');
        return html(
          200,
          `<script>window.__g_config = { postActionURL: "${AUTH_BASE}/guardian/callback?state=${data.state}\\u0026s=1", serviceUrl: "https://mfa.example.com", requestToken: "${session.guardian}", stateCheckingMechanism: "polling" };</script>`,
        );
      }
      return html(
        200,
        `<form method="post" name="hiddenform" action="${AUTH_BASE}/login/callback">
<input type="hidden" name="wa" value="wsignin1.0">
<input type="hidden" name="wresult" value="result-${data.state}">
<input type="hidden" name="wctx" value="{&#34;state&#34;:&#34;${data.state}&#34;}">
</form>`,
      );
    }
    if (path === '/login/callback' && request.method === 'POST') {
      this.count('callback');
      const form = new URLSearchParams(body);
      const state = JSON.parse(form.get('wctx') ?? '{}').state;
      if (form.get('wresult') !== `result-${state}` || !this.sessions.has(state)) {
        return html(400, 'bad callback');
      }
      return redirect(`/authorize/resume?state=${state}`, {
        'set-cookie': `auth0=session-${state}; Path=/; Secure; HttpOnly`,
      });
    }
    if (path === '/authorize/resume') {
      this.count('resume');
      const state = url.searchParams.get('state');
      const session = this.sessions.get(state);
      if (!session || cookies(request).auth0 !== `session-${state}`) {
        return html(400, 'no session');
      }
      const code = this.next('code-');
      this.codes.set(code, session.challenge);
      return redirect(`${REDIRECT_URI}?code=${code}&state=${state}`);
    }
    if (path === '/guardian/callback' && request.method === 'POST') {
      const form = new URLSearchParams(body);
      const state = url.searchParams.get('state');
      if (form.get('accepted') !== 'true' || form.get('signature') !== `sig-${state}`) {
        return html(400, 'bad signature');
      }
      return redirect(`/authorize/resume?state=${state}`, {
        'set-cookie': `auth0=session-${state}; Path=/; Secure; HttpOnly`,
      });
    }
    if (path === '/mfa/challenge') {
      return json(200, { challenge_type: 'otp' });
    }
    if (path === '/oauth/token') {
      const data = JSON.parse(body);
      if (data.client_id !== APP_CLIENT_ID) {
        return json(401, { error: 'access_denied' });
      }
      if (data.grant_type === 'authorization_code') {
        this.count('token');
        const challenge = this.codes.get(data.code);
        this.codes.delete(data.code);
        if (!challenge || codeChallenge(data.code_verifier) !== challenge) {
          return json(403, {
            error: 'invalid_grant',
            error_description: 'Invalid authorization code',
          });
        }
        return json(200, this.issueTokens());
      }
      if (data.grant_type === 'refresh_token') {
        this.count('refresh');
        if (!this.refreshTokens.has(data.refresh_token)) {
          return json(403, {
            error: 'invalid_grant',
            error_description: 'Unknown or invalid refresh token.',
          });
        }
        return json(200, { ...this.issueTokens(), refresh_token: undefined });
      }
      if (data.grant_type === 'http://auth0.com/oauth/grant-type/mfa-otp') {
        this.count('otp');
        if (!this.mfaTokens.has(data.mfa_token) || data.otp !== this.otp) {
          return json(403, { error: 'invalid_grant', error_description: 'Invalid otp_code.' });
        }
        this.mfaTokens.delete(data.mfa_token);
        return json(200, this.issueTokens());
      }
    }
    return html(404, 'not found');
  }

  async guardian(request, url, body) {
    const bearer = (request.headers.get('authorization') ?? '').replace('Bearer ', '');
    const session = [...this.sessions.entries()].find(
      ([, value]) => value.guardian === bearer || value.transaction === bearer,
    );
    if (!session) {
      return json(401, { error: 'unauthorized' });
    }
    const [state, value] = session;
    if (url.pathname === '/api/start-flow') {
      value.transaction = this.next('tx-');
      return json(200, { transactionToken: value.transaction });
    }
    if (url.pathname === '/api/verify-otp') {
      this.count('otp');
      const data = JSON.parse(body);
      if (data.code !== this.otp) {
        return json(403, { error: 'invalid_otp', message: 'Invalid code' });
      }
      value.accepted = true;
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/api/transaction-state') {
      return json(
        200,
        value.accepted ? { state: 'accepted', token: `sig-${state}` } : { state: 'pending' },
      );
    }
    return json(404, {});
  }

  // --- Comfort Cloud API --------------------------------------------------------

  checkHeaders(request) {
    const headers = request.headers;
    const bearer = (headers.get('x-user-authorization-v2') ?? '').replace('Bearer ', '');
    const exp = this.accessTokens.get(bearer);
    if (!exp || exp <= this.now()) {
      return json(401, { code: 4100, message: 'Token expires' });
    }
    const timestamp = headers.get('x-app-timestamp') ?? '';
    if (headers.get('x-cfc-api-key') !== apiKey(timestamp, bearer)) {
      return json(401, { code: 4199, message: 'Invalid api key' });
    }
    if (headers.get('x-app-name') !== 'Comfort Cloud' || headers.get('x-app-type') !== '1') {
      return json(400, { code: 4000, message: 'Bad application' });
    }
    const version = headers.get('x-app-version') ?? '0';
    const [a, b, c] = version.split('.').map(Number);
    const [x, y, z] = this.minVersion.split('.').map(Number);
    if (a * 1e6 + b * 1e3 + (c ?? 0) < x * 1e6 + y * 1e3 + z) {
      return json(401, { code: 4106, message: 'New version app has been published' });
    }
    return null;
  }

  async api(request, url, body) {
    const refused = this.checkHeaders(request);
    if (refused) {
      return refused;
    }
    const path = url.pathname;
    if (path === '/auth/v2/login') {
      this.count('clientId');
      const clientId = this.next('client-');
      this.clientIds.add(clientId);
      return json(200, { clientId, result: 0 });
    }
    if (!this.clientIds.has(request.headers.get('x-client-id'))) {
      return json(401, { code: 4101, message: 'Invalid client' });
    }
    if (path === '/device/group') {
      this.count('groups');
      if (this.agreementPending) {
        return json(403, { code: 4103, message: 'Agreement is not accepted' });
      }
      return json(200, {
        groupCount: 1,
        groupList: [
          {
            groupId: 120001,
            groupName: 'My House',
            deviceList: [
              ...this.units.map((unit) => ({
                deviceGuid: unit.guid,
                deviceType: unit.deviceType,
                deviceName: unit.name,
                permission: 3,
                deviceModuleNumber: unit.model,
                summerHouse: unit.status.summerHouse,
                autoMode: unit.status.autoMode,
                coolMode: unit.status.coolMode,
                heatMode: unit.status.heatMode,
                parameters: clone(unit.status.parameters),
              })),
              ...this.others,
            ],
          },
        ],
      });
    }
    const status = /^\/deviceStatus\/(now\/)?(.+)$/.exec(path);
    if (status && request.method === 'GET') {
      const cached = Boolean(status[1]);
      this.count(cached ? 'cachedStatus' : 'status');
      const guid = decodeURIComponent(status[2]);
      const unit = this.units.find((candidate) => candidate.guid.replaceAll('/', 'f') === guid);
      if (!unit) {
        return json(403, { code: 4300, message: 'Device not found' });
      }
      if (unit.offline && !cached) {
        return json(500, { code: 5005, message: 'Communication error with the device' });
      }
      if (unit.offline && unit.offlineCache === false) {
        return json(500, { code: 5005, message: 'No data' });
      }
      return json(200, { ...clone(unit.status), timestamp: this.now() });
    }
    if (path === '/deviceStatus/control') {
      this.count('control');
      const data = JSON.parse(body);
      const unit = this.unit(data.deviceGuid);
      if (!unit) {
        return json(403, { code: 4300, message: 'Device not found' });
      }
      if (unit.offline) {
        return json(500, { code: 5005, message: 'Communication error with the device' });
      }
      this.controls.push({ guid: data.deviceGuid, parameters: data.parameters });
      Object.assign(unit.status.parameters, data.parameters);
      return json(200, { result: 0 });
    }
    if (path === '/deviceHistoryData') {
      this.count('history');
      const data = JSON.parse(body);
      const unit = this.unit(data.deviceGuid);
      if (!unit || data.dataMode !== 2 || !/^\d{8}$/.test(data.date) || !data.osTimezone) {
        return json(400, { code: 4000, message: 'Bad request' });
      }
      return json(200, this.history(unit, data.date));
    }
    return json(404, { code: 4040, message: 'Not found' });
  }

  /** One entry per day of the month of `date` (local time), like the month mode. */
  history(unit, date) {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(4, 6));
    const now = new Date(this.now());
    const today = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const days = new Date(year, month, 0).getDate();
    const list = [];
    let total = 0;
    for (let day = 1; day <= days; day += 1) {
      const key = `${year}${pad(month)}${pad(day)}`;
      let consumption = -255;
      if (unit.energy && key <= today) {
        consumption = unit.consumption?.[key] ?? Math.round((0.5 + (day % 5) * 0.3) * 10) / 10;
        total += consumption;
      }
      list.push({
        dataNumber: day - 1,
        consumption,
        cost: consumption < 0 ? -255 : Math.round(consumption * 25) / 100,
        averageSettingTemp: 22,
        averageInsideTemp: 21,
        averageOutsideTemp: 12,
        heatConsumptionRate: consumption < 0 ? -255 : 0.8,
        coolConsumptionRate: consumption < 0 ? -255 : 0.2,
        dataTime: key,
      });
    }
    return {
      energyConsumption: Math.round(total * 10) / 10,
      estimatedCost: Math.round(total * 25) / 100,
      deviceRunTime: 0,
      currencyUnit: '€',
      historyDataList: list,
    };
  }
}

/** The external id suffix of a unit (md5 of its guid). */
export const unitId = (guid) => createHash('md5').update(guid, 'utf8').digest('hex');
