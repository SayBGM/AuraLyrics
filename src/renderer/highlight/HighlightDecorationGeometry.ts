export type HighlightDirection = "ltr" | "rtl";

export type HighlightRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
};

export type HighlightMeasuredPiece = {
	index: number;
	rects: readonly HighlightRect[];
	fontSizePx: number;
};

export type HighlightDecorationFragmentLayout = {
	left: number;
	top: number;
	width: number;
	height: number;
	fontSizePx: number;
	advanceStartPx: number;
	advanceEndPx: number;
};

export type HighlightDecorationLayout = {
	direction: HighlightDirection;
	fragments: HighlightDecorationFragmentLayout[];
	pieceWidthsPx: number[];
	totalAdvancePx: number;
};

type MeasuredRectEntry = {
	pieceIndex: number;
	rect: HighlightRect;
	fontSizePx: number;
};

type VisualRow = {
	entries: MeasuredRectEntry[];
	left: number;
	right: number;
	top: number;
	bottom: number;
	fontSizePx: number;
};

export const buildHighlightDecorationLayout = (
	hostRect: HighlightRect,
	pieces: readonly HighlightMeasuredPiece[],
	direction: HighlightDirection,
	rowTolerancePx = 1
): HighlightDecorationLayout => {
	const pieceCount = pieces.reduce((count, piece) => Math.max(count, piece.index + 1), 0);
	const pieceWidthsPx = Array.from({ length: pieceCount }, () => 0);
	const entries = pieces
		.flatMap((piece) =>
			piece.rects.map((rect) => ({
				pieceIndex: piece.index,
				rect: normalizeRect(rect),
				fontSizePx: finitePositive(piece.fontSizePx, 16),
			}))
		)
		.filter(({ rect }) => rect.width > 0 && rect.height > 0)
		.sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
	const rows: VisualRow[] = [];

	for (const entry of entries) {
		let row: VisualRow | undefined;
		for (let index = rows.length - 1; index >= 0; index -= 1) {
			if (isSameVisualRow(rows[index], entry.rect, rowTolerancePx)) {
				row = rows[index];
				break;
			}
		}
		if (row) {
			row.entries.push(entry);
			row.left = Math.min(row.left, entry.rect.left);
			row.right = Math.max(row.right, entry.rect.right);
			row.top = Math.min(row.top, entry.rect.top);
			row.bottom = Math.max(row.bottom, entry.rect.bottom);
			row.fontSizePx = Math.max(row.fontSizePx, entry.fontSizePx);
			continue;
		}
		rows.push({
			entries: [entry],
			left: entry.rect.left,
			right: entry.rect.right,
			top: entry.rect.top,
			bottom: entry.rect.bottom,
			fontSizePx: entry.fontSizePx,
		});
	}

	rows.sort((left, right) => left.top - right.top || left.left - right.left);
	const fragments: HighlightDecorationFragmentLayout[] = [];
	let cumulativeAdvancePx = 0;
	for (const row of rows) {
		const rowWidth = Math.max(0, row.right - row.left);
		if (rowWidth <= 0) {
			continue;
		}
		allocateRowWidths(row, direction, pieceWidthsPx);
		fragments.push({
			left: row.left - hostRect.left,
			top: row.top - hostRect.top,
			width: rowWidth,
			height: Math.max(0, row.bottom - row.top),
			fontSizePx: row.fontSizePx,
			advanceStartPx: cumulativeAdvancePx,
			advanceEndPx: cumulativeAdvancePx + rowWidth,
		});
		cumulativeAdvancePx += rowWidth;
	}

	return {
		direction,
		fragments,
		pieceWidthsPx,
		totalAdvancePx: cumulativeAdvancePx,
	};
};

const allocateRowWidths = (row: VisualRow, direction: HighlightDirection, pieceWidthsPx: number[]): void => {
	const rowWidth = row.right - row.left;
	const ordered = [...row.entries].sort((left, right) =>
		direction === "rtl"
			? right.rect.right - left.rect.right || right.rect.left - left.rect.left
			: left.rect.left - right.rect.left || left.rect.right - right.rect.right
	);
	const spans = ordered.map(({ rect }) =>
		direction === "rtl" ? { start: row.right - rect.right, end: row.right - rect.left } : { start: rect.left - row.left, end: rect.right - row.left }
	);
	const boundaries = [0];
	for (let index = 1; index < spans.length; index += 1) {
		const midpoint = (spans[index - 1].end + spans[index].start) / 2;
		boundaries.push(clamp(midpoint, boundaries[index - 1], rowWidth));
	}
	boundaries.push(rowWidth);
	for (let index = 0; index < ordered.length; index += 1) {
		const width = Math.max(0, boundaries[index + 1] - boundaries[index]);
		pieceWidthsPx[ordered[index].pieceIndex] = (pieceWidthsPx[ordered[index].pieceIndex] ?? 0) + width;
	}
};

const isSameVisualRow = (row: VisualRow, rect: HighlightRect, tolerancePx: number): boolean => {
	const overlap = Math.min(row.bottom, rect.bottom) - Math.max(row.top, rect.top);
	const minimumHeight = Math.min(row.bottom - row.top, rect.height);
	if (overlap >= minimumHeight * 0.5) {
		return true;
	}
	const rowCenter = (row.top + row.bottom) / 2;
	const rectCenter = (rect.top + rect.bottom) / 2;
	return Math.abs(rowCenter - rectCenter) <= tolerancePx;
};

const normalizeRect = (rect: HighlightRect): HighlightRect => {
	const left = finite(rect.left, 0);
	const right = finite(rect.right, left + finite(rect.width, 0));
	const top = finite(rect.top, 0);
	const bottom = finite(rect.bottom, top + finite(rect.height, 0));
	return {
		left,
		right,
		top,
		bottom,
		width: Math.max(0, right - left),
		height: Math.max(0, bottom - top),
	};
};

const finite = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

const finitePositive = (value: number, fallback: number): number => (Number.isFinite(value) && value > 0 ? value : fallback);

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(Math.max(value, minimum), maximum);
