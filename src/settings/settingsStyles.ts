export { controlsStyles } from "./styles/controls";
export { highlightPreviewStyles } from "./styles/highlightPreview";
export { navigationStyles } from "./styles/navigation";
export { responsiveStyles } from "./styles/responsive";
export { shellStyles } from "./styles/shell";
export { trackDelayStyles } from "./styles/trackDelay";

import { controlsStyles } from "./styles/controls";
import { highlightPreviewStyles } from "./styles/highlightPreview";
import { navigationStyles } from "./styles/navigation";
import { responsiveStyles } from "./styles/responsive";
import { shellStyles } from "./styles/shell";
import { trackDelayStyles } from "./styles/trackDelay";

export const settingsStyleModules = [shellStyles, navigationStyles, controlsStyles, trackDelayStyles, highlightPreviewStyles, responsiveStyles];

export const settingsStyles = settingsStyleModules.join("\n");
