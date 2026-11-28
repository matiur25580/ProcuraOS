const UNIT_MILLISECONDS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function durationToMs(value: string): number {
  const match = /^([1-9]\d*)([smhd])$/.exec(value);
  if (!match) throw new Error("Duration must be a positive integer followed by s, m, h or d");

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MILLISECONDS;
  const milliseconds = amount * UNIT_MILLISECONDS[unit];
  if (!Number.isSafeInteger(milliseconds)) throw new Error("Duration is outside the supported range");

  return milliseconds;
}
