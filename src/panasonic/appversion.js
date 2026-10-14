// -----------------------------------------------------------------------------
// The version of the Comfort Cloud application the API calls announce
// (x-app-version). Panasonic refuses an outdated one with error 4106, and
// raises it with each release of the application: like the reference client,
// it is read from the Google Play page (AppBrain as a fallback), kept two
// days, and read again on a 4106. An advanced setting can pin it when the
// stores cannot be reached.
// -----------------------------------------------------------------------------

import { APPBRAIN_URL, BROWSER_USER_AGENT, PLAY_STORE_URL } from './constants.js';

const VERSION = /^\d+(\.\d+){1,3}$/;

export const isVersion = (value) => typeof value === 'string' && VERSION.test(value.trim());

/** Compare two dotted versions: negative, zero or positive. */
export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** The version in the Google Play page (`["3.4.0"]` in its inline data). */
export function parsePlayStore(html) {
  return /\["(\d+\.\d+\.\d+)"\]/.exec(String(html))?.[1] ?? null;
}

/** The version in the AppBrain page (`<meta itemprop="softwareVersion" content="3.4.0">`). */
export function parseAppBrain(html) {
  for (const [tag] of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    if (/itemprop\s*=\s*["']?softwareVersion["']?/i.test(tag)) {
      const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
      if (isVersion(content)) {
        return content;
      }
    }
  }
  return null;
}

/**
 * Read the current version from the stores. Resolves null when neither
 * answers with a version.
 * @param {Function} request createHttp() request
 */
export async function fetchStoreVersion(request) {
  const sources = [
    [PLAY_STORE_URL, parsePlayStore],
    [APPBRAIN_URL, parseAppBrain],
  ];
  for (const [url, parse] of sources) {
    try {
      const answer = await request(url, { headers: { 'user-agent': BROWSER_USER_AGENT } });
      const version = answer.status === 200 ? parse(answer.text) : null;
      if (version) {
        return version;
      }
    } catch {
      // The next source.
    }
  }
  return null;
}
