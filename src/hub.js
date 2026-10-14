// -----------------------------------------------------------------------------
// The Panasonic hub: signs in to Comfort Cloud, lists the indoor units of the
// account, reads them at the configured pace, publishes devices and states
// to Gladys, runs the commands and fires the scene trigger.
//
// Polling by the container's own timer: the core polls external devices
// unreliably (GladysAssistant/Gladys#3198), so the devices are published
// with should_poll and a one-minute poll_frequency only as a fallback, and
// the core's onPoll is skipped when the timer has just read the unit.
//
// Comfort Cloud is slow and throttles: one call at a time (src/panasonic/
// cloud.js), only the units added to Gladys are read, the energy history at
// most every 5 minutes, and the pace slows down (up to 10 minutes) while the
// cloud fails.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { GladysApiError, createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES, isConfigured } from './config.js';
import {
  FEATURE_KEYS,
  buildDevice,
  commandChange,
  deviceIds,
  deviceName,
  deviceValues,
  featureSpecs,
} from './devices.js';
import {
  emptyEnergy,
  energyValues,
  mergeDays,
  needsPreviousMonth,
  previousMonthDate,
  restoreEnergy,
} from './energy.js';
import { ComfortCloud } from './panasonic/cloud.js';
import { POWER } from './panasonic/constants.js';
import {
  applyParameters,
  buildParameters,
  parseGroups,
  parseHistory,
  parseStatus,
} from './panasonic/status.js';
import { ProblemLog } from './problems.js';
import { CONNECTION_TEXT } from './texts.js';

const logger = createLogger({ name: 'panasonic-cc' });

export const WIDGET_KEY = 'climate';
export const TRIGGERS = { SIGN_IN_REQUIRED: 'sign_in_required' };

// Account problems the user must solve: no automatic retry would help, and a
// retried password could get the account locked.
const BLOCKING = ['credentials', 'mfa'];
// The reason variable of the sign_in_required trigger, by problem.
const SIGN_IN_REASONS = { credentials: 'password', mfa: 'two_factor', agreement: 'terms' };

export const HUB_TIMINGS = {
  // The unit list is read again this often (new units, renamed units).
  listMs: 30 * 60_000,
  // The energy history moves slowly: read at most this often.
  energyMs: 5 * 60_000,
  // A unit without energy data is asked again this often.
  noEnergyMs: 6 * 3600_000,
  // A problem a retry may solve (terms accepted, version, cloud down) is retried this often.
  retryMs: 30 * 60_000,
  // The slowest pace while Comfort Cloud fails.
  maxBackoffMs: 10 * 60_000,
  // The state is read again this long after a command (the cloud takes a moment).
  confirmMs: 3_000,
  // Readings in a row without answer before a unit is "not answering".
  unreachableAfter: 2,
  // Cached status reads after a failed live one (the reference does the same).
  cachedReads: 10,
  // An unchanged value is published again at least this often, or Gladys
  // shows "no recent value" after 48 h.
  heartbeatMs: 6 * 3600_000,
};

// Changes of these features change what the widget shows.
const WIDGET_KEYS = [
  FEATURE_KEYS.POWER,
  FEATURE_KEYS.MODE,
  FEATURE_KEYS.FAN_SPEED,
  FEATURE_KEYS.TARGET_TEMPERATURE,
  FEATURE_KEYS.POWERFUL,
  FEATURE_KEYS.QUIET,
];
// Settings the reference only sends to a running unit: kept until it is turned on.
const NEEDS_POWER = ['targetTemperature', 'swingVertical', 'swingHorizontal', 'ecoMode'];

/** Gladys refused a call or did not answer: a passing condition, unlike a bug. */
const isGladysFailure = (err) =>
  err instanceof GladysApiError ||
  err?.name === 'TimeoutError' ||
  err?.name === 'AbortError' ||
  (err instanceof TypeError && err.message === 'fetch failed');

/** A Comfort Cloud failure about the account (all units), not about one unit. */
const isAccountFailure = (err) =>
  err?.name === 'PanasonicError' &&
  ['network', 'credentials', 'mfa', 'agreement', 'version'].includes(err.kind);

const accountKey = (username) =>
  createHash('sha256').update(username.toLowerCase(), 'utf8').digest('hex').slice(0, 16);

export class PanasonicHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {object} options.store persistence (src/store.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {(options: object) => ComfortCloud} [options.createCloud]
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, timers = true, timings, createCloud, now = () => Date.now() }) {
    this.gladys = gladys;
    this.store = store;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.createCloud = createCloud ?? ((options) => new ComfortCloud(options));
    this.now = now;
    this.config = null;
    this.cloud = null;
    this.saved = {};
    /** @type {Map<string, object>} unit records, by unit id */
    this.records = new Map();
    this.others = 0;
    this.listedAt = 0;
    /** null (fine), or the account problem: credentials, mfa, agreement, version, unreachable */
    this.problem = null;
    this.problemAt = 0;
    this.failures = 0;
    this.backoffUntil = 0;
    this.signedIn = false;
    this.pending = new Set();
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    this.saved = (await this.store.load()) ?? {};
    this.restoreUnits();
    this.openCloud();
    await this.connectAccount();
    await this.publishEverything();
    this.startTimers();
  }

  /** Gladys came back (restart, network): it may have lost what was published. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates();
    for (const record of this.records.values()) {
      record.published = {};
    }
    await this.publishEverything();
    this.gladysRecovered();
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const account =
      previous.username !== config.username ||
      previous.password !== config.password ||
      previous.appVersion !== config.appVersion;
    if (account) {
      this.openCloud();
      await this.connectAccount();
    }
    if (previous.pollSeconds !== config.pollSeconds) {
      this.startTimers();
    }
    // New devices, or names in another language for the Discovery list.
    await this.publishEverything();
  }

  /** A Comfort Cloud client for the configured account, with its saved session. */
  openCloud() {
    const key = isConfigured(this.config) ? accountKey(this.config.username) : null;
    const session = this.saved.account === key ? (this.saved.session ?? {}) : {};
    this.saved.account = key;
    this.saved.session = session;
    this.cloud = isConfigured(this.config)
      ? this.createCloud({
          username: this.config.username,
          password: this.config.password,
          appVersion: this.config.appVersion,
          session,
          save: (next) => {
            this.saved.session = next;
            return this.save();
          },
        })
      : null;
    this.problem = null;
    this.failures = 0;
    this.backoffUntil = 0;
  }

  async publishEverything() {
    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.requestWidgetRefresh();
  }

  startTimers() {
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.track(this.pollAll()), this.config.pollSeconds * 1000);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    for (const record of this.records.values()) {
      clearTimeout(record.confirmTimer);
    }
    await this.idle();
    await this.store.flush();
  }

  /** Keep track of background work, so the tests (and stop) can wait for it. */
  track(promise) {
    const tracked = Promise.resolve(promise)
      .catch((err) => this.backgroundFailed(err))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    return tracked;
  }

  backgroundFailed(err) {
    if (isGladysFailure(err)) {
      this.problems.fail('gladys', `Gladys does not take the Panasonic updates: ${err.message}`);
    } else if (err?.name === 'PanasonicError') {
      this.problems.fail(`cloud:${err.message}`, `Comfort Cloud: ${err.message}`);
    } else {
      this.problems.fail(`bug:${err?.message}`, 'Background task failed', 'error', err);
    }
  }

  gladysRecovered() {
    this.problems.recover('gladys', 'Gladys takes the Panasonic updates again');
  }

  async idle() {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  // --- Persistence -----------------------------------------------------------

  restoreUnits() {
    for (const [id, saved] of Object.entries(this.saved.units ?? {})) {
      if (!saved || typeof saved.guid !== 'string') {
        continue;
      }
      const record = this.createRecord({ id, guid: saved.guid, name: saved.name ?? '' });
      record.flags = {
        hasIndoor: saved.flags?.hasIndoor === true,
        hasOutdoor: saved.flags?.hasOutdoor === true,
        hasEnergy: saved.flags?.hasEnergy === true,
      };
      record.energy = restoreEnergy(saved.energy);
      record.settingsWhenOff =
        saved.settingsWhenOff && typeof saved.settingsWhenOff === 'object'
          ? saved.settingsWhenOff
          : {};
      record.listed = false;
      this.records.set(id, record);
    }
  }

  save() {
    const units = {};
    for (const record of this.records.values()) {
      units[record.id] = {
        guid: record.guid,
        name: record.name,
        flags: record.flags,
        energy: record.energy,
        settingsWhenOff: record.settingsWhenOff,
      };
    }
    this.saved.units = units;
    return this.store.save(this.saved);
  }

  // --- Account ---------------------------------------------------------------

  createRecord(unit) {
    return {
      id: unit.id,
      guid: unit.guid,
      name: unit.name ?? '',
      group: unit.group ?? '',
      model: unit.model ?? '',
      deviceType: unit.deviceType ?? null,
      listed: true,
      capabilities: null,
      state: null,
      flags: { hasIndoor: false, hasOutdoor: false, hasEnergy: false },
      energy: emptyEnergy(),
      energyAt: 0,
      // Settings asked while the unit was off, sent when it is turned on.
      settingsWhenOff: {},
      cachedReads: 0,
      // null until the first answer.
      reachable: null,
      failures: 0,
      // Bumped on every command: a reading started before it is stale.
      commandSeq: 0,
      lastPolledAt: 0,
      confirmTimer: null,
      published: {},
    };
  }

  /**
   * Sign in if needed, list the units and read those never read. Never
   * throws: an account problem is kept in `this.problem` and reported.
   * @param {object} [options]
   * @param {string} [options.otp] a two-factor code (the sign-in action)
   */
  async connectAccount({ otp } = {}) {
    if (!this.cloud) {
      this.problem = null;
      if (!isConfigured(this.config)) {
        logger.info('Not configured yet: waiting for the Panasonic ID');
      }
      return;
    }
    this.problemAt = this.now();
    try {
      if (otp) {
        await this.cloud.login(otp);
      }
      await this.listUnits();
      for (const record of this.records.values()) {
        if (record.listed && !record.capabilities) {
          await this.readUnit(record).catch((err) => {
            if (isAccountFailure(err)) {
              throw err;
            }
            return this.unitFailed(record, err);
          });
        }
      }
      this.accountRecovered();
    } catch (err) {
      await this.accountFailed(err);
      if (otp && err.kind === 'mfa') {
        throw err;
      }
    }
  }

  async listUnits() {
    const { units, others } = parseGroups(await this.cloud.getGroups());
    this.listedAt = this.now();
    this.others = others.length;
    const listed = new Set();
    let changed = false;
    for (const unit of units) {
      listed.add(unit.id);
      let record = this.records.get(unit.id);
      if (!record) {
        record = this.createRecord(unit);
        this.records.set(unit.id, record);
        logger.info(`Air conditioner "${unit.name}" (${unit.model || 'unknown model'}) found`);
        changed = true;
      } else {
        changed ||= record.name !== unit.name || !record.listed;
        Object.assign(record, {
          name: unit.name,
          group: unit.group,
          model: unit.model,
          deviceType: unit.deviceType,
          listed: true,
        });
      }
    }
    for (const record of this.records.values()) {
      if (!listed.has(record.id) && record.listed) {
        record.listed = false;
        changed = true;
        logger.info(`Air conditioner "${record.name}" is no longer in the Panasonic account`);
      }
    }
    if (changed) {
      await this.save();
    }
    return changed;
  }

  accountRecovered() {
    this.failures = 0;
    this.backoffUntil = 0;
    const previous = this.problem;
    this.problem = null;
    this.problems.recover('account', 'Comfort Cloud answers again');
    if (!this.signedIn) {
      this.signedIn = true;
      const count = [...this.records.values()].filter((record) => record.listed).length;
      logger.info(`Signed in to Panasonic Comfort Cloud: ${count} air conditioner(s)`);
    }
    if (this.saved.alert) {
      this.saved.alert = null;
      this.track(this.save());
    }
    return previous;
  }

  /** An account problem: said once, reported in Gladys, and the trigger fired. */
  async accountFailed(err) {
    const kind = isAccountFailure(err) ? err.kind : 'unreachable';
    const problem = kind === 'network' ? 'unreachable' : kind;
    this.problem = problem;
    this.signedIn = false;
    if (problem === 'unreachable') {
      this.failures += 1;
      const period = this.config.pollSeconds * 1000;
      const delay = Math.min(
        period * 2 ** this.failures,
        Math.max(period, this.timings.maxBackoffMs),
      );
      this.backoffUntil = this.now() + delay;
    }
    // One line while it lasts: the host or step that failed varies from try to try.
    logger.debug(`Comfort Cloud failure: ${err.message}`);
    this.problems.fail(
      'account',
      problem === 'unreachable'
        ? 'Comfort Cloud does not answer, retrying with a slower pace'
        : `Comfort Cloud: ${err.message}`,
    );
    const reason = SIGN_IN_REASONS[problem];
    if (reason && this.saved.alert !== reason) {
      this.saved.alert = reason;
      await this.save();
      this.track(this.gladys.publishSceneEvent(TRIGGERS.SIGN_IN_REQUIRED, { reason }));
    }
    await this.publishConnectionStatus().catch((error) => this.backgroundFailed(error));
    await this.publishTransports().catch((error) => this.backgroundFailed(error));
    this.requestWidgetRefresh();
  }

  /** The "Search for air conditioners" action: the account checked again, every unit read. */
  async refresh() {
    if (this.cloud && BLOCKING.includes(this.problem)) {
      // The user asks: one more try with the configured password.
      this.problem = null;
    }
    await this.connectAccount();
    if (!this.problem && this.cloud) {
      for (const record of this.records.values()) {
        if (record.listed && record.capabilities) {
          await this.readUnit(record).catch((err) => this.unitFailed(record, err));
        }
      }
    }
    await this.publishEverything();
  }

  /** The "Sign in with a 2FA code" action. Resolves 'signed-in' or 'not-needed'. */
  async signInWithCode(code) {
    if (!this.cloud) {
      const error = new Error('No Panasonic ID configured');
      error.kind = 'credentials';
      throw error;
    }
    const before = this.problem;
    this.problem = null;
    await this.connectAccount({ otp: code });
    await this.publishEverything();
    if (this.problem) {
      const error = new Error(`Sign-in failed: ${this.problem}`);
      error.kind = this.problem;
      throw error;
    }
    return before === 'mfa' ? 'signed-in' : 'not-needed';
  }

  // --- Devices ---------------------------------------------------------------

  /** Units of the account read at least once: their features are known. */
  publishable() {
    return [...this.records.values()].filter((record) => record.listed && record.capabilities);
  }

  async publishDevices() {
    const devices = this.publishable().map((record) =>
      buildDevice(this.gladys, record, this.config.language),
    );
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** The record behind a Gladys device external id, or null. */
  resolveDevice(externalId) {
    if (typeof externalId !== 'string') {
      return null;
    }
    const prefix = deviceIds(this.gladys, '').device;
    if (!externalId.startsWith(prefix)) {
      return null;
    }
    return this.records.get(externalId.slice(prefix.length)) ?? null;
  }

  require(externalId) {
    const record = this.resolveDevice(externalId);
    if (!record?.listed) {
      throw new Error(`Unknown Panasonic air conditioner ${externalId}`);
    }
    return record;
  }

  isCreated(record) {
    const id = deviceIds(this.gladys, record.id).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  label(record) {
    return `"${deviceName(record, 'en')}"`;
  }

  // --- States ----------------------------------------------------------------

  /** The state Gladys shows: the reading, with the settings kept until power-on. */
  shownState(record) {
    return record.state ? { ...record.state, ...record.settingsWhenOff } : null;
  }

  values(record) {
    const energy = record.flags.hasEnergy
      ? energyValues(record.energy, new Date(this.now()))
      : undefined;
    return deviceValues(this.shownState(record), energy);
  }

  /** Publish what changed for one unit, if the user created it. Resolves with the changed keys. */
  async publishStates(record) {
    if (!record.capabilities || !record.listed || !this.isCreated(record)) {
      return [];
    }
    const ids = deviceIds(this.gladys, record.id);
    const values = this.values(record);
    const states = [];
    const changed = [];
    for (const spec of featureSpecs(record, this.config.language)) {
      const value = values[spec.key];
      if (value === undefined || value === null) {
        continue;
      }
      states.push({ device_feature_external_id: ids.feature(spec.key), state: value });
      if (record.published[spec.key] !== value) {
        changed.push(spec.key);
      }
    }
    // The SDK sends only the values that changed since its last publication.
    await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
    for (const key of changed) {
      record.published[key] = values[key];
    }
    return changed;
  }

  async publishAllStates() {
    for (const record of this.records.values()) {
      try {
        await this.publishStates(record);
      } catch (err) {
        this.backgroundFailed(err);
      }
    }
  }

  /** The user added a device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const record = this.resolveDevice(device?.external_id);
    if (!record) {
      return;
    }
    record.published = {};
    this.gladys.forgetPublishedStates(device.external_id);
    await this.publishStates(record);
    await this.publishTransports([record]);
    this.requestWidgetRefresh();
    // A fresh reading rather than waiting for the timer.
    if (this.cloud && !this.problem) {
      this.track(this.readUnit(record).catch((err) => this.unitFailed(record, err)));
    }
  }

  transportOf(record) {
    return record.reachable === true && !this.problem ? 'cloud' : 'unreachable';
  }

  async publishTransports(records = [...this.records.values()]) {
    const entries = records
      .filter((record) => record.listed && this.isCreated(record))
      .map((record) => ({
        external_id: deviceIds(this.gladys, record.id).device,
        transport: this.transportOf(record),
      }));
    for (let at = 0; at < entries.length; at += 100) {
      await this.gladys.publishTransports(entries.slice(at, at + 100));
    }
  }

  async publishConnectionStatus() {
    if (!this.cloud) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.notConfigured);
    } else if (this.problem) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT[this.problem]);
    } else if (this.publishable().length === 0) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.noUnit);
    } else {
      await this.gladys.setConnectionStatus(true);
    }
  }

  requestWidgetRefresh() {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Polling -----------------------------------------------------------------

  /** Whether the timer may call Comfort Cloud now. */
  mayCall({ force = false } = {}) {
    if (!this.cloud || this.stopped) {
      return false;
    }
    if (BLOCKING.includes(this.problem)) {
      return false;
    }
    if (!force && this.backoffUntil > this.now()) {
      logger.debug('Comfort Cloud failed recently: reading skipped');
      return false;
    }
    if (this.problem === 'agreement' || this.problem === 'version') {
      return force || this.now() - this.problemAt >= this.timings.retryMs;
    }
    return true;
  }

  /**
   * One cycle of the timer: the unit list now and then, then every unit added
   * to Gladys not read less than half a period ago.
   * @param {object} [options]
   * @param {boolean} [options.force] read them all now (tests)
   */
  pollAll({ force = false } = {}) {
    this.polling ??= this.runCycle(force).finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  async runCycle(force) {
    if (!this.mayCall({ force })) {
      return;
    }
    if (this.problem || !this.signedIn || this.now() - this.listedAt >= this.timings.listMs) {
      // A problem to retry, or the list is old: the whole account again.
      const wasFailing = this.problem !== null;
      await this.connectAccount();
      if (this.problem) {
        return;
      }
      if (wasFailing) {
        await this.publishEverything();
      } else {
        await this.publishDevices();
      }
    }
    for (const record of this.records.values()) {
      if (!record.listed || !this.isCreated(record)) {
        continue;
      }
      try {
        await this.pollRecord(record, force ? 0 : 0.5);
      } catch (err) {
        if (isAccountFailure(err)) {
          await this.accountFailed(err);
          return;
        }
        if (isGladysFailure(err)) {
          this.backgroundFailed(err);
          return;
        }
        await this.unitFailed(record, err);
      }
    }
    this.gladysRecovered();
  }

  /** Read a unit unless it was read less than `minGap` periods ago. */
  async pollRecord(record, minGap) {
    const period = this.config.pollSeconds * 1000;
    if (this.now() - record.lastPolledAt < period * minGap) {
      logger.debug(
        `${this.label(record)}: read ${this.now() - record.lastPolledAt} ms ago, skipped`,
      );
      return;
    }
    await this.readUnit(record);
  }

  /** The core's onPoll (fallback): skipped while the timer does its job. */
  async pollFromCore(device) {
    const record = this.resolveDevice(device?.external_id);
    if (!record?.listed || !this.mayCall()) {
      return;
    }
    try {
      await this.pollRecord(record, 0.9);
    } catch (err) {
      if (isAccountFailure(err)) {
        await this.accountFailed(err);
      } else {
        await this.unitFailed(record, err);
      }
    }
  }

  /** The status of a unit: live, or the cloud's copy for a while after a failed live read. */
  async fetchStatus(record) {
    if (record.cachedReads > 0) {
      record.cachedReads -= 1;
      return this.cloud.getCachedStatus(record.guid);
    }
    try {
      return await this.cloud.getStatus(record.guid);
    } catch (err) {
      if (isAccountFailure(err)) {
        throw err;
      }
      logger.debug(`${this.label(record)}: live status failed (${err.message}), cached copy`);
      record.cachedReads = this.timings.cachedReads;
      return this.cloud.getCachedStatus(record.guid);
    }
  }

  /**
   * Read one unit (status, and energy when due) and publish what changed.
   * Throws a Comfort Cloud or Gladys failure.
   */
  async readUnit(record) {
    const seq = record.commandSeq;
    record.lastPolledAt = this.now();
    const body = await this.fetchStatus(record);
    const { capabilities, state } = parseStatus(body, record.deviceType);
    if (state.power === null || state.mode === null) {
      throw new Error('the status has no operate or operationMode');
    }
    const before = record.capabilities
      ? featureSpecs(record, 'en')
          .map((spec) => spec.key)
          .join()
      : null;
    record.capabilities = capabilities;
    const flags = { ...record.flags };
    flags.hasIndoor ||= state.insideTemperature !== null;
    flags.hasOutdoor ||= state.outsideTemperature !== null;
    const flagsChanged =
      flags.hasIndoor !== record.flags.hasIndoor || flags.hasOutdoor !== record.flags.hasOutdoor;
    record.flags = flags;
    if (seq === record.commandSeq) {
      record.state = state;
    } else {
      // A command ran meanwhile: this reading may predate it.
      record.state = { ...state, ...this.commandedFields(record) };
    }
    if (state.power === POWER.ON && Object.keys(record.settingsWhenOff).length > 0) {
      // Turned on elsewhere (remote, app): what was kept no longer applies.
      record.settingsWhenOff = {};
      await this.save();
    }
    await this.readEnergyIfDue(record);
    if (flagsChanged) {
      await this.save();
    }
    const after = featureSpecs(record, 'en')
      .map((spec) => spec.key)
      .join();
    await this.unitAnswers(record, before !== after);
  }

  /** The fields the last command set (kept over a reading that predates it). */
  commandedFields(record) {
    return record.lastCommand ?? {};
  }

  async readEnergyIfDue(record) {
    const now = this.now();
    const every = record.flags.hasEnergy ? this.timings.energyMs : this.timings.noEnergyMs;
    if (
      record.energyAt &&
      now - record.energyAt < Math.max(every, this.config.pollSeconds * 1000)
    ) {
      return;
    }
    record.energyAt = now;
    const date = new Date(now);
    try {
      const days = parseHistory(await this.cloud.getMonthHistory(record.guid, date));
      if (needsPreviousMonth(record.energy, date)) {
        Object.assign(
          days,
          parseHistory(await this.cloud.getMonthHistory(record.guid, previousMonthDate(date))),
        );
      }
      if (Object.keys(days).length === 0 && !record.flags.hasEnergy) {
        logger.debug(`${this.label(record)}: no energy data`);
        return;
      }
      record.flags = { ...record.flags, hasEnergy: true };
      record.energy = mergeDays(record.energy, days, date);
      await this.save();
      this.problems.recover(
        `energy:${record.id}`,
        `${this.label(record)}: energy history read again`,
      );
    } catch (err) {
      if (isAccountFailure(err)) {
        throw err;
      }
      // The status was read: a missing history is not worth failing the unit.
      this.problems.fail(
        `energy:${record.id}`,
        `${this.label(record)}: energy history unavailable (${err.message})`,
      );
    }
  }

  /** A fresh reading: follow the reachability, publish what changed. */
  async unitAnswers(record, structureChanged) {
    record.failures = 0;
    this.problems.recover(`read:${record.id}`, `${this.label(record)} reads again`);
    if (record.reachable !== true) {
      const known = record.reachable === false;
      record.reachable = true;
      if (known) {
        logger.info(`${this.label(record)} answers again`);
      }
      await this.publishTransports([record]);
      this.requestWidgetRefresh();
    }
    if (structureChanged) {
      await this.publishDevices();
    }
    const changed = await this.publishStates(record);
    if (changed.some((key) => WIDGET_KEYS.includes(key))) {
      this.requestWidgetRefresh();
    }
  }

  /** A reading without answer; after a few in a row the unit is "not answering". */
  async unitFailed(record, err) {
    if (this.stopped) {
      return;
    }
    if (isGladysFailure(err)) {
      this.backgroundFailed(err);
      return;
    }
    record.failures += 1;
    this.problems.fail(
      `read:${record.id}`,
      `Cannot read ${this.label(record)}: ${err.message}`,
      'debug',
    );
    if (record.reachable === false || record.failures < this.timings.unreachableAfter) {
      return;
    }
    record.reachable = false;
    logger.info(`${this.label(record)} no longer answers (${err.message})`);
    await this.publishTransports([record]).catch((error) => this.backgroundFailed(error));
    this.requestWidgetRefresh();
  }

  // --- Commands ----------------------------------------------------------------

  /** The state, read now if not known yet. */
  async currentState(record) {
    if (!record.state) {
      await this.readUnit(record);
    }
    return this.shownState(record);
  }

  /**
   * Run a change. Settings that need a running unit (setpoint, swing,
   * powerful/quiet) asked while it is off are kept and shown, and sent with
   * the next power-on, like the reference without auto power-on: a scene
   * preparing the night setpoint does not start the unit.
   */
  async apply(record, change) {
    if (Object.keys(change).length === 0) {
      return;
    }
    if (this.problem && BLOCKING.includes(this.problem)) {
      throw new Error(`Panasonic sign-in needed (${this.problem})`);
    }
    await this.currentState(record);
    const state = record.state;
    const turningOn = change.power === POWER.ON || change.mode !== undefined;
    const off = state.power !== POWER.ON;
    let toSend = change;
    if (off && !turningOn) {
      const kept = Object.fromEntries(
        Object.entries(change).filter(([key]) => NEEDS_POWER.includes(key)),
      );
      toSend = Object.fromEntries(
        Object.entries(change).filter(([key]) => !NEEDS_POWER.includes(key)),
      );
      if (Object.keys(kept).length > 0) {
        record.settingsWhenOff = { ...record.settingsWhenOff, ...kept };
        await this.save();
        logger.info(
          `${this.label(record)} is off: ${Object.keys(kept).join(', ')} kept until it is turned on`,
        );
      }
    } else if (off && turningOn) {
      toSend = { ...record.settingsWhenOff, ...change };
      record.settingsWhenOff = {};
      await this.save();
    }
    if (Object.keys(toSend).length > 0) {
      const parameters = buildParameters(state, toSend);
      record.commandSeq += 1;
      try {
        await this.cloud.control(record.guid, parameters);
      } catch (err) {
        if (isAccountFailure(err)) {
          await this.accountFailed(err);
        }
        throw err;
      }
      const after = applyParameters(state, parameters);
      record.lastCommand = Object.fromEntries(
        Object.entries(after).filter(([key, value]) => value !== state[key]),
      );
      record.state = after;
      this.scheduleConfirm(record);
    }
    const changed = await this.publishStates(record);
    if (changed.some((key) => WIDGET_KEYS.includes(key))) {
      this.requestWidgetRefresh();
    }
  }

  /** Read the unit again shortly after a command (debounced). */
  scheduleConfirm(record) {
    clearTimeout(record.confirmTimer);
    const confirm = () =>
      this.track(
        this.readUnit(record)
          .catch((err) => this.unitFailed(record, err))
          .finally(() => {
            record.lastCommand = null;
          }),
      );
    if (!this.timersEnabled) {
      confirm();
      return;
    }
    record.confirmTimer = setTimeout(confirm, this.timings.confirmMs);
  }

  /** A Gladys command on a feature of one of the units. */
  async setValue(device, feature, value) {
    const record = this.require(device?.external_id);
    const prefix = `${device.external_id}:`;
    const key = feature?.external_id?.startsWith(prefix)
      ? feature.external_id.slice(prefix.length)
      : null;
    logger.info(`Command: ${this.label(record)} ${key} = ${value}`);
    await this.currentState(record);
    await this.apply(record, commandChange(record, key, value));
  }

  /**
   * Several settings at once (scene action, widget form), in Gladys values,
   * each optional: `{ power, mode, targetTemperature, fanSpeed, special }`
   * (`special`: 'normal' | 'powerful' | 'quiet').
   */
  async applySettings(deviceExternalId, settings) {
    const record = this.require(deviceExternalId);
    await this.currentState(record);
    const given = (value) => value !== undefined && value !== null && value !== '';
    let change = {};
    const steps = [
      [FEATURE_KEYS.POWER, settings.power],
      [FEATURE_KEYS.MODE, settings.mode],
      [FEATURE_KEYS.TARGET_TEMPERATURE, settings.targetTemperature],
      [FEATURE_KEYS.FAN_SPEED, settings.fanSpeed],
    ];
    for (const [key, value] of steps) {
      if (given(value)) {
        change = { ...change, ...commandChange(record, key, value) };
      }
    }
    if (given(settings.special)) {
      change = { ...change, ...this.specialChange(record, settings.special) };
    }
    await this.apply(record, change);
    return record;
  }

  specialChange(record, special) {
    const caps = record.capabilities;
    if (special === 'powerful') {
      if (!caps.powerful) throw new Error('This unit has no powerful mode');
      return commandChange(record, FEATURE_KEYS.POWERFUL, 1);
    }
    if (special === 'quiet') {
      if (!caps.quiet) throw new Error('This unit has no quiet mode');
      return commandChange(record, FEATURE_KEYS.QUIET, 1);
    }
    if (special === 'normal') {
      return caps.powerful || caps.quiet ? { ecoMode: 0 } : {};
    }
    throw new Error(`Unknown special mode ${special}`);
  }

  /** What the "Search for air conditioners" action reports. */
  summary() {
    return {
      problem: this.cloud ? this.problem : 'notConfigured',
      others: this.others,
      units: [...this.records.values()]
        .filter((record) => record.listed)
        .map((record) => ({
          names: Object.fromEntries(
            LANGUAGES.map((language) => [language, deviceName(record, language)]),
          ),
          model: record.model,
          answering: record.reachable === true,
        })),
    };
  }
}
