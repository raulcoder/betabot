import {
	clampFuturesStatPeriod,
	extractStudySuffix,
	getFundingRateHist,
	getLongShortRatioHist,
	getOpenInterestHist,
	intervalToMs,
	normalizeSymbol,
	resolutionToBinance,
} from './binanceApi.js';
import { replayController } from './replayController.js';

const subscriptions = new Map();

export function subscribeOnStream(symbolInfo, resolution, onRealtimeCallback, subscriberUID) {
	unsubscribeFromStream(subscriberUID);

	const rawName = symbolInfo.ticker || symbolInfo.name;
	const suffix = extractStudySuffix(rawName);
	const symbol = normalizeSymbol(rawName);
	const binanceInterval = resolutionToBinance(resolution);

	const state = {
		uid: subscriberUID,
		closed: false,
		socket: null,
		timer: null,
		replayCb: null,
		reconnectDelay: 1000,
	};
	subscriptions.set(subscriberUID, state);

	if (!suffix && replayController.isActiveFor(symbol)) {
		state.replayCb = onRealtimeCallback;
		replayController.registerRealtimeCallback(onRealtimeCallback);
		return;
	}

	if (suffix === '#OpenInterest') {
		const period = clampFuturesStatPeriod(binanceInterval);
		const stepMs = intervalToMs(period);
		const poll = async () => {
			if (state.closed) return;
			try {
				const data = await getOpenInterestHist(symbol, period, { limit: 2 });
				if (Array.isArray(data) && data.length >= 2) {
					const prev = parseFloat(data[data.length - 2].sumOpenInterest);
					const curr = parseFloat(data[data.length - 1].sumOpenInterest);
					const ts = Number(data[data.length - 1].timestamp) - stepMs;
					onRealtimeCallback({
						time: ts,
						open: prev,
						close: curr,
						high: Math.max(prev, curr),
						low: Math.min(prev, curr),
						volume: curr >= prev ? 1 : 0,
					});
				}
			} catch (err) {
				console.warn('[streaming] OI poll error:', err.message);
			}
		};
		state.timer = window.setInterval(poll, 10000);
		return;
	}

	if (suffix === '#FundingRate') {
		const poll = async () => {
			if (state.closed) return;
			try {
				const data = await getFundingRateHist(symbol, { limit: 1 });
				if (Array.isArray(data) && data.length) {
					const item = data[data.length - 1];
					const val = parseFloat(item.fundingRate) * 100;
					onRealtimeCallback({
						time: Number(item.fundingTime),
						open: val,
						high: val,
						low: val,
						close: val,
						volume: val >= 0 ? 1 : 0,
					});
				}
			} catch (err) {
				console.warn('[streaming] Funding poll error:', err.message);
			}
		};
		state.timer = window.setInterval(poll, 30000);
		return;
	}

	if (suffix === '#LongShortRatio') {
		const period = clampFuturesStatPeriod(binanceInterval);
		const stepMs = intervalToMs(period);
		const poll = async () => {
			if (state.closed) return;
			try {
				const data = await getLongShortRatioHist(symbol, period, { limit: 1 });
				if (Array.isArray(data) && data.length) {
					const item = data[data.length - 1];
					const val = parseFloat(item.longShortRatio);
					onRealtimeCallback({
						time: Number(item.timestamp) - stepMs,
						open: val,
						high: val,
						low: val,
						close: val,
						volume: val >= 1 ? 1 : 0,
					});
				}
			} catch (err) {
				console.warn('[streaming] L/S poll error:', err.message);
			}
		};
		state.timer = window.setInterval(poll, 15000);
		return;
	}

	const connectKline = () => {
		if (state.closed) return;
		const streamName = `${symbol.toLowerCase()}@kline_${binanceInterval}`;
		const ws = new WebSocket(`wss://fstream.binance.com/ws/${streamName}`);
		state.socket = ws;

		ws.onopen = () => {
			state.reconnectDelay = 1000;
		};

		ws.onmessage = (event) => {
			if (state.closed) return;
			try {
				const payload = JSON.parse(event.data);
				const k = payload.k;
				if (!k) return;
				onRealtimeCallback({
					time: Number(k.t),
					open: parseFloat(k.o),
					high: parseFloat(k.h),
					low: parseFloat(k.l),
					close: parseFloat(k.c),
					volume: parseFloat(k.v),
				});
			} catch (err) {
				console.error('[streaming] kline parse error:', err);
			}
		};

		ws.onclose = () => {
			if (state.closed) return;
			const wait = state.reconnectDelay;
			state.reconnectDelay = Math.min(15000, Math.floor(state.reconnectDelay * 1.6));
			setTimeout(connectKline, wait);
		};
	};

	connectKline();
}

export function unsubscribeFromStream(subscriberUID) {
	const state = subscriptions.get(subscriberUID);
	if (!state) return;
	state.closed = true;
	if (state.replayCb) {
		replayController.unregisterRealtimeCallback(state.replayCb);
		state.replayCb = null;
	}
	if (state.timer !== null) {
		clearInterval(state.timer);
		state.timer = null;
	}
	if (state.socket) {
		try {
			state.socket.onclose = null;
			state.socket.close();
		} catch {
			// ignore close error
		}
		state.socket = null;
	}
	subscriptions.delete(subscriberUID);
}
