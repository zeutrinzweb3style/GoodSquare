/**
 * Square Reputation — EXP levels.
 *
 * EXP is a reputation metric, not a currency. It has no monetary value and
 * guarantees no rewards. Levels are derived purely from an EXP total.
 */

export interface ReputationLevel {
  key: string;
  name: string;
  min: number;
  max: number | null;
}

/** Ordered from lowest to highest. */
export const REPUTATION_LEVELS: ReputationLevel[] = [
  { key: "newcomer", name: "Newcomer", min: 0, max: 99 },
  { key: "contributor", name: "Contributor", min: 100, max: 499 },
  { key: "active-member", name: "Active Member", min: 500, max: 999 },
  { key: "builder", name: "Builder", min: 1000, max: 2499 },
  { key: "ambassador", name: "Ambassador", min: 2500, max: 4999 },
  { key: "champion", name: "Champion", min: 5000, max: null },
];

/** Resolve the level for an EXP total. Negative totals clamp to Newcomer. */
export function levelForExp(exp: number): ReputationLevel {
  const total = Math.max(0, Math.floor(exp));
  let current = REPUTATION_LEVELS[0];
  for (const level of REPUTATION_LEVELS) {
    if (total >= level.min) {
      current = level;
    } else {
      break;
    }
  }
  return current;
}

/** EXP still needed to reach the next level, or null at the top level. */
export function expToNextLevel(exp: number): number | null {
  const total = Math.max(0, Math.floor(exp));
  const current = levelForExp(total);
  const index = REPUTATION_LEVELS.findIndex((l) => l.key === current.key);
  const next = REPUTATION_LEVELS[index + 1];
  if (!next) return null;
  return next.min - total;
}

/** Progress within the current level, in the range 0..1. */
export function levelProgress(exp: number): number {
  const total = Math.max(0, Math.floor(exp));
  const current = levelForExp(total);
  if (current.max === null) return 1;
  const span = current.max - current.min + 1;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (total - current.min) / span));
}
