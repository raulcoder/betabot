const FAPI_BASE = 'https://fapi.binance.com';
const OI_PERIODS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

let exchangeCache = {
	expiresAt: 0,
	symbols: [],
	bySymbol: new Map(),
};

let exchangeInflight = null;

export async function makeApiRequest(path) {
	const cleanPath = path.startsWith('/') ? path.slice(1) : path;
	const response = await fetch(`${FAPI_BASE}/${cleanPath}`, {
		method: 'GET',
		mode: 'cors',
	});
	if (!response.ok) {
		throw new Error(`Binance HTTP ${response.status} on ${cleanPath}`);
	}
	return response.json();
}

export function extractStudySuffix(raw) {
	if (!raw) return '';
	const idx = raw.indexOf('#');
	return idx >= 0 ? raw.slice(idx) : '';
}

export function normalizeSymbol(raw) {
	if (!raw) return 'BTCUSDT';
	const base = String(raw).split('#')[0].trim().toUpperCase();
	return base
		.replace(/^BINANCE:/, '')
		.replace(/\.P$/, '')
		.replace(/\//g, '');
}

export function formatDisplaySymbol(raw) {
	const sym = normalizeSymbol(raw);
	return `${sym}.P`;
}

export function resolutionToBinance(resolution) {
	const res = String(resolution || '5').trim();
	if (res === 'M' || res === '1M') return '1M';
	if (res === 'W' || res === '1W') return '1w';
	if (res === 'D' || res === '1D') return '1d';
	if (/^\d+D$/i.test(res)) return `${res.slice(0, -1)}d`;
	if (/^\d+$/.test(res)) {
		const mins = parseInt(res, 10);
		if (mins >= 60 && mins % 60 === 0) {
			return `${mins / 60}h`;
		}
		return `${mins}m`;
	}
	return res.toLowerCase();
}

export function intervalToMs(interval) {
	const m = /^(\d+)([mhdwM])$/.exec(interval);
	if (!m) return 60000;
	const n = parseInt(m[1], 10);
	const unit = m[2];
	switch (unit) {
		case 'm': return n * 60_000;
		case 'h': return n * 3_600_000;
		case 'd': return n * 86_400_000;
		case 'w': return n * 7 * 86_400_000;
		case 'M': return n * 30 * 86_400_000;
		default: return 60_000;
	}
}

export function clampFuturesStatPeriod(interval) {
	if (OI_PERIODS.includes(interval)) return interval;
	if (interval === '1m' || interval === '3m') return '5m';
	if (interval === '8h') return '6h';
	return '1d';
}

function tickSizeToPriceScale(tickSize) {
	if (!tickSize) return 100;
	const str = String(tickSize);
	if (!str.includes('.')) return 1;
	const trimmed = str.replace(/0+$/, '');
	const dec = trimmed.split('.')[1];
	return dec ? Math.pow(10, dec.length) : 1;
}

export async function getExchangeInfo(force = false) {
	const now = Date.now();
	if (!force && exchangeCache.symbols.length && now < exchangeCache.expiresAt) {
		return exchangeCache;
	}
	if (exchangeInflight) return exchangeInflight;

	exchangeInflight = (async () => {
		try {
			const data = await makeApiRequest('fapi/v1/exchangeInfo');
			const list = [];
			const bySymbol = new Map();

			for (const item of data.symbols || []) {
				if (item.status !== 'TRADING') continue;
				if (item.contractType !== 'PERPETUAL') continue;
				const priceFilter = (item.filters || []).find((f) => f.filterType === 'PRICE_FILTER');
				const tickSize = priceFilter ? priceFilter.tickSize : null;
				const pricescale = tickSize ? tickSizeToPriceScale(tickSize) : Math.pow(10, item.pricePrecision || 2);
				const entry = {
					symbol: item.symbol,
					displaySymbol: `${item.symbol}.P`,
					baseAsset: item.baseAsset,
					quoteAsset: item.quoteAsset,
					contractType: item.contractType,
					pricePrecision: item.pricePrecision ?? 2,
					quantityPrecision: item.quantityPrecision ?? 3,
					pricescale,
					tickSize: tickSize ? parseFloat(tickSize) : 1 / pricescale,
				};
				list.push(entry);
				bySymbol.set(item.symbol, entry);
			}

			exchangeCache = {
				expiresAt: Date.now() + 10 * 60_000,
				symbols: list,
				bySymbol,
			};
			return exchangeCache;
		} finally {
			exchangeInflight = null;
		}
	})();

	return exchangeInflight;
}

export async function getSymbolMeta(rawSymbol) {
	const sym = normalizeSymbol(rawSymbol);
	const cache = await getExchangeInfo();
	return cache.bySymbol.get(sym) || null;
}

export function formatPriceForSymbol(price, sym) {
	if (price === null || price === undefined || Number.isNaN(Number(price))) return '--';
	const num = Number(price);
	const meta = exchangeCache.bySymbol.get(normalizeSymbol(sym));
	let decimals = 2;
	if (meta) {
		decimals = Math.min(8, Math.round(Math.log10(meta.pricescale)));
	} else if (num < 0.01) {
		decimals = 6;
	} else if (num < 1) {
		decimals = 4;
	} else if (num < 50) {
		decimals = 3;
	}
	return num.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

export async function getKlines(symbol, interval, { startTime, endTime, limit = 500 } = {}) {
	const params = new URLSearchParams({
		symbol: normalizeSymbol(symbol),
		interval,
		limit: String(limit),
	});
	if (startTime) params.set('startTime', String(Math.floor(startTime)));
	if (endTime) params.set('endTime', String(Math.floor(endTime)));
	return makeApiRequest(`fapi/v1/klines?${params.toString()}`);
}

export async function get24hrTickers() {
	return makeApiRequest('fapi/v1/ticker/24hr');
}

export async function getPremiumIndex(symbol) {
	const q = symbol ? `?symbol=${encodeURIComponent(normalizeSymbol(symbol))}` : '';
	return makeApiRequest(`fapi/v1/premiumIndex${q}`);
}

export async function getOpenInterest(symbol) {
	return makeApiRequest(`fapi/v1/openInterest?symbol=${encodeURIComponent(normalizeSymbol(symbol))}`);
}

export async function getOpenInterestHist(symbol, period, { startTime, endTime, limit = 500 } = {}) {
	const params = new URLSearchParams({
		symbol: normalizeSymbol(symbol),
		period: clampFuturesStatPeriod(period),
		limit: String(limit),
	});
	if (startTime) params.set('startTime', String(Math.floor(startTime)));
	if (endTime) params.set('endTime', String(Math.floor(endTime)));
	return makeApiRequest(`futures/data/openInterestHist?${params.toString()}`);
}

export async function getLongShortRatioHist(symbol, period, { startTime, endTime, limit = 500 } = {}) {
	const params = new URLSearchParams({
		symbol: normalizeSymbol(symbol),
		period: clampFuturesStatPeriod(period),
		limit: String(limit),
	});
	if (startTime) params.set('startTime', String(Math.floor(startTime)));
	if (endTime) params.set('endTime', String(Math.floor(endTime)));
	return makeApiRequest(`futures/data/globalLongShortAccountRatio?${params.toString()}`);
}

export async function getFundingRateHist(symbol, { startTime, endTime, limit = 500 } = {}) {
	const params = new URLSearchParams({
		symbol: normalizeSymbol(symbol),
		limit: String(limit),
	});
	if (startTime) params.set('startTime', String(Math.floor(startTime)));
	if (endTime) params.set('endTime', String(Math.floor(endTime)));
	return makeApiRequest(`fapi/v1/fundingRate?${params.toString()}`);
}

export async function getServerTime() {
	const res = await makeApiRequest('fapi/v1/time');
	return Math.floor(res.serverTime / 1000);
}
