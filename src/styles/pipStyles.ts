export { baseStyles } from "./pip/baseStyles";
export { controlsStyles } from "./pip/controlsStyles";
export { interludeStyles } from "./pip/interludeStyles";
export { lyricsStyles } from "./pip/lyricsStyles";
export { statusStyles } from "./pip/statusStyles";

import { baseStyles } from "./pip/baseStyles";
import { controlsStyles } from "./pip/controlsStyles";
import { interludeStyles } from "./pip/interludeStyles";
import { lyricsStyles } from "./pip/lyricsStyles";
import { statusStyles } from "./pip/statusStyles";

export const pipStyleModules = [baseStyles, controlsStyles, lyricsStyles, interludeStyles, statusStyles];

export const pipStyles = pipStyleModules.join("\n");
