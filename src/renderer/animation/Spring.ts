const EPSILON = 1e-4;
const TAU = Math.PI * 2;
const SLEEP_EPSILON = 0.001;

export class Spring {
	private velocity = 0;
	private sleeping = true;
	private dampingRatio: number;
	private frequency: number;

	public position: number;
	public target: number;

	public constructor(initial: number, dampingRatio: number, frequency: number) {
		validateTuning(dampingRatio, frequency);
		this.dampingRatio = dampingRatio;
		this.frequency = frequency;
		this.position = initial;
		this.target = initial;
	}

	public configure(dampingRatio: number, frequency: number): void {
		validateTuning(dampingRatio, frequency);
		this.dampingRatio = dampingRatio;
		this.frequency = frequency;
	}

	public update(deltaTime: number): number {
		if (deltaTime <= 0) {
			return this.position;
		}

		const radialFrequency = this.frequency * TAU;
		const offset = this.position - this.target;
		const decay = Math.exp(-this.dampingRatio * radialFrequency * deltaTime);
		let nextPosition: number;
		let nextVelocity: number;

		if (this.dampingRatio === 1) {
			nextPosition = (offset * (1 + radialFrequency * deltaTime) + this.velocity * deltaTime) * decay + this.target;
			nextVelocity = (this.velocity * (1 - radialFrequency * deltaTime) - offset * radialFrequency * radialFrequency * deltaTime) * decay;
		} else if (this.dampingRatio < 1) {
			const c = Math.sqrt(1 - this.dampingRatio * this.dampingRatio);
			const i = Math.cos(radialFrequency * c * deltaTime);
			const j = Math.sin(radialFrequency * c * deltaTime);
			const z = c > EPSILON ? j / c : radialFrequency * deltaTime;
			const y = radialFrequency * c > EPSILON ? j / (radialFrequency * c) : deltaTime;

			nextPosition = (offset * (i + this.dampingRatio * z) + this.velocity * y) * decay + this.target;
			nextVelocity = (this.velocity * (i - z * this.dampingRatio) - offset * z * radialFrequency) * decay;
		} else {
			const c = Math.sqrt(this.dampingRatio * this.dampingRatio - 1);
			const r1 = -radialFrequency * (this.dampingRatio - c);
			const r2 = -radialFrequency * (this.dampingRatio + c);
			const co2 = (this.velocity - offset * r1) / (2 * radialFrequency * c);
			const co1 = offset - co2;
			const e1 = co1 * Math.exp(r1 * deltaTime);
			const e2 = co2 * Math.exp(r2 * deltaTime);

			nextPosition = e1 + e2 + this.target;
			nextVelocity = e1 * r1 + e2 * r2;
		}

		this.position = nextPosition;
		this.velocity = nextVelocity;
		this.sleeping = Math.abs(this.target - nextPosition) <= SLEEP_EPSILON && Math.abs(nextVelocity) <= SLEEP_EPSILON;
		if (this.sleeping) {
			this.position = this.target;
			this.velocity = 0;
		}
		return this.position;
	}

	public set(value: number): void {
		this.position = value;
		this.target = value;
		this.velocity = 0;
		this.sleeping = true;
	}

	public setTarget(value: number): void {
		if (this.target !== value) {
			this.sleeping = false;
		}
		this.target = value;
	}

	public isSleeping(): boolean {
		return this.sleeping;
	}
}

const validateTuning = (dampingRatio: number, frequency: number): void => {
	if (!Number.isFinite(dampingRatio) || dampingRatio < 0 || !Number.isFinite(frequency) || frequency <= 0) {
		throw new Error("Spring tuning requires a finite non-negative damping ratio and positive frequency.");
	}
};
