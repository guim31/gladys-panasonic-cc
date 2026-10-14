// -----------------------------------------------------------------------------
// Panasonic Comfort Cloud: endpoints, application identity and the values of
// the API, as the Android application and the reference client use them
// (sockless-coding/aio-panasonic-comfort-cloud, MIT, see THIRD_PARTY_NOTICES.md).
// -----------------------------------------------------------------------------

export const AUTH_BASE = 'https://authglb.digital.panasonic.com';
export const ACC_BASE = 'https://accsmart.panasonic.com';

// The Auth0 client of the Android application.
export const APP_CLIENT_ID = 'Xmy6xIYIitMxngjB2rHvlm6HSDNnaMJx';
export const AUTH0_CLIENT =
  'eyJuYW1lIjoiQXV0aDAuQW5kcm9pZCIsImVudiI6eyJhbmRyb2lkIjoiMzAifSwidmVyc2lvbiI6IjIuOS4zIn0=';
export const REDIRECT_URI =
  'panasonic-iot-cfc://authglb.digital.panasonic.com/android/com.panasonic.ACCsmart/callback';
export const AUDIENCE = `https://digital.panasonic.com/${APP_CLIENT_ID}/api/v1/`;
export const SCOPE = 'openid offline_access comfortcloud.control a2w.control';
export const AUTH_TENANT = 'pdpauthglb-a1';
export const AUTH_CONNECTION = 'PanasonicID-Authentication';
export const API_USER_AGENT = 'okhttp/4.10.0';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36';

// Comfort Cloud API headers.
export const APP_NAME = 'Comfort Cloud';
export const API_KEY_SALT = '521325fb2dd486bf4831b47644317fca';

// Version of the application announced when none could be read from the
// stores. Panasonic refuses an outdated one (error 4106): the version is then
// read again from the stores, or taken from the advanced setting.
export const DEFAULT_APP_VERSION = '1.21.0';
// The version read from a store is trusted this long.
export const APP_VERSION_MAX_AGE_MS = 2 * 24 * 3600_000;
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.panasonic.ACCsmart';
export const APPBRAIN_URL =
  'https://www.appbrain.com/app/panasonic-comfort-cloud/com.panasonic.ACCsmart';

// Error codes of the Comfort Cloud API, found in the body of a refusal.
export const API_ERROR = {
  // The announced application version is too old.
  NEW_VERSION: '4106',
  // New terms of use or privacy policy to accept in the application.
  AGREEMENT: '4103',
};

// Values of the `parameters` of a unit.
export const POWER = { OFF: 0, ON: 1 };
export const MODE = { AUTO: 0, DRY: 1, COOL: 2, HEAT: 3, FAN: 4 };
export const FAN_SPEED = { AUTO: 0, LOW: 1, LOW_MID: 2, MID: 3, HIGH_MID: 4, HIGH: 5 };
export const ECO_MODE = { AUTO: 0, POWERFUL: 1, QUIET: 2 };
// Fixed louver positions; "auto" is not a position but a flag of fanAutoMode.
export const SWING_UD = { AUTO: -1, UP: 0, DOWN: 1, MID: 2, UP_MID: 3, DOWN_MID: 4, SWING: 5 };
export const SWING_LR = {
  AUTO: -1,
  RIGHT: 0,
  LEFT: 1,
  MID: 2,
  RIGHT_MID: 4,
  LEFT_MID: 5,
  UNAVAILABLE: 6,
};
// Which axes sweep by themselves.
export const FAN_AUTO_MODE = { BOTH: 0, DISABLED: 1, VERTICAL: 2, HORIZONTAL: 3 };
export const NANOE = { UNAVAILABLE: 0, OFF: 1, ON: 2, MODE_G: 3, ALL: 4 };
export const ON_OFF_FLAG = { UNAVAILABLE: 0, OFF: 1, ON: 2 };

// A temperature the unit does not measure.
export const INVALID_TEMPERATURE = 126;
// A consumption the history does not have (yet).
export const NO_CONSUMPTION = -255;

// deviceType of the appliances that are not air conditioners: Aquarea
// air-to-water heat pumps and standalone hot water tanks.
export const NOT_AIR_CONDITIONERS = ['2', '11'];

// `dataMode` of /deviceHistoryData: one entry per day of the month asked.
export const HISTORY_MONTH = 2;
