export type SplinePoint = {
	time: number;
	value: number;
};

export class LinearSpline {
	private readonly points: SplinePoint[];

	public constructor(points: SplinePoint[]) {
		this.points = [...points].sort((a, b) => a.time - b.time);
	}

	public at(time: number): number {
		if (this.points.length === 0) {
			return 0;
		}
		if (time <= this.points[0].time) {
			return this.points[0].value;
		}
		const last = this.points[this.points.length - 1];
		if (time >= last.time) {
			return last.value;
		}
		for (let index = 1; index < this.points.length; index += 1) {
			const next = this.points[index];
			const prev = this.points[index - 1];
			if (time <= next.time) {
				const progress = (time - prev.time) / (next.time - prev.time);
				return prev.value + (next.value - prev.value) * progress;
			}
		}
		return last.value;
	}
}

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));
