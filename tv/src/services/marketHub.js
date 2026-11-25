import {
	get24hrTickers,
	getExchangeInfo,
	getPremiumIndex,
	normalizeSymbol,
} from './binanceApi.js';

class MarketHub {
	constructor() {
		this.tickers = new Map();
		this.markPrices = new Map();
		this.status = 'connecting';
		this.listeners = new Set();
		this.tickListeners = new Set();
		this.statusListeners = new Set();
		this.miniWs = null;
		this.markWs = null;
		this.miniDelay = 1000;
		this.markDelay = 1000;
		this.flushScheduled = false;
		this.started = false;
	}

	async start() {
		if (this.started) return;
		this.started = true;
		await this.hydrateRest();
		this.connectMiniTicker();
		this.connectMarkPrice();
	}

	async hydrateRest() {
		try {
			const [, tickers, marks] = await Promise.all([
				getExchangeInfo().catch(() => null),
				get24hrTickers(),
				getPremiumIndex(),
			]);

			if (Array.isArray(tickers)) {
				for (const t of tickers) {
					const last = parseFloat(t.lastPrice);
					const open = parseFloat(t.openPrice);
					const chg = parseFloat(t.priceChange);
					const chgPct = parseFloat(t.priceChangePercent);
					this.tickers.set(t.symbol, {
						symbol: t.symbol,
						last,
						open,
						high: parseFloat(t.highPrice),
						low: parseFloat(t.lowPrice),
						volume: parseFloat(t.volume),
						quoteVolume: parseFloat(t.quoteVolume),
						chg,
						chgPct,
						dir: 0,
					});
				}
			}

			if (Array.isArray(marks)) {
				for (const m of marks) {
					this.markPrices.set(m.symbol, {
						symbol: m.symbol,
						markPrice: parseFloat(m.markPrice),
						indexPrice: parseFloat(m.indexPrice),
						fundingRate: parseFloat(m.lastFundingRate),
						nextFundingTime: Number(m.nextFundingTime),
					});
				}
			}

			this.emitBatch();
		} catch (err) {
			console.warn('[marketHub] REST hydration failed:', err);
		}
	}

	setStatus(next) {
		if (this.status === next) return;
		this.status = next;
		for (const cb of this.statusListeners) {
			try { cb(next); } catch (e) { console.error(e); }
		}
	}

	connectMiniTicker() {
		try {
			const ws = new WebSocket('wss://fstream.binance.com/ws/!miniTicker@arr');
			this.miniWs = ws;

			ws.onopen = () => {
				this.miniDelay = 1000;
				this.setStatus('connected');
			};

			ws.onmessage = (event) => {
				try {
					const arr = JSON.parse(event.data);
					if (!Array.isArray(arr)) return;
					const updated = [];
					for (const item of arr) {
						const sym = item.s;
						const last = parseFloat(item.c);
						const open = parseFloat(item.o);
						const high = parseFloat(item.h);
						const low = parseFloat(item.l);
						const volume = parseFloat(item.v);
						const quoteVolume = parseFloat(item.q);
						const chg = last - open;
						const chgPct = open > 0 ? (chg / open) * 100 : 0;
						const prev = this.tickers.get(sym);
						const dir = prev ? (last > prev.last ? 1 : last < prev.last ? -1 : 0) : 0;
						const record = {
							symbol: sym,
							last,
							open,
							high,
							low,
							volume,
							quoteVolume,
							chg,
							chgPct,
							dir,
						};
						this.tickers.set(sym, record);
						updated.push(record);
					}
					if (updated.length) {
						for (const cb of this.tickListeners) {
							try { cb(updated); } catch (e) { console.error(e); }
						}
						this.scheduleBatch();
					}
				} catch (err) {
					console.error('[marketHub] miniTicker parse error:', err);
				}
			};

			ws.onerror = () => {
				this.setStatus('reconnecting');
			};

			ws.onclose = () => {
				this.setStatus('reconnecting');
				const delay = this.miniDelay;
				this.miniDelay = Math.min(15000, Math.floor(this.miniDelay * 1.6));
				setTimeout(() => this.connectMiniTicker(), delay);
			};
		} catch (err) {
			this.setStatus('offline');
		}
	}

	connectMarkPrice() {
		try {
			const ws = new WebSocket('wss://fstream.binance.com/ws/!markPrice@arr@1s');
			this.markWs = ws;

			ws.onopen = () => {
				this.markDelay = 1000;
			};

			ws.onmessage = (event) => {
				try {
					const arr = JSON.parse(event.data);
					if (!Array.isArray(arr)) return;
					for (const m of arr) {
						this.markPrices.set(m.s, {
							symbol: m.s,
							markPrice: parseFloat(m.p),
							indexPrice: parseFloat(m.i),
							fundingRate: parseFloat(m.r),
							nextFundingTime: Number(m.T),
						});
					}
					this.scheduleBatch();
				} catch (err) {
					console.error('[marketHub] markPrice parse error:', err);
				}
			};

			ws.onclose = () => {
				const delay = this.markDelay;
				this.markDelay = Math.min(15000, Math.floor(this.markDelay * 1.6));
				setTimeout(() => this.connectMarkPrice(), delay);
			};
		} catch {
			// Ignore silent error
		}
	}

	scheduleBatch() {
		if (this.flushScheduled) return;
		this.flushScheduled = true;
		setTimeout(() => {
			this.flushScheduled = false;
			this.emitBatch();
		}, 350);
	}

	emitBatch() {
		for (const cb of this.listeners) {
			try { cb(this); } catch (e) { console.error(e); }
		}
	}

	getTicker(rawSymbol) {
		return this.tickers.get(normalizeSymbol(rawSymbol)) || null;
	}

	getMark(rawSymbol) {
		return this.markPrices.get(normalizeSymbol(rawSymbol)) || null;
	}

	onUpdate(cb) {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	onTick(cb) {
		this.tickListeners.add(cb);
		return () => this.tickListeners.delete(cb);
	}

	onStatus(cb) {
		this.statusListeners.add(cb);
		cb(this.status);
		return () => this.statusListeners.delete(cb);
	}
}

export const marketHub = new MarketHub();
