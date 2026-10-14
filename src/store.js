// -----------------------------------------------------------------------------
// Persistence under /data (the only writable path of the container): the
// Comfort Cloud session (access and refresh tokens, client id, application
// version), and per unit what was learned (sensors seen, energy counter). A
// restart then refreshes the session instead of sending the password again.
// The file is written with mode 0600 and never logged. Losing it is
// harmless: the next start logs in again, and the energy counter restarts
// from the current month.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { ProblemLog } from './problems.js';

const logger = createLogger({ name: 'panasonic-cc-store' });
const FILE_NAME = 'panasonic-cc.json';

export class Store {
  constructor(directory = process.env.PANASONIC_CC_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.pending = null;
    // A volume that refuses writes is said once, not at every scan.
    this.problems = new ProblemLog(logger);
    this.writing = null;
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      return {};
    }
  }

  // Writes are coalesced and atomic (temporary file + rename): a crash never
  // leaves half a JSON file behind.
  save(data) {
    this.latest = data;
    if (!this.pending) {
      // Chained after the write in progress, if any: one writer at a time.
      this.pending = (this.writing ?? Promise.resolve()).then(async () => {
        const snapshot = this.latest;
        this.pending = null;
        try {
          await mkdir(this.directory, { recursive: true });
          const temporary = `${this.path}.tmp`;
          await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
          await rename(temporary, this.path);
          this.problems.recover('write', `${this.path} is written again`);
        } catch (err) {
          this.problems.fail('write', `Cannot write ${this.path}: ${err.message}`);
        }
      });
      this.writing = this.pending;
    }
    return this.pending;
  }

  /** Resolves once every write requested so far is on disk. */
  flush() {
    return this.writing ?? Promise.resolve();
  }
}
