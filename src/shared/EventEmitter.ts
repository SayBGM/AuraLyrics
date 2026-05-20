export type Unsubscribe = () => void;

export class EventEmitter<T> {
	private readonly listeners = new Set<(value: T) => void>();

	public emit(value: T): void {
		for (const listener of this.listeners) {
			listener(value);
		}
	}

	public subscribe(listener: (value: T) => void): Unsubscribe {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
