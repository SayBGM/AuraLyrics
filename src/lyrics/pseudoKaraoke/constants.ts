// Tuning constants for the pseudo-karaoke synthesis. These were validated
// against Spotify Audio Analysis; re-tune per §11.3 for other audio sources.

// §5.1 scoreVocalCandidate — usable segment duration bounds (ms).
export const MIN_SEGMENT_MS = 35;
export const MAX_SEGMENT_MS = 650;

// §8.2 DP cost weights.
export const DP_MASS_ERROR_BASE = 4.2;
export const DP_MASS_ERROR_CONFIDENCE = 0.55;
export const DP_DURATION_ERROR_LEXICAL = 2.05;
export const DP_DURATION_ERROR_SPACE = 0.8;
export const DP_CUMULATIVE_ERROR = 2.1;

// Minimum gap between boundaries (ms).
export const MIN_GAP_MS = 24;

// Refinement: onset-aware unit merging.
// A candidate counts as a vocal onset once its refined score clears this bar.
export const ONSET_STRONG = 0.5;
// Merge units down toward the onset count when lexical units exceed onsets by this ratio.
export const ONSET_OVERSPLIT_RATIO = 1.6;

// Refinement: below this line confidence, skip DP and distribute by weight evenly.
export const LOW_CONFIDENCE_FLOOR = 0.18;
