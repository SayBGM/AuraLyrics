const RESYNC_INTERVAL_SEC = 20;
const SEEK_PROBE_INTERVAL_SEC = 0.25;
const SEEK_SNAP_THRESHOLD_SEC = 1.25;

export class PlaybackSynchronizer {
	private currentTimestampSec = 0;
	private resyncElapsedSec = 0;
	private seekProbeElapsedSec = 0;

	public constructor(private readonly readPlayerTimestamp: () => number) {}

	public get timestampSec(): number {
		return this.currentTimestampSec;
	}

	public update(deltaTimeSec: number, isPlaying: boolean): void {
		if (!isPlaying) {
			return;
		}
		this.currentTimestampSec = Math.max(0, this.currentTimestampSec + deltaTimeSec);
		this.resyncElapsedSec += deltaTimeSec;
		this.seekProbeElapsedSec += deltaTimeSec;
		if (this.resyncElapsedSec >= RESYNC_INTERVAL_SEC) {
			this.resync();
			return;
		}
		if (this.seekProbeElapsedSec >= SEEK_PROBE_INTERVAL_SEC) {
			this.probePlayerTimestamp();
		}
	}

	public resync(): void {
		this.currentTimestampSec = this.readPlayerTimestamp();
		this.resyncElapsedSec = 0;
		this.seekProbeElapsedSec = 0;
	}

	private probePlayerTimestamp(): void {
		this.seekProbeElapsedSec = 0;
		const playerTimestampSec = this.readPlayerTimestamp();
		if (Math.abs(playerTimestampSec - this.currentTimestampSec) >= SEEK_SNAP_THRESHOLD_SEC) {
			this.currentTimestampSec = playerTimestampSec;
			this.resyncElapsedSec = 0;
		}
	}
}
