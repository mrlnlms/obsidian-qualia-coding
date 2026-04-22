/**
 * Generate a sequence of scale points for a continuous magnitude type.
 *
 * Returns an array of strings whose decimal precision follows the `stepStr`
 * exactly — if the user types "0.5" the output is `["0.0", "0.5", "1.0"]`, if
 * "0.25" it's `["0.00", "0.25", ...]`. This keeps the chip list visually
 * consistent (avoids mixed-precision output like `["0", "0.5", "1"]`) and
 * also sidesteps floating-point drift (toFixed rounds the accumulator each
 * tick).
 *
 * Invalid inputs and out-of-range configurations return `null` so the caller
 * can show a validation error instead of generating nonsense.
 */
export function generateContinuousRange(
    minStr: string,
    maxStr: string,
    stepStr: string,
    options: { maxPoints?: number } = {},
): string[] | null {
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    const stepTrimmed = stepStr.trim();
    // Empty step defaults to 1; invalid or non-positive step is an error.
    const step = stepTrimmed === '' ? 1 : parseFloat(stepTrimmed);
    const maxPoints = options.maxPoints ?? 100;

    if (isNaN(min) || isNaN(max) || isNaN(step) || step <= 0 || min > max) return null;

    // Infer decimal places from the step input so all generated values
    // share the same visual precision.
    const decimals = stepTrimmed.includes('.') ? stepTrimmed.split('.')[1]!.length : 0;

    const values: string[] = [];
    // `step * 0.001` tolerates float drift so `max` isn't silently dropped
    // on ranges like min=0 max=1 step=0.1 where accumulation overshoots.
    for (let v = min; v <= max + step * 0.001; v += step) {
        values.push(v.toFixed(decimals));
    }

    if (values.length > maxPoints) return null;
    return values;
}
