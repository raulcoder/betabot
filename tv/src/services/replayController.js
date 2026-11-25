import { normalizeSymbol } from './binanceApi.js';
import { showToast } from '../components/toast.js';

class ReplayController {
	constructor() {
		this.active = false;
		this.selecting = false;
		this.symbol = null;
		this.interval = null;
		this.cutoffSec = 0;
		this.playing = false;
		this.speedMs = 600;
		this.futureBars = [];
		this.cursorIdx = 0;
		this.subscriberCb = null;
		this.playTimer = null;
		this.listeners = new Set();
	}

	onChange(cb) {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	emit() {
		const snap = this.getState();
		for (const cb of this.listeners) {
			try { cb(snap); } catch (e) { console.error(e); }
		}
	}

	getState() {
		return {
			active: this.active,
			selecting: this.selecting,
			symbol: this.symbol,
			interval: this.interval,
			cutoffSec: this.cutoffSec,
			playing: this.playing,
			speedMs: this.speedMs,
			remaining: Math.max(0, this.futureBars.length - this.cursorIdx),
			totalFuture: this.futureBars.length,
			cursorIdx: this.cursorIdx,
		};
	}

	setSelecting(flag) {
		this.selecting = Boolean(flag);
		this.emit();
	}

	isActiveFor(symbol) {
		return this.active && normalizeSymbol(symbol) === this.symbol;
	}

	start(symbol, interval, cutoffSec, futureBars) {
		this.stopTimer();
		this.selecting = false;
		this.active = true;
		this.symbol = normalizeSymbol(symbol);
		this.interval = interval;
		this.cutoffSec = Number(cutoffSec);
		this.playing = false;
		this.futureBars = Array.isArray(futureBars)
			? [...futureBars].sort((a, b) => a.time - b.time)
			: [];
		this.cursorIdx = 0;
		this.emit();
	}

	registerRealtimeCallback(cb) {
		this.subscriberCb = cb;
	}

	unregisterRealtimeCallback(cb) {
		if (!cb || this.subscriberCb === cb) {
			this.subscriberCb = null;
		}
	}

	stepForward() {
		if (!this.active) return false;
		if (this.cursorIdx >= this.futureBars.length) {
			this.pause();
			showToast({ title: 'Bar Replay', message: 'Reached live market edge.', tone: 'info' });
			return false;
		}
		const bar = this.futureBars[this.cursorIdx++];
		this.cutoffSec = Math.floor(bar.time / 1000);
		if (this.subscriberCb) {
			try { this.subscriberCb(bar); } catch (err) { console.warn('[replay] cb error:', err); }
		}
		if (this.cursorIdx >= this.futureBars.length) {
			this.pause();
			showToast({ title: 'Bar Replay', message: 'Replay reached the latest candle.', tone: 'info' });
		} else {
			this.emit();
		}
		return true;
	}

	play() {
		if (!this.active || this.playing) return;
		if (this.cursorIdx >= this.futureBars.length) {
			showToast({ title: 'Bar Replay', message: 'No more bars to replay.', tone: 'info' });
			return;
		}
		this.playing = true;
		this.playTimer = window.setInterval(() => {
			if (!this.stepForward()) {
				this.pause();
			}
		}, this.speedMs);
		this.emit();
	}

	pause() {
		this.stopTimer();
		if (this.playing) {
			this.playing = false;
			this.emit();
		}
	}

	togglePlay() {
		if (this.playing) this.pause();
		else this.play();
	}

	setSpeed(ms) {
		this.speedMs = Math.max(80, Math.min(2000, Number(ms) || 600));
		if (this.playing) {
			this.stopTimer();
			this.playTimer = window.setInterval(() => {
				if (!this.stepForward()) {
					this.pause();
				}
			}, this.speedMs);
		}
		this.emit();
	}

	stopTimer() {
		if (this.playTimer !== null) {
			clearInterval(this.playTimer);
			this.playTimer = null;
		}
	}

	stop() {
		this.stopTimer();
		this.active = false;
		this.selecting = false;
		this.playing = false;
		this.symbol = null;
		this.interval = null;
		this.cutoffSec = 0;
		this.futureBars = [];
		this.cursorIdx = 0;
		this.subscriberCb = null;
		this.emit();
	}
}

export const replayController = new ReplayController();
