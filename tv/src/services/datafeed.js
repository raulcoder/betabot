import {
	clampFuturesStatPeriod,
	extractStudySuffix,
	getExchangeInfo,
	getFundingRateHist,
	getKlines,
	getLongShortRatioHist,
	getOpenInterestHist,
	getServerTime,
	getSymbolMeta,
	intervalToMs,
	normalizeSymbol,
	resolutionToBinance,
} from './binanceApi.js';
import { replayController } from './replayController.js';
import { subscribeOnStream, unsubscribeFromStream } from './streaming.js';

const SUPPORTED_RESOLUTIONS = ['1', '3', '5', '15', '30', '60', '120', '240', '360', '480', '720', '1D', '3D', '1W', '1M'];

const configurationData = {
	supported_resolutions: SUPPORTED_RESOLUTIONS,
	exchanges: [
		{ value: '', name: 'All Exchanges', desc: '' },
		{ value: 'BINANCE', name: 'Binance Futures', desc: 'Binance USD-M Perpetual Futures' },
	],
	symbols_types: [
		{ name: 'All types', value: '' },
		{ name: 'Crypto Perpetual', value: 'crypto' },
	],
	supports_marks: false,
	supports_timescale_marks: false,
	supports_time: true,
};

function buildOpenInterestBars(data, stepMs) {
	if (!Array.isArray(data) || !data.length) return [];
	const bars = [];
	for (let i = 0; i < data.length; i++) {
		const curr = parseFloat(data[i].sumOpenInterest);
		const prev = i > 0 ? parseFloat(data[i - 1].sumOpenInterest) : curr;
		const ts = Number(data[i].timestamp) - stepMs;
		bars.push({
			time: ts,
			open: prev,
			close: curr,
			high: Math.max(prev, curr),
			low: Math.min(prev, curr),
			volume: curr >= prev ? 1 : 0,
		});
	}
	return bars;
}

export const Datafeed = {
	onReady(callback) {
		setTimeout(() => callback(configurationData), 0);
	},

	getServerTime(callback) {
		getServerTime()
			.then((ts) => callback(ts))
			.catch(() => callback(Math.floor(Date.now() / 1000)));
	},

	async searchSymbols(userInput, exchange, symbolType, onResultReadyCallback) {
		try {
			const cache = await getExchangeInfo();
			const q = (userInput || '').trim().toUpperCase().replace(/\//g, '').replace(/\.P$/, '');
			const results = [];

			for (const item of cache.symbols) {
				if (exchange && exchange !== 'BINANCE') continue;
				if (symbolType && symbolType !== 'crypto') continue;
				if (
					!q ||
					item.symbol.includes(q) ||
					item.baseAsset.includes(q)
				) {
					results.push({
						symbol: item.displaySymbol,
						full_name: `BINANCE:${item.displaySymbol}`,
						description: `${item.baseAsset} / ${item.quoteAsset} Perpetual Futures`,
						exchange: 'BINANCE',
						ticker: item.symbol,
						type: 'crypto',
					});
				}
				if (results.length >= 60) break;
			}
			onResultReadyCallback(results);
		} catch (err) {
			console.error('[datafeed] searchSymbols error:', err);
			onResultReadyCallback([]);
		}
	},

	async resolveSymbol(symbolName, onSymbolResolvedCallback, onResolveErrorCallback) {
		try {
			const suffix = extractStudySuffix(symbolName);
			const sym = normalizeSymbol(symbolName);
			const meta = await getSymbolMeta(sym);

			if (suffix) {
				const pricescale = suffix === '#OpenInterest' ? 100 : 10000;
				onSymbolResolvedCallback({
					ticker: `${sym}${suffix}`,
					name: `${sym}${suffix}`,
					full_name: `BINANCE:${sym}${suffix}`,
					description: `${sym} ${suffix.slice(1)}`,
					type: 'crypto',
					session: '24x7',
					timezone: 'Etc/UTC',
					exchange: 'BINANCE',
					minmov: 1,
					pricescale,
					has_intraday: true,
					has_no_volume: true,
					has_weekly_and_monthly: true,
					supported_resolutions: SUPPORTED_RESOLUTIONS,
					volume_precision: 2,
					data_status: 'streaming',
				});
				return;
			}

			if (!meta) {
				onResolveErrorCallback(`Unknown symbol: ${symbolName}`);
				return;
			}

			onSymbolResolvedCallback({
				ticker: meta.symbol,
				name: meta.displaySymbol,
				full_name: `BINANCE:${meta.displaySymbol}`,
				description: `${meta.baseAsset} / ${meta.quoteAsset} Perpetual`,
				type: 'crypto',
				session: '24x7',
				timezone: 'Etc/UTC',
				exchange: 'BINANCE',
				minmov: 1,
				pricescale: meta.pricescale,
				has_intraday: true,
				has_no_volume: false,
				has_weekly_and_monthly: true,
				supported_resolutions: SUPPORTED_RESOLUTIONS,
				volume_precision: meta.quantityPrecision,
				data_status: 'streaming',
			});
		} catch (err) {
			console.error('[datafeed] resolveSymbol error:', err);
			onResolveErrorCallback(err.message || 'resolveSymbol failed');
		}
	},

	async getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
		const { from, to } = periodParams;
		const rawName = symbolInfo.ticker || symbolInfo.name;
		const suffix = extractStudySuffix(rawName);
		const symbol = normalizeSymbol(rawName);
		const interval = resolutionToBinance(resolution);

		try {
			if (suffix === '#OpenInterest') {
				const period = clampFuturesStatPeriod(interval);
				const stepMs = intervalToMs(period);
				const endMs = Math.min(Date.now(), to * 1000 + stepMs);
				const startMs = Math.max(0, from * 1000);
				// Binance openInterestHist only keeps ~30 days
				const thirtyDaysAgo = Date.now() - 29 * 86_400_000;
				if (endMs < thirtyDaysAgo) {
					onHistoryCallback([], { noData: true });
					return;
				}
				const data = await getOpenInterestHist(symbol, period, {
					startTime: Math.max(startMs, thirtyDaysAgo),
					endTime: endMs,
					limit: 500,
				});
				const bars = buildOpenInterestBars(data, stepMs);
				onHistoryCallback(bars, { noData: bars.length === 0 });
				return;
			}

			if (suffix === '#FundingRate') {
				const data = await getFundingRateHist(symbol, {
					startTime: from * 1000,
					endTime: to * 1000,
					limit: 1000,
				});
				const bars = (Array.isArray(data) ? data : []).map((d) => {
					const val = parseFloat(d.fundingRate) * 100;
					return {
						time: Number(d.fundingTime),
						open: val,
						high: val,
						low: val,
						close: val,
						volume: val >= 0 ? 1 : 0,
					};
				});
				onHistoryCallback(bars, { noData: bars.length === 0 });
				return;
			}

			if (suffix === '#LongShortRatio') {
				const period = clampFuturesStatPeriod(interval);
				const stepMs = intervalToMs(period);
				const thirtyDaysAgo = Date.now() - 29 * 86_400_000;
				const endMs = Math.min(Date.now(), to * 1000 + stepMs);
				if (endMs < thirtyDaysAgo) {
					onHistoryCallback([], { noData: true });
					return;
				}
				const data = await getLongShortRatioHist(symbol, period, {
					startTime: Math.max(from * 1000, thirtyDaysAgo),
					endTime: endMs,
					limit: 500,
				});
				const bars = (Array.isArray(data) ? data : []).map((d) => {
					const val = parseFloat(d.longShortRatio);
					return {
						time: Number(d.timestamp) - stepMs,
						open: val,
						high: val,
						low: val,
						close: val,
						volume: val >= 1 ? 1 : 0,
					};
				});
				onHistoryCallback(bars, { noData: bars.length === 0 });
				return;
			}

			// Standard OHLCV Futures klines with clean backward/chunked pagination
			const replayActive = replayController.isActiveFor(symbol);
			const replayCutoffMs = replayActive ? replayController.cutoffSec * 1000 : Infinity;
			const allBars = [];
			let cursorEnd = Math.min(to * 1000, replayCutoffMs);
			const startMs = from * 1000;
			let safety = 0;

			while (cursorEnd > startMs && safety < 6) {
				safety++;
				const raw = await getKlines(symbol, interval, {
					startTime: startMs,
					endTime: cursorEnd,
					limit: 1000,
				});
				if (!Array.isArray(raw) || raw.length === 0) break;

				const chunk = raw.map((k) => ({
					time: Number(k[0]),
					open: parseFloat(k[1]),
					high: parseFloat(k[2]),
					low: parseFloat(k[3]),
					close: parseFloat(k[4]),
					volume: parseFloat(k[5]),
				}));

				allBars.unshift(...chunk);
				const earliest = chunk[0].time;
				if (raw.length < 1000 || earliest <= startMs) break;
				cursorEnd = earliest - 1;
			}

			// Deduplicate and sort ascending
			const dedupMap = new Map();
			for (const b of allBars) {
				if (b.time <= replayCutoffMs) {
					dedupMap.set(b.time, b);
				}
			}
			const bars = Array.from(dedupMap.values()).sort((a, b) => a.time - b.time);
			onHistoryCallback(bars, { noData: bars.length === 0 });
		} catch (err) {
			console.error('[datafeed] getBars error:', err);
			onErrorCallback(err.message || 'Failed to load bars');
		}
	},

	subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID) {
		subscribeOnStream(symbolInfo, resolution, onRealtimeCallback, subscriberUID);
	},

	unsubscribeBars(subscriberUID) {
		unsubscribeFromStream(subscriberUID);
	},
};

export default Datafeed;
