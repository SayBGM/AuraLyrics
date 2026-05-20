export class PlaybackClock {
	private frame = 0;
	private lastTime = 0;
	private running = false;

	public constructor(
		private readonly ownerWindow: Window,
		private readonly onTick: (deltaTime: number) => void
	) {}

	public start(): void {
		if (this.running) {
			return;
		}
		this.running = true;
		this.lastTime = this.ownerWindow.performance.now();
		this.frame = this.ownerWindow.requestAnimationFrame(this.tick);
	}

	public stop(): void {
		if (!this.running) {
			return;
		}
		this.running = false;
		this.ownerWindow.cancelAnimationFrame(this.frame);
	}

	private readonly tick = (now: number): void => {
		if (!this.running) {
			return;
		}
		const deltaTime = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
		this.lastTime = now;
		this.onTick(deltaTime || 1 / 60);
		this.frame = this.ownerWindow.requestAnimationFrame(this.tick);
	};
}
