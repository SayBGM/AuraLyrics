export { baseStyles } from "./pip/baseStyles";
export { controlsStyles } from "./pip/controlsStyles";
export { interludeStyles } from "./pip/interludeStyles";
export { lyricsStyles } from "./pip/lyricsStyles";
export { metadataStyles } from "./pip/metadataStyles";
export { statusStyles } from "./pip/statusStyles";
export { transitionStyles } from "./pip/transitionStyles";

import { baseStyles } from "./pip/baseStyles";
import { controlsStyles } from "./pip/controlsStyles";
import { interludeStyles } from "./pip/interludeStyles";
import { lyricsStyles } from "./pip/lyricsStyles";
import { metadataStyles } from "./pip/metadataStyles";
import { statusStyles } from "./pip/statusStyles";
import { transitionStyles } from "./pip/transitionStyles";

export const pipStyleModules = [baseStyles, transitionStyles, controlsStyles, lyricsStyles, interludeStyles, metadataStyles, statusStyles];

export const pipStyles = pipStyleModules.join("\n");
