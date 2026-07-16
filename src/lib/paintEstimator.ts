/**
 * paintEstimator.ts
 *
 * Utility functions for estimating wall paint requirements for a room,
 * including gallons needed and recommended tin combinations for
 * Sunburst Paints (Nassau, Bahamas) product sizes.
 *
 * NOTE ON TYPES: The original spec described `tinsRecommended` as a single
 * `TinRecommendation`, but the required logic ("most efficient combination
 * of 20L, 4L, and 1L tins") can only be represented as a list of tin
 * groups (e.g. two 20L tins + one 4L tin). `tinsRecommended` is therefore
 * typed as `TinRecommendation[]`, with one entry per tin size actually
 * needed (quantity > 0).
 *
 * NOTE ON UNITS: Tin sizes (1L / 4L / 20L) are defined by their sq ft
 * coverage, independent of the imperial "gallons" figure (350 sq ft per
 * gallon is a US-customary reference number and doesn't convert cleanly
 * to metric tins). Tin quantities are therefore calculated directly from
 * `totalCoverageSqFt`, not from `gallonsNeeded`.
 */

/** Raw dimensions and job parameters supplied by the user. */
export interface EstimatorInputs {
  /** Length of the room, in feet. Must be > 0. */
  lengthFt: number;
  /** Width of the room, in feet. Must be > 0. */
  widthFt: number;
  /** Ceiling height, in feet. Must be > 0. */
  heightFt: number;
  /** Number of doors to deduct from paintable area. Must be >= 0 (whole number). */
  numberOfDoors: number;
  /** Number of windows to deduct from paintable area. Must be >= 0 (whole number). */
  numberOfWindows: number;
  /** Number of coats of paint to apply. Must be >= 1 (whole number). */
  numberOfCoats: number;
}

/** A single tin-size line item in the recommended purchase list. */
export interface TinRecommendation {
  /** Tin size label, e.g. "20L", "4L", "1L". */
  size: string;
  /** Number of tins of this size to buy. */
  quantity: number;
  /** Total sq ft of coverage provided by this quantity of this tin size. */
  coverageSqFt: number;
}

/** Full result set produced by calculatePaintNeeds. */
export interface EstimatorResults {
  /** Raw wall area before door/window deductions, in sq ft. */
  totalWallArea: number;
  /** Wall area after door/window deductions, in sq ft. */
  paintableArea: number;
  /** Total gallons needed (US gallons, 350 sq ft/gallon coverage), rounded up to nearest 0.5. */
  gallonsNeeded: number;
  /** Recommended combination of tins (20L, then 4L, then 1L) covering the job with least waste. */
  tinsRecommended: TinRecommendation[];
  /** Total sq ft that must be covered, accounting for number of coats. */
  totalCoverageSqFt: number;
}

/** Coverage rate, in sq ft per gallon, used for the gallonsNeeded figure. */
const SQFT_PER_GALLON = 350;

/** Sq ft deducted per door. */
const DOOR_DEDUCTION_SQFT = 20;

/** Sq ft deducted per window. */
const WINDOW_DEDUCTION_SQFT = 15;

/** Tin catalog for Sunburst Paints (Nassau, Bahamas), ordered largest to smallest. */
const TIN_CATALOG: { size: string; coverageSqFt: number }[] = [
  { size: '20L', coverageSqFt: 250 },
  { size: '4L', coverageSqFt: 50 },
  { size: '1L', coverageSqFt: 12 },
];

/**
 * Validates estimator inputs, throwing a descriptive Error for any
 * invalid value (negative numbers, zero dimensions, non-integer counts, etc).
 *
 * @param inputs - The raw estimator inputs to validate.
 * @throws {Error} If any input is missing, non-finite, negative, zero
 * (for dimensions/coats), or non-integer (for door/window/coat counts).
 */
function validateInputs(inputs: EstimatorInputs): void {
  const { lengthFt, widthFt, heightFt, numberOfDoors, numberOfWindows, numberOfCoats } = inputs;

  const dimensions: [string, number][] = [
    ['lengthFt', lengthFt],
    ['widthFt', widthFt],
    ['heightFt', heightFt],
  ];

  for (const [name, value] of dimensions) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid input: "${name}" must be a finite number.`);
    }
    if (value <= 0) {
      throw new Error(`Invalid input: "${name}" must be greater than 0 (received ${value}).`);
    }
  }

  const counts: [string, number][] = [
    ['numberOfDoors', numberOfDoors],
    ['numberOfWindows', numberOfWindows],
  ];

  for (const [name, value] of counts) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid input: "${name}" must be a finite number.`);
    }
    if (value < 0) {
      throw new Error(`Invalid input: "${name}" cannot be negative (received ${value}).`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(`Invalid input: "${name}" must be a whole number (received ${value}).`);
    }
  }

  if (typeof numberOfCoats !== 'number' || !Number.isFinite(numberOfCoats)) {
    throw new Error('Invalid input: "numberOfCoats" must be a finite number.');
  }
  if (numberOfCoats < 1) {
    throw new Error(`Invalid input: "numberOfCoats" must be at least 1 (received ${numberOfCoats}).`);
  }
  if (!Number.isInteger(numberOfCoats)) {
    throw new Error(`Invalid input: "numberOfCoats" must be a whole number (received ${numberOfCoats}).`);
  }
}

/**
 * Rounds a number up to the nearest 0.5 increment.
 *
 * @param value - The value to round.
 * @returns The value rounded up to the nearest 0.5.
 */
function roundUpToHalf(value: number): number {
  return Math.ceil(value * 2) / 2;
}

/**
 * Calculates the most efficient combination of 20L, 4L, and 1L tins
 * needed to cover a given sq ft area, prioritizing larger tins first
 * to minimize the number of tins purchased.
 *
 * @param coverageSqFt - Total sq ft of coverage required.
 * @returns An array of TinRecommendation entries (one per tin size used,
 * omitting sizes with zero quantity), guaranteed to cover at least `coverageSqFt`.
 */
function recommendTins(coverageSqFt: number): TinRecommendation[] {
  let remaining = coverageSqFt;
  const recommendations: TinRecommendation[] = [];

  TIN_CATALOG.forEach((tin, index) => {
    const isLastSize = index === TIN_CATALOG.length - 1;

    // For every size except the smallest, take as many whole tins as fit.
    // For the smallest size, round up so the remainder is fully covered.
    const quantity = isLastSize
      ? Math.ceil(remaining / tin.coverageSqFt)
      : Math.floor(remaining / tin.coverageSqFt);

    if (quantity > 0) {
      recommendations.push({
        size: tin.size,
        quantity,
        coverageSqFt: quantity * tin.coverageSqFt,
      });
      remaining -= quantity * tin.coverageSqFt;
    }
  });

  // Edge case: coverage required is 0 or less (shouldn't normally happen
  // given input validation, but guard against it anyway).
  if (recommendations.length === 0) {
    const smallest = TIN_CATALOG[TIN_CATALOG.length - 1];
    recommendations.push({
      size: smallest.size,
      quantity: 1,
      coverageSqFt: smallest.coverageSqFt,
    });
  }

  return recommendations;
}

/**
 * Calculates paint needs (wall area, gallons, and recommended tin
 * purchases) for a rectangular room, given its dimensions and job details.
 *
 * @param inputs - Room dimensions, door/window counts, and number of coats.
 * @returns An EstimatorResults object with area, gallon, and tin figures.
 * @throws {Error} If any input is invalid (see validateInputs), or if
 * door/window deductions exceed the total wall area.
 */
export function calculatePaintNeeds(inputs: EstimatorInputs): EstimatorResults {
  validateInputs(inputs);

  const { lengthFt, widthFt, heightFt, numberOfDoors, numberOfWindows, numberOfCoats } = inputs;

  const totalWallArea = 2 * (lengthFt + widthFt) * heightFt;

  const doorDeduction = numberOfDoors * DOOR_DEDUCTION_SQFT;
  const windowDeduction = numberOfWindows * WINDOW_DEDUCTION_SQFT;
  const totalDeductions = doorDeduction + windowDeduction;

  if (totalDeductions >= totalWallArea) {
    throw new Error(
      `Invalid input: door and window deductions (${totalDeductions} sq ft) meet or exceed ` +
        `the total wall area (${totalWallArea} sq ft). Check numberOfDoors/numberOfWindows.`
    );
  }

  const paintableArea = totalWallArea - totalDeductions;
  const totalCoverageSqFt = paintableArea * numberOfCoats;

  const rawGallons = totalCoverageSqFt / SQFT_PER_GALLON;
  const gallonsNeeded = roundUpToHalf(rawGallons);

  const tinsRecommended = recommendTins(totalCoverageSqFt);

  return {
    totalWallArea,
    paintableArea,
    gallonsNeeded,
    tinsRecommended,
    totalCoverageSqFt,
  };
}

/**
 * Formats an EstimatorResults object into a clean, human-readable
 * multi-line summary string, suitable for display in a UI or console.
 *
 * @param results - The results returned by calculatePaintNeeds.
 * @returns A formatted summary string.
 */
export function formatEstimatorResults(results: EstimatorResults): string {
  const { totalWallArea, paintableArea, gallonsNeeded, tinsRecommended, totalCoverageSqFt } = results;

  const tinLines = tinsRecommended
    .map((tin) => `  - ${tin.quantity} x ${tin.size} tin(s) — covers ${tin.coverageSqFt} sq ft`)
    .join('\n');

  return [
    'Paint Estimate Summary',
    '-----------------------',
    `Total wall area:      ${totalWallArea.toFixed(1)} sq ft`,
    `Paintable area:       ${paintableArea.toFixed(1)} sq ft (after door/window deductions)`,
    `Total coverage needed:${' '.repeat(1)} ${totalCoverageSqFt.toFixed(1)} sq ft (all coats)`,
    `Gallons needed:       ${gallonsNeeded} gal`,
    'Recommended tins (Sunburst Paints, Nassau, Bahamas):',
    tinLines,
  ].join('\n');
}
