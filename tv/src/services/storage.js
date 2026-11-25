const NS = 'tv_betabot_v2_';

const DEFAULT_WATCHLIST_SECTIONS = [
	{
		id: 'favorites',
		name: 'FAVORITOS',
		collapsed: false,
		items: [
			{ symbol: 'BTCUSDT', flag: 'orange' },
			{ symbol: 'ETHUSDT', flag: 'blue' },
			{ symbol: 'SOLUSDT', flag: 'green' },
		],
	},
	{
		id: 'majors',
		name: 'MAJOR PERPS',
		collapsed: false,
		items: [
			{ symbol: 'BNBUSDT', flag: '' },
			{ symbol: 'XRPUSDT', flag: '' },
			{ symbol: 'ADAUSDT', flag: '' },
			{ symbol: 'LINKUSDT', flag: '' },
			{ symbol: 'AVAXUSDT', flag: '' },
			{ symbol: 'DOGEUSDT', flag: '' },
		],
	},
	{
		id: 'altcoins',
		name: 'ALTCOINS',
		collapsed: false,
		items: [
			{ symbol: 'SUIUSDT', flag: '' },
			{ symbol: 'NEARUSDT', flag: '' },
			{ symbol: 'ARBUSDT', flag: '' },
			{ symbol: 'OPUSDT', flag: '' },
			{ symbol: 'AAVEUSDT', flag: '' },
			{ symbol: 'INJUSDT', flag: '' },
		],
	},
	{
		id: 'meme_ai',
		name: 'MEME & AI',
		collapsed: false,
		items: [
			{ symbol: '1000PEPEUSDT', flag: '' },
			{ symbol: 'WIFUSDT', flag: '' },
			{ symbol: 'RENDERUSDT', flag: '' },
		],
	},
];

const DEFAULT_PANES = [
	{ symbol: 'BTCUSDT', interval: '5', savedState: null },
	{ symbol: 'ETHUSDT', interval: '15', savedState: null },
	{ symbol: 'SOLUSDT', interval: '60', savedState: null },
	{ symbol: 'BNBUSDT', interval: '240', savedState: null },
];

const DEFAULT_PAPER = {
	balance: 10000,
	realizedPnl: 0,
	positions: [],
	orders: [],
	history: [],
};

function readJSON(key, fallback) {
	try {
		const raw = localStorage.getItem(NS + key);
		if (raw === null) return structuredClone(fallback);
		const parsed = JSON.parse(raw);
		return parsed ?? structuredClone(fallback);
	} catch {
		return structuredClone(fallback);
	}
}

function writeJSON(key, value) {
	try {
		localStorage.setItem(NS + key, JSON.stringify(value));
	} catch (err) {
		console.warn('[storage] write failed:', key, err);
	}
}

export const storage = {
	getTheme() {
		return readJSON('theme', 'dark') === 'light' ? 'light' : 'dark';
	},
	setTheme(theme) {
		writeJSON('theme', theme === 'light' ? 'light' : 'dark');
	},

	getLocale() {
		return readJSON('locale', 'pt') === 'en' ? 'en' : 'pt';
	},
	setLocale(locale) {
		writeJSON('locale', locale === 'en' ? 'en' : 'pt');
	},

	getShowTickerTape() {
		return Boolean(readJSON('showTickerTape', true));
	},
	setShowTickerTape(val) {
		writeJSON('showTickerTape', Boolean(val));
	},

	getLayoutType() {
		const v = readJSON('layoutType', '1');
		return ['1', '2h', '2v', '4'].includes(v) ? v : '1';
	},
	setLayoutType(type) {
		writeJSON('layoutType', type);
	},

	getSync() {
		return readJSON('sync', { symbol: false, interval: false });
	},
	setSync(sync) {
		writeJSON('sync', sync);
	},

	getPanes() {
		const panes = readJSON('panes', DEFAULT_PANES);
		if (!Array.isArray(panes) || panes.length < 4) {
			return DEFAULT_PANES.map((p, i) => panes[i] || structuredClone(p));
		}
		return panes.slice(0, 4);
	},
	setPanes(panes) {
		writeJSON('panes', panes);
	},

	getSavedLayouts() {
		return readJSON('savedLayouts', []);
	},
	setSavedLayouts(list) {
		writeJSON('savedLayouts', list);
	},

	getWatchlist() {
		const sections = readJSON('watchlist', DEFAULT_WATCHLIST_SECTIONS);
		return Array.isArray(sections) && sections.length ? sections : structuredClone(DEFAULT_WATCHLIST_SECTIONS);
	},
	setWatchlist(sections) {
		writeJSON('watchlist', sections);
	},

	getAlerts() {
		return readJSON('alerts', []);
	},
	setAlerts(alerts) {
		writeJSON('alerts', alerts);
	},

	getAlertLog() {
		return readJSON('alertLog', []);
	},
	setAlertLog(log) {
		writeJSON('alertLog', log.slice(0, 100));
	},

	getPaperTrading() {
		return readJSON('paperTrading', DEFAULT_PAPER);
	},
	setPaperTrading(data) {
		writeJSON('paperTrading', data);
	},
	resetPaperTrading() {
		const fresh = structuredClone(DEFAULT_PAPER);
		writeJSON('paperTrading', fresh);
		return fresh;
	},

	getRightPanel() {
		return readJSON('rightPanel', { open: true, tab: 'watchlist', width: 300, splitRatio: 0.45 });
	},
	setRightPanel(state) {
		writeJSON('rightPanel', state);
	},

	getBottomPanel() {
		return readJSON('bottomPanel', { open: false, tab: 'trading', height: 240 });
	},
	setBottomPanel(state) {
		writeJSON('bottomPanel', state);
	},
};
