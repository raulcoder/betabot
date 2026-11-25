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

const DEFAULT_FAV_INTERVALS = ['1', '5', '15', '60', '240', '1D'];

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

function makeDefaultWatchlists() {
	const legacySections = readJSON('watchlist', DEFAULT_WATCHLIST_SECTIONS);
	const sections = Array.isArray(legacySections) && legacySections.length
		? legacySections
		: structuredClone(DEFAULT_WATCHLIST_SECTIONS);
	return [{ id: 'default', name: 'Watchlist', sections }];
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
		return Boolean(readJSON('showTickerTape', false));
	},
	setShowTickerTape(val) {
		writeJSON('showTickerTape', Boolean(val));
	},

	getShowBuySell() {
		return Boolean(readJSON('showBuySell', true));
	},
	setShowBuySell(val) {
		writeJSON('showBuySell', Boolean(val));
	},

	getFavoriteIntervals() {
		const list = readJSON('favoriteIntervals', DEFAULT_FAV_INTERVALS);
		return Array.isArray(list) && list.length ? list : [...DEFAULT_FAV_INTERVALS];
	},
	setFavoriteIntervals(list) {
		writeJSON('favoriteIntervals', Array.isArray(list) && list.length ? list : [...DEFAULT_FAV_INTERVALS]);
	},

	getLayoutType() {
		const v = readJSON('layoutType', '1');
		return ['1', '2h', '2v', '3', '4'].includes(v) ? v : '1';
	},
	setLayoutType(type) {
		writeJSON('layoutType', ['1', '2h', '2v', '3', '4'].includes(type) ? type : '1');
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

	getWatchlists() {
		const lists = readJSON('watchlists', null);
		if (Array.isArray(lists) && lists.length) return lists;
		const migrated = makeDefaultWatchlists();
		writeJSON('watchlists', migrated);
		return migrated;
	},
	setWatchlists(lists) {
		writeJSON('watchlists', lists);
		if (Array.isArray(lists) && lists[0]?.sections) {
			writeJSON('watchlist', lists[0].sections);
		}
	},

	getActiveWatchlistId() {
		return readJSON('activeWatchlistId', 'default');
	},
	setActiveWatchlistId(id) {
		writeJSON('activeWatchlistId', id || 'default');
	},

	getWatchlist() {
		const lists = this.getWatchlists();
		const activeId = this.getActiveWatchlistId();
		const active = lists.find((w) => w.id === activeId) || lists[0];
		return active.sections;
	},
	setWatchlist(sections) {
		const lists = this.getWatchlists();
		const activeId = this.getActiveWatchlistId();
		const active = lists.find((w) => w.id === activeId) || lists[0];
		active.sections = sections;
		this.setWatchlists(lists);
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
