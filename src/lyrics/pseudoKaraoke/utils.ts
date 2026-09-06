import { clamp, median } from "../../shared/math";

export { clamp, median };

export const clamp01 = (value: number): number => clamp(value, 0, 1);
