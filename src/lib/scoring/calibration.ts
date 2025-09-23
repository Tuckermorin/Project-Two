import type { CalibrationResult } from "./types";

export function calibrateScore(rawScore: number): CalibrationResult {
  const bounded = Math.min(100, Math.max(0, rawScore));
  const probability = Number((bounded / 100).toFixed(2));
  return {
    calibrationVersion: "none",
    calibratedProbability: probability,
  } satisfies CalibrationResult;
}
