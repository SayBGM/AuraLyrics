export type ParentheticalTextRole = "main" | "parenthetical";

export type ParentheticalScanEvent =
	| {
			kind: "text";
			text: string;
			role: ParentheticalTextRole;
			startUnit: number;
			endUnit: number;
	  }
	| {
			kind: "open" | "close";
			startUnit: number;
			endUnit: number;
	  };

export type ParentheticalScanResult = {
	events: ParentheticalScanEvent[];
	depthAfter: number;
	unitCount: number;
	containsDelimiter: boolean;
};

/**
 * Scans round-parenthetical structure while carrying nesting depth across provider
 * tokens. Only the outer boundary is emitted; nested delimiters are hidden while
 * their text remains part of the same parenthetical run.
 */
export const scanParentheticalText = (text: string, depthBefore = 0): ParentheticalScanResult => {
	const chars = [...text];
	const events: ParentheticalScanEvent[] = [];
	let depth = Math.max(0, depthBefore);
	let buffer = "";
	let bufferStart = 0;
	let role: ParentheticalTextRole = depth > 0 ? "parenthetical" : "main";
	let containsDelimiter = false;

	const flush = (endUnit: number): void => {
		if (buffer.length > 0) {
			events.push({ kind: "text", text: buffer, role, startUnit: bufferStart, endUnit });
		}
		buffer = "";
		bufferStart = endUnit;
	};

	for (const [index, char] of chars.entries()) {
		if (char === "(") {
			containsDelimiter = true;
			if (depth === 0) {
				flush(index);
				events.push({ kind: "open", startUnit: index, endUnit: index + 1 });
				role = "parenthetical";
				bufferStart = index + 1;
			}
			depth += 1;
			continue;
		}
		if (char === ")") {
			containsDelimiter = true;
			if (depth > 0) {
				depth -= 1;
				if (depth === 0) {
					flush(index);
					events.push({ kind: "close", startUnit: index, endUnit: index + 1 });
					role = "main";
					bufferStart = index + 1;
				}
				continue;
			}
		}
		buffer += char;
	}
	flush(chars.length);

	return { events, depthAfter: depth, unitCount: chars.length, containsDelimiter };
};
