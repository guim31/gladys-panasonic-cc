// -----------------------------------------------------------------------------
// The energy counter of a unit, built from the daily history of Comfort Cloud.
//
// The cloud gives the consumption of each day of a month, today's growing as
// the day goes (with a delay of up to an hour or so), and nothing else: no
// meter index. Gladys' energy monitoring wants an index that only goes up, so
// the container makes one: the days seen are summed, each day kept at the
// highest value read for it (a late correction upwards is counted, never a
// drop), and the days older than two months are folded into a base. The
// counter starts with the current month at the first reading.
// -----------------------------------------------------------------------------

const KEEP_DAYS = 62;
const round = (value) => Math.round(value * 1000) / 1000;

const pad = (number) => String(number).padStart(2, '0');
export const dayKey = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
export const monthKey = (date) => dayKey(date).slice(0, 6);

/** A fresh, empty counter. */
export const emptyEnergy = () => ({ base: 0, days: {}, month: null });

/** A counter read back from /data, or a fresh one when it does not look right. */
export function restoreEnergy(saved) {
  if (!saved || typeof saved !== 'object' || !Number.isFinite(saved.base) || saved.base < 0) {
    return emptyEnergy();
  }
  const days = {};
  for (const [day, value] of Object.entries(saved.days ?? {})) {
    if (/^\d{8}$/.test(day) && Number.isFinite(value) && value >= 0) {
      days[day] = value;
    }
  }
  return { base: saved.base, days, month: /^\d{6}$/.test(saved.month ?? '') ? saved.month : null };
}

/**
 * Merge the days of a history answer into the counter.
 * @param {{ base: number, days: Record<string, number>, month: string|null }} energy
 * @param {Record<string, number>} days kWh by "YYYYMMDD" (parseHistory)
 * @param {Date} now
 * @returns the new counter (the given one is not modified)
 */
export function mergeDays(energy, days, now) {
  const next = { base: energy.base, days: { ...energy.days }, month: monthKey(now) };
  const today = dayKey(now);
  for (const [day, value] of Object.entries(days)) {
    // A day of the future is a clock problem, not a consumption.
    if (day > today) {
      continue;
    }
    next.days[day] = Math.max(next.days[day] ?? 0, value);
  }
  const oldest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - KEEP_DAYS);
  const cutoff = dayKey(oldest);
  for (const [day, value] of Object.entries(next.days)) {
    if (day < cutoff) {
      next.base = round(next.base + value);
      delete next.days[day];
    }
  }
  return next;
}

/** What the features show: today's consumption and the counter, in kWh. */
export function energyValues(energy, now) {
  const total = round(energy.base + Object.values(energy.days).reduce((sum, v) => sum + v, 0));
  return { today: round(energy.days[dayKey(now)] ?? 0), total };
}

/** True when the month changed since the last reading: the previous one is read once more. */
export const needsPreviousMonth = (energy, now) =>
  energy.month !== null && energy.month !== monthKey(now);

/** A date in the month before `now` (its last day). */
export const previousMonthDate = (now) => new Date(now.getFullYear(), now.getMonth(), 0, 12);
