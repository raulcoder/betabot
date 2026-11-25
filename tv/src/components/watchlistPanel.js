import {
	formatDisplaySymbol,
	formatPriceForSymbol,
	getExchangeInfo,
	getKlines,
	getOpenInterest,
	normalizeSymbol,
} from '../services/binanceApi.js';
import { marketHub } from '../services/marketHub.js';
import { storage } from '../services/storage.js';
import {
	escapeHtml,
	formatCompactQty,
	formatCompactUsd,
	formatSplitPriceHtml,
	getCoinAvatarHtml,
	showToast,
} from './toast.js';

const FLAG_CYCLE = ['', 'red', 'blue', 'green', 'orange'];

function calcSMA(arr, len) {
	if (arr.length < len) return null;
	let sum = 0;
	for (let i = arr.length - len; i < arr.length; i++) sum += arr[i];
	return sum / len;
}

function calcEMA(arr, len) {
	if (arr.length < len) return null;
	const k = 2 / (len + 1);
	let ema = calcSMA(arr.slice(0, len), len);
	for (let i = len; i < arr.length; i++) {
		ema = arr[i] * k + ema * (1 - k);
	}
	return ema;
}

function calcRSI(closes, len = 14) {
	if (closes.length <= len) return null;
	let gains = 0;
	let losses = 0;
	for (let i = 1; i <= len; i++) {
		const diff = closes[i] - closes[i - 1];
		if (diff >= 0) gains += diff;
		else losses -= diff;
	}
	let avgGain = gains / len;
	let avgLoss = losses / len;
	for (let i = len + 1; i < closes.length; i++) {
		const diff = closes[i] - closes[i - 1];
		avgGain = (avgGain * (len - 1) + Math.max(diff, 0)) / len;
		avgLoss = (avgLoss * (len - 1) + Math.max(-diff, 0)) / len;
	}
	if (avgLoss === 0) return 100;
	const rs = avgGain / avgLoss;
	return 100 - 100 / (1 + rs);
}

function calcStochK(klines, len = 14) {
	if (klines.length < len) return null;
	const slice = klines.slice(-len);
	let hh = -Infinity;
	let ll = Infinity;
	for (const k of slice) {
		const h = parseFloat(k[2]);
		const l = parseFloat(k[3]);
		if (h > hh) hh = h;
		if (l < ll) ll = l;
	}
	const lastC = parseFloat(slice[slice.length - 1][4]);
	if (hh === ll) return 50;
	return ((lastC - ll) / (hh - ll)) * 100;
}

function computeTechnicals(klines) {
	if (!klines || klines.length < 35) {
		return { buy: 0, neutral: 0, sell: 0, osc: { buy: 0, sell: 0, neutral: 0 }, ma: { buy: 0, sell: 0, neutral: 0 }, score: 0, verdict: 'Neutral' };
	}
	const closes = klines.map((k) => parseFloat(k[4]));
	const last = closes[closes.length - 1];
	const osc = { buy: 0, neutral: 0, sell: 0 };
	const ma = { buy: 0, neutral: 0, sell: 0 };

	const voteMa = (sig) => {
		if (sig > 0) ma.buy++;
		else if (sig < 0) ma.sell++;
		else ma.neutral++;
	};
	const voteOsc = (sig) => {
		if (sig > 0) osc.buy++;
		else if (sig < 0) osc.sell++;
		else osc.neutral++;
	};

	for (const len of [10, 20, 30, 50, 100, 200]) {
		const sma = calcSMA(closes, len);
		if (sma !== null) voteMa(last > sma ? 1 : last < sma ? -1 : 0);
		const ema = calcEMA(closes, len);
		if (ema !== null) voteMa(last > ema ? 1 : last < ema ? -1 : 0);
	}

	const rsi = calcRSI(closes, 14);
	if (rsi !== null) {
		if (rsi < 30) voteOsc(1);
		else if (rsi > 70) voteOsc(-1);
		else if (rsi > 55) voteOsc(1);
		else if (rsi < 45) voteOsc(-1);
		else voteOsc(0);
	}

	const stoch = calcStochK(klines, 14);
	if (stoch !== null) {
		if (stoch < 20) voteOsc(1);
		else if (stoch > 80) voteOsc(-1);
		else voteOsc(0);
	}

	const ema12 = calcEMA(closes, 12);
	const ema26 = calcEMA(closes, 26);
	if (ema12 !== null && ema26 !== null) {
		const macdVal = ema12 - ema26;
		voteOsc(macdVal > 0 ? 1 : macdVal < 0 ? -1 : 0);
	}

	const mom = last - closes[closes.length - 11];
	voteOsc(mom > 0 ? 1 : mom < 0 ? -1 : 0);

	const buy = osc.buy + ma.buy;
	const sell = osc.sell + ma.sell;
	const neutral = osc.neutral + ma.neutral;
	const total = buy + sell + neutral || 1;
	const score = (buy - sell) / total;

	let verdict = 'Neutral';
	if (score >= 0.45) verdict = 'Strong Buy';
	else if (score >= 0.15) verdict = 'Buy';
	else if (score <= -0.45) verdict = 'Strong Sell';
	else if (score <= -0.15) verdict = 'Sell';

	return { buy, neutral, sell, osc, ma, score, verdict };
}

export function createWatchlistPanel({
	rootEl,
	getActiveSymbol,
	onSelectSymbol,
	onCreateAlert,
	openModal,
	closeModal,
}) {
	let watchlists = storage.getWatchlists();
	let activeWlId = storage.getActiveWatchlistId();
	if (!watchlists.some((w) => w.id === activeWlId)) {
		activeWlId = watchlists[0].id;
		storage.setActiveWatchlistId(activeWlId);
	}

	let sortField = null; // null | 'symbol' | 'last' | 'chg' | 'chgPct'
	let sortAsc = true;
	let flagFilter = 'all';
	let techTf = '15m';
	let splitRatio = storage.getRightPanel().splitRatio || 0.46;
	const prevPrices = new Map();
	const rowEls = new Map(); // symbol -> { row, lastEl, chgEl, pctEl }
	const dailyCache = new Map(); // symbol -> klines
	let detailCache = { symbol: null, oi: null, perf: null, avgVol30d: null, tech: null, techTf: null };

	function getSections() {
		const wl = watchlists.find((w) => w.id === activeWlId) || watchlists[0];
		return wl.sections;
	}

	function saveWatchlists() {
		storage.setWatchlists(watchlists);
	}

	rootEl.innerHTML = `
		<div class="tv-panel-header">
			<div class="tv-dropdown">
				<button id="wl-switcher-btn" class="tv-tb-btn" style="padding:0 6px;font-weight:700;font-size:13px;" title="Switch or Manage Watchlists">
					<span id="wl-active-name">Watchlist</span>
					<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" style="opacity:0.75;"><path d="M2.5 4.5L6 8l3.5-3.5z"/></svg>
				</button>
				<div id="wl-switcher-menu" class="tv-menu" style="min-width:210px;">
					<div class="tv-menu-title">Watchlists</div>
					<div id="wl-lists-items"></div>
					<div class="tv-menu-divider"></div>
					<button id="wl-new-list-btn" class="tv-menu-item"><strong>+ Create new list...</strong></button>
					<button id="wl-new-sec-btn" class="tv-menu-item"><span>+ Add section...</span></button>
				</div>
			</div>
			<div class="tv-panel-actions">
				<select id="wl-flag-filter" class="tv-select" style="padding:2px 6px;font-size:11px;width:auto;" title="Filter by flag">
					<option value="all">All</option>
					<option value="red">Red</option>
					<option value="blue">Blue</option>
					<option value="green">Green</option>
					<option value="orange">Orange</option>
				</select>
				<button id="wl-add-btn" class="tv-tb-btn is-icon" title="Add Symbol to Watchlist">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
				</button>
			</div>
		</div>
		<div id="wl-top-pane" class="tv-watchlist-pane" style="height:${Math.round(splitRatio * 100)}%">
			<div class="tv-wl-toolbar">
				<button class="tv-wl-sort" data-sort="symbol">Symbol</button>
				<button class="tv-wl-sort is-right" data-sort="last">Last</button>
				<button class="tv-wl-sort is-right" data-sort="chg">Chg</button>
				<button class="tv-wl-sort is-right" data-sort="chgPct">Chg%</button>
			</div>
			<div id="wl-list" class="tv-wl-list"></div>
		</div>
		<div id="wl-split-handle" class="tv-split-handle" title="Drag to resize Watchlist / Details"></div>
		<div id="wl-details-pane" class="tv-details-pane"></div>
	`;

	const topPaneEl = rootEl.querySelector('#wl-top-pane');
	const listEl = rootEl.querySelector('#wl-list');
	const splitHandleEl = rootEl.querySelector('#wl-split-handle');
	const detailsEl = rootEl.querySelector('#wl-details-pane');
	const flagSelectEl = rootEl.querySelector('#wl-flag-filter');
	const addBtnEl = rootEl.querySelector('#wl-add-btn');
	const switcherBtn = rootEl.querySelector('#wl-switcher-btn');
	const switcherMenu = rootEl.querySelector('#wl-switcher-menu');
	const activeNameEl = rootEl.querySelector('#wl-active-name');

	function renderWatchlistSwitcher() {
		const activeWl = watchlists.find((w) => w.id === activeWlId) || watchlists[0];
		activeNameEl.textContent = activeWl.name;
		const itemsBox = rootEl.querySelector('#wl-lists-items');
		itemsBox.innerHTML = watchlists.map((w) => `
			<button class="tv-menu-item ${w.id === activeWlId ? 'is-selected' : ''}" data-pick-wl="${w.id}">
				<span>${escapeHtml(w.name)}</span>
				<span style="font-size:10px;color:var(--text-secondary);">${w.sections.reduce((acc, s) => acc + s.items.length, 0)}</span>
			</button>
		`).join('');
		itemsBox.querySelectorAll('[data-pick-wl]').forEach((b) => {
			b.addEventListener('click', () => {
				activeWlId = b.dataset.pickWl;
				storage.setActiveWatchlistId(activeWlId);
				switcherMenu.classList.remove('is-open');
				renderWatchlistSwitcher();
				renderListStructure();
			});
		});
	}

	switcherBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const wasOpen = switcherMenu.classList.contains('is-open');
		document.querySelectorAll('.tv-menu.is-open').forEach((m) => m.classList.remove('is-open'));
		if (!wasOpen) {
			renderWatchlistSwitcher();
			switcherMenu.classList.add('is-open');
		}
	});
	switcherMenu.addEventListener('click', (e) => e.stopPropagation());

	rootEl.querySelector('#wl-new-list-btn').addEventListener('click', () => {
		switcherMenu.classList.remove('is-open');
		const form = document.createElement('form');
		form.innerHTML = `
			<input name="name" class="tv-input" placeholder="e.g. DeFi Perps" required autofocus style="margin-bottom:10px;" />
			<div style="display:flex;justify-content:flex-end;gap:8px;">
				<button type="button" id="wl-nl-cancel" class="tv-btn-secondary">Cancel</button>
				<button type="submit" class="tv-btn-primary">Create List</button>
			</div>
		`;
		openModal('Create New Watchlist', form);
		form.querySelector('#wl-nl-cancel').addEventListener('click', closeModal);
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			const name = String(new FormData(form).get('name') || '').trim();
			if (!name) return;
			const id = `wl_${Date.now()}`;
			watchlists.push({
				id,
				name,
				sections: [{ id: 'main', name: 'SYMBOLS', collapsed: false, items: [{ symbol: getActiveSymbol(), flag: '' }] }],
			});
			activeWlId = id;
			storage.setActiveWatchlistId(id);
			saveWatchlists();
			closeModal();
			renderWatchlistSwitcher();
			renderListStructure();
		});
	});

	rootEl.querySelector('#wl-new-sec-btn').addEventListener('click', () => {
		switcherMenu.classList.remove('is-open');
		const form = document.createElement('form');
		form.innerHTML = `
			<input name="name" class="tv-input" placeholder="e.g. L1 ECOSYSTEM" required autofocus style="margin-bottom:10px;" />
			<div style="display:flex;justify-content:flex-end;gap:8px;">
				<button type="button" id="wl-ns-cancel" class="tv-btn-secondary">Cancel</button>
				<button type="submit" class="tv-btn-primary">Add Section</button>
			</div>
		`;
		openModal('Add Watchlist Section', form);
		form.querySelector('#wl-ns-cancel').addEventListener('click', closeModal);
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			const name = String(new FormData(form).get('name') || '').trim().toUpperCase();
			if (!name) return;
			getSections().push({ id: `sec_${Date.now()}`, name, collapsed: false, items: [] });
			saveWatchlists();
			closeModal();
			renderListStructure();
		});
	});

	// Horizontal split drag
	splitHandleEl.addEventListener('pointerdown', (ev) => {
		ev.preventDefault();
		splitHandleEl.classList.add('is-dragging');
		const startY = ev.clientY;
		const totalHeight = rootEl.clientHeight - 38;
		const startHeight = topPaneEl.clientHeight;

		const onMove = (e) => {
			const nextH = Math.max(140, Math.min(totalHeight - 160, startHeight + (e.clientY - startY)));
			splitRatio = nextH / Math.max(1, totalHeight);
			topPaneEl.style.height = `${Math.round(splitRatio * 100)}%`;
		};
		const onUp = () => {
			splitHandleEl.classList.remove('is-dragging');
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			const rp = storage.getRightPanel();
			rp.splitRatio = splitRatio;
			storage.setRightPanel(rp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	});

	flagSelectEl.addEventListener('change', () => {
		flagFilter = flagSelectEl.value;
		renderListStructure();
	});

	rootEl.querySelectorAll('.tv-wl-sort').forEach((btn) => {
		btn.addEventListener('click', () => {
			const field = btn.dataset.sort;
			if (sortField === field) {
				if (sortAsc) sortAsc = false;
				else sortField = null;
			} else {
				sortField = field;
				sortAsc = field === 'symbol';
			}
			rootEl.querySelectorAll('.tv-wl-sort').forEach((b) => {
				b.classList.toggle('is-sorted', b.dataset.sort === sortField);
			});
			renderListStructure();
		});
	});

	addBtnEl.addEventListener('click', () => openAddSymbolModal());

	async function openAddSymbolModal() {
		const cache = await getExchangeInfo();
		const sections = getSections();
		const body = document.createElement('div');
		body.innerHTML = `
			<input id="wl-modal-search" class="tv-input" placeholder="Search Binance Futures (e.g. BTC, ETH, PEPE)..." autofocus style="width:100%;" />
			<div style="display:flex;gap:8px;align-items:center;">
				<label style="font-size:11px;color:var(--text-secondary);">Section:</label>
				<select id="wl-modal-sec" class="tv-select" style="flex:1;">
					${sections.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
				</select>
			</div>
			<div id="wl-modal-results" class="tv-cp-list"></div>
		`;
		openModal('Add Symbol to Watchlist', body);

		const inputEl = body.querySelector('#wl-modal-search');
		const secEl = body.querySelector('#wl-modal-sec');
		const resEl = body.querySelector('#wl-modal-results');

		const draw = () => {
			const q = inputEl.value.trim().toUpperCase().replace(/\//g, '').replace(/\.P$/, '');
			const matches = cache.symbols
				.filter((s) => !q || s.symbol.includes(q) || s.baseAsset.includes(q))
				.slice(0, 40);
			resEl.innerHTML = matches.map((m) => `
				<div class="tv-cp-item" data-sym="${m.symbol}">
					<div style="display:flex;align-items:center;gap:8px;">
						${getCoinAvatarHtml(m.symbol, 20)}
						<div>
							<strong>${m.displaySymbol}</strong>
							<span style="font-size:11px;color:var(--text-secondary);margin-left:6px;">${m.baseAsset}/${m.quoteAsset} Perpetual</span>
						</div>
					</div>
					<span style="font-size:11px;color:var(--accent);font-weight:600;">+ Add</span>
				</div>
			`).join('');
			resEl.querySelectorAll('.tv-cp-item').forEach((row) => {
				row.addEventListener('click', () => {
					addSymbol(row.dataset.sym, secEl.value);
					closeModal();
				});
			});
		};

		inputEl.addEventListener('input', draw);
		draw();
		setTimeout(() => inputEl.focus(), 30);
	}

	function addSymbol(sym, sectionId) {
		const clean = normalizeSymbol(sym);
		const sections = getSections();
		for (const sec of sections) {
			if (sec.items.some((i) => i.symbol === clean)) {
				showToast({ title: 'Already in Watchlist', message: formatDisplaySymbol(clean) });
				return;
			}
		}
		const target = sections.find((s) => s.id === sectionId) || sections[0];
		target.items.unshift({ symbol: clean, flag: '' });
		saveWatchlists();
		renderListStructure();
	}

	function removeSymbol(sym) {
		const sections = getSections();
		for (const sec of sections) {
			sec.items = sec.items.filter((i) => i.symbol !== sym);
		}
		saveWatchlists();
		renderListStructure();
	}

	function cycleFlag(sym) {
		const sections = getSections();
		for (const sec of sections) {
			const item = sec.items.find((i) => i.symbol === sym);
			if (item) {
				const idx = FLAG_CYCLE.indexOf(item.flag || '');
				item.flag = FLAG_CYCLE[(idx + 1) % FLAG_CYCLE.length];
				break;
			}
		}
		saveWatchlists();
		renderListStructure();
	}

	function getVisibleItems(sec) {
		let items = sec.items.filter((i) => flagFilter === 'all' || i.flag === flagFilter);
		if (sortField) {
			items = [...items].sort((a, b) => {
				if (sortField === 'symbol') {
					return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
				}
				const ta = marketHub.getTicker(a.symbol);
				const tb = marketHub.getTicker(b.symbol);
				const va = ta ? ta[sortField] : -Infinity;
				const vb = tb ? tb[sortField] : -Infinity;
				return sortAsc ? va - vb : vb - va;
			});
		}
		return items;
	}

	function renderListStructure() {
		const activeSym = getActiveSymbol();
		const sections = getSections();
		rowEls.clear();
		let html = '';

		for (const sec of sections) {
			const items = getVisibleItems(sec);
			html += `
				<div class="tv-wl-section-hdr" data-sec="${sec.id}">
					<span>${sec.collapsed ? '&#9656;' : '&#9662;'} ${escapeHtml(sec.name)} (${items.length})</span>
				</div>
			`;
			if (!sec.collapsed) {
				for (const item of items) {
					const t = marketHub.getTicker(item.symbol);
					const dir = t ? t.dir : 0;
					const lastHtml = t ? formatSplitPriceHtml(t.last, item.symbol, dir) : '--';
					const chgStr = t ? `${t.chg >= 0 ? '+' : ''}${formatPriceForSymbol(t.chg, item.symbol)}` : '--';
					const pctStr = t ? `${t.chgPct >= 0 ? '+' : ''}${t.chgPct.toFixed(2)}%` : '--';
					const cls = t ? (t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral') : 'is-neutral';

					html += `
						<div class="tv-wl-row ${item.symbol === activeSym ? 'is-active' : ''}" data-sym="${item.symbol}">
							<div class="tv-wl-sym-cell">
								<span class="tv-flag-dot" data-flag="${item.flag || ''}" data-flag-sym="${item.symbol}" title="Click to flag"></span>
								${getCoinAvatarHtml(item.symbol, 17)}
								<span class="tv-wl-sym-name">${escapeHtml(item.symbol.replace('USDT', ''))}</span>
							</div>
							<span class="tv-wl-num" data-col="last">${lastHtml}</span>
							<span class="tv-wl-num ${cls}" data-col="chg">${chgStr}</span>
							<span class="tv-wl-num ${cls}" data-col="pct">${pctStr}</span>
							<button class="tv-wl-remove" data-rm="${item.symbol}" title="Remove">&times;</button>
						</div>
					`;
				}
			}
		}

		listEl.innerHTML = html;

		listEl.querySelectorAll('.tv-wl-row').forEach((row) => {
			const sym = row.dataset.sym;
			rowEls.set(sym, {
				row,
				lastEl: row.querySelector('[data-col="last"]'),
				chgEl: row.querySelector('[data-col="chg"]'),
				pctEl: row.querySelector('[data-col="pct"]'),
			});
			row.addEventListener('click', () => onSelectSymbol(sym));
		});

		listEl.querySelectorAll('.tv-wl-section-hdr').forEach((hdr) => {
			hdr.addEventListener('click', () => {
				const sec = getSections().find((s) => s.id === hdr.dataset.sec);
				if (sec) {
					sec.collapsed = !sec.collapsed;
					saveWatchlists();
					renderListStructure();
				}
			});
		});

		listEl.querySelectorAll('.tv-flag-dot').forEach((dot) => {
			dot.addEventListener('click', (e) => {
				e.stopPropagation();
				cycleFlag(dot.dataset.flagSym);
			});
		});

		listEl.querySelectorAll('.tv-wl-remove').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				removeSymbol(btn.dataset.rm);
			});
		});
	}

	function patchListValues() {
		if (sortField) {
			renderListStructure();
			return;
		}
		const activeSym = getActiveSymbol();
		for (const [sym, refs] of rowEls.entries()) {
			refs.row.classList.toggle('is-active', sym === activeSym);
			const t = marketHub.getTicker(sym);
			if (!t) continue;
			const old = prevPrices.get(sym);
			let dir = 0;
			if (old !== undefined && old !== t.last) {
				dir = t.last > old ? 1 : -1;
				refs.row.classList.remove('flash-up', 'flash-down');
				void refs.row.offsetWidth;
				refs.row.classList.add(dir > 0 ? 'flash-up' : 'flash-down');
			}
			prevPrices.set(sym, t.last);

			const cls = t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral';
			refs.lastEl.innerHTML = formatSplitPriceHtml(t.last, sym, dir);
			refs.chgEl.textContent = `${t.chg >= 0 ? '+' : ''}${formatPriceForSymbol(t.chg, sym)}`;
			refs.chgEl.className = `tv-wl-num ${cls}`;
			refs.pctEl.textContent = `${t.chgPct >= 0 ? '+' : ''}${t.chgPct.toFixed(2)}%`;
			refs.pctEl.className = `tv-wl-num ${cls}`;
		}
	}

	function computeDailyAnalytics(klines) {
		if (!Array.isArray(klines) || klines.length < 2) return null;
		const lastC = parseFloat(klines[klines.length - 1][4]);
		const pctFrom = (daysBack) => {
			const idx = Math.max(0, klines.length - 1 - daysBack);
			const base = parseFloat(klines[idx][4]);
			return base > 0 ? ((lastC - base) / base) * 100 : 0;
		};

		const currYear = new Date().getUTCFullYear();
		const ytdBar = klines.find((k) => new Date(Number(k[0])).getUTCFullYear() === currYear) || klines[0];
		const ytdBase = parseFloat(ytdBar[1] || ytdBar[4]);
		const ytdPct = ytdBase > 0 ? ((lastC - ytdBase) / ytdBase) * 100 : 0;

		const recent30 = klines.slice(-30);
		const avgVol30d = recent30.reduce((sum, k) => sum + parseFloat(k[5] || 0), 0) / Math.max(1, recent30.length);

		return {
			perf: {
				'1W': pctFrom(7),
				'1M': pctFrom(30),
				'3M': pctFrom(90),
				'6M': pctFrom(180),
				YTD: ytdPct,
				'1Y': pctFrom(365),
			},
			avgVol30d,
		};
	}

	async function refreshSymbolInsights(sym, forceTech = false) {
		if (detailCache.symbol !== sym) {
			detailCache = { symbol: sym, oi: null, perf: null, avgVol30d: null, tech: null, techTf };
		}
		try {
			const cachedDaily = dailyCache.get(sym);
			const [oiRes, dailyKlines, techKlines] = await Promise.all([
				getOpenInterest(sym).catch(() => null),
				cachedDaily ? Promise.resolve(cachedDaily) : getKlines(sym, '1d', { limit: 370 }).catch(() => null),
				forceTech || !detailCache.tech || detailCache.techTf !== techTf
					? getKlines(sym, techTf, { limit: 220 }).catch(() => null)
					: Promise.resolve(null),
			]);

			if (oiRes && oiRes.openInterest) {
				detailCache.oi = parseFloat(oiRes.openInterest);
			}

			if (Array.isArray(dailyKlines) && dailyKlines.length >= 2) {
				dailyCache.set(sym, dailyKlines);
				const analytics = computeDailyAnalytics(dailyKlines);
				if (analytics) {
					detailCache.perf = analytics.perf;
					detailCache.avgVol30d = analytics.avgVol30d;
				}
			}

			if (Array.isArray(techKlines) && techKlines.length >= 35) {
				detailCache.tech = computeTechnicals(techKlines);
				detailCache.techTf = techTf;
			}

			renderDetailsFull();
		} catch (err) {
			console.warn('[watchlistPanel] insights error:', err);
		}
	}

	function formatCountdown(targetMs) {
		if (!targetMs) return '--:--:--';
		const diff = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
		const h = String(Math.floor(diff / 3600)).padStart(2, '0');
		const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
		const s = String(diff % 60).padStart(2, '0');
		return `${h}:${m}:${s}`;
	}

	function renderDetailsFull() {
		const sym = getActiveSymbol();
		const t = marketHub.getTicker(sym);
		const m = marketHub.getMark(sym);

		const priceHtml = t ? formatSplitPriceHtml(t.last, sym, t.dir) : '--';
		const chgStr = t ? `${t.chg >= 0 ? '+' : ''}${formatPriceForSymbol(t.chg, sym)}` : '--';
		const pctStr = t ? `${t.chgPct >= 0 ? '+' : ''}${t.chgPct.toFixed(2)}%` : '--';
		const cls = t ? (t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral') : 'is-neutral';

		const markStr = m ? formatPriceForSymbol(m.markPrice, sym) : '--';
		const idxStr = m ? formatPriceForSymbol(m.indexPrice, sym) : '--';
		const fundPct = m ? `${(m.fundingRate * 100).toFixed(4)}%` : '--';
		const fundCls = m ? (m.fundingRate >= 0 ? 'is-up' : 'is-down') : '';
		const countdown = m ? formatCountdown(m.nextFundingTime) : '--:--:--';

		const rangePos = t && t.high > t.low
			? Math.max(0, Math.min(100, ((t.last - t.low) / (t.high - t.low)) * 100))
			: 50;

		const volBase = t ? t.volume : 0;
		const avgVol30d = detailCache.avgVol30d || 0;
		const volRatio = avgVol30d > 0 ? Math.min(100, (volBase / avgVol30d) * 50) : 50;

		const oiUsd = detailCache.oi && t ? formatCompactUsd(detailCache.oi * t.last) : '--';
		const perf = detailCache.perf;
		const tech = detailCache.tech || {
			buy: 0, neutral: 0, sell: 0,
			osc: { buy: 0, sell: 0, neutral: 0 },
			ma: { buy: 0, sell: 0, neutral: 0 },
			score: 0, verdict: 'Loading...',
		};

		const angle = Math.max(-85, Math.min(85, tech.score * 85));
		const verdictCls = tech.score >= 0.15 ? 'is-up' : tech.score <= -0.15 ? 'is-down' : 'is-neutral';

		detailsEl.dataset.sym = sym;
		detailsEl.innerHTML = `
			<div class="tv-det-header">
				<div>
					<div class="tv-det-sym">
						${getCoinAvatarHtml(sym, 22)}
						<span>${formatDisplaySymbol(sym)}</span>
					</div>
					<div class="tv-det-sub">Binance Futures &middot; Swap &middot; Crypto</div>
				</div>
				<button id="det-alert-btn" class="tv-btn-secondary" style="padding:4px 8px;font-size:11px;">+ Alert</button>
			</div>

			<div>
				<div class="tv-det-price-row">
					<span id="det-price" class="tv-det-price">${priceHtml}</span>
					<span class="tv-det-unit">USDT</span>
				</div>
				<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
					<span id="det-chg" class="tv-det-chg ${cls}">${chgStr} (${pctStr})</span>
					<span class="tv-det-market-status"><span class="tv-brand-dot" style="width:6px;height:6px;"></span>Market open</span>
				</div>
			</div>

			<div class="tv-vol-compare">
				<div class="tv-vol-compare-labels">
					<span style="color:var(--text-secondary);">Volume <strong id="det-vol-base" style="color:var(--text-strong);">${t ? formatCompactQty(volBase) : '--'}</strong></span>
					<span style="color:var(--text-secondary);">Avg. vol (30D) <strong style="color:var(--text-strong);">${avgVol30d ? formatCompactQty(avgVol30d) : '--'}</strong></span>
				</div>
				<div class="tv-vol-compare-bar">
					<div id="det-vol-fill" class="tv-vol-compare-fill" style="width:${volRatio.toFixed(1)}%;"></div>
				</div>
			</div>

			<div class="tv-det-grid">
				<div class="tv-stat-box">
					<div class="tv-stat-label">Mark / Index</div>
					<div id="det-mark" class="tv-stat-val">${markStr} <span style="color:var(--text-secondary);font-weight:400;">/ ${idxStr}</span></div>
				</div>
				<div class="tv-stat-box">
					<div class="tv-stat-label">Funding &middot; <span id="det-fund-cd">${countdown}</span></div>
					<div id="det-funding" class="tv-stat-val ${fundCls}">${fundPct}</div>
				</div>
				<div class="tv-stat-box">
					<div class="tv-stat-label">24h Volume (USDT)</div>
					<div id="det-vol-usd" class="tv-stat-val">${t ? formatCompactUsd(t.quoteVolume) : '--'}</div>
				</div>
				<div class="tv-stat-box">
					<div class="tv-stat-label">Open Interest</div>
					<div id="det-oi" class="tv-stat-val">${oiUsd} <span style="color:var(--text-secondary);font-weight:400;">(${detailCache.oi ? formatCompactQty(detailCache.oi) : '--'})</span></div>
				</div>
			</div>

			<div class="tv-range-wrap">
				<div class="tv-range-labels">
					<span id="det-low">24h Low: ${t ? formatPriceForSymbol(t.low, sym) : '--'}</span>
					<span id="det-high">High: ${t ? formatPriceForSymbol(t.high, sym) : '--'}</span>
				</div>
				<div class="tv-range-bar">
					<div id="det-range-fill" class="tv-range-fill" style="width:${rangePos.toFixed(1)}%;"></div>
					<div id="det-range-dot" class="tv-range-dot" style="left:${rangePos.toFixed(1)}%;"></div>
				</div>
			</div>

			<div>
				<div style="font-size:11px;font-weight:700;color:var(--text-strong);margin-bottom:6px;">Performance</div>
				<div class="tv-perf-grid">
					${['1W', '1M', '3M', '6M', 'YTD', '1Y'].map((k) => {
						const v = perf ? perf[k] : null;
						const c = v === null ? 'is-neutral' : v >= 0 ? 'is-up' : 'is-down';
						const tileCls = v === null ? '' : v >= 0 ? 'is-up-tile' : 'is-down-tile';
						return `
							<div class="tv-perf-card ${tileCls}">
								<div class="tv-perf-val ${c}">${v === null ? '--' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}</div>
								<div class="tv-perf-tf">${k}</div>
							</div>
						`;
					}).join('')}
				</div>
			</div>

			<div class="tv-tech-card">
				<div class="tv-tech-hdr">
					<span style="font-size:12px;font-weight:700;color:var(--text-strong);">Technicals</span>
					<div class="tv-tech-tfs">
						${['15m', '1h', '4h', '1d'].map((tf) => `
							<button class="tv-chip-btn ${techTf === tf ? 'is-active' : ''}" data-tech-tf="${tf}">${tf}</button>
						`).join('')}
					</div>
				</div>
				<div class="tv-gauge-wrap">
					<svg class="tv-gauge-svg" viewBox="0 0 180 100">
						<path d="M 20 88 A 70 70 0 0 1 46 33" fill="none" stroke="#F23645" stroke-width="8" stroke-linecap="round"/>
						<path d="M 52 29 A 70 70 0 0 1 77 19" fill="none" stroke="#FF7A59" stroke-width="8"/>
						<path d="M 82 18 A 70 70 0 0 1 98 18" fill="none" stroke="#8C8C8C" stroke-width="8"/>
						<path d="M 103 19 A 70 70 0 0 1 128 29" fill="none" stroke="#2962FF" stroke-width="8"/>
						<path d="M 134 33 A 70 70 0 0 1 160 88" fill="none" stroke="#089981" stroke-width="8" stroke-linecap="round"/>
						<g transform="translate(90, 88) rotate(${angle})">
							<line x1="0" y1="0" x2="0" y2="-54" stroke="var(--text-strong)" stroke-width="2.5" stroke-linecap="round"/>
							<circle cx="0" cy="0" r="4.5" fill="var(--text-strong)"/>
						</g>
					</svg>
					<div class="tv-gauge-verdict ${verdictCls}">${tech.verdict}</div>
					<div class="tv-gauge-counts">
						<span class="is-down">Sell: <strong>${tech.sell}</strong></span>
						<span class="is-neutral">Neutral: <strong>${tech.neutral}</strong></span>
						<span class="is-up">Buy: <strong>${tech.buy}</strong></span>
					</div>
					<div class="tv-gauge-sub">
						<span>Osc: <strong class="is-up">${tech.osc.buy}B</strong>/<strong class="is-down">${tech.osc.sell}S</strong></span>
						<span>MA: <strong class="is-up">${tech.ma.buy}B</strong>/<strong class="is-down">${tech.ma.sell}S</strong></span>
					</div>
				</div>
			</div>
		`;

		detailsEl.querySelector('#det-alert-btn')?.addEventListener('click', () => {
			onCreateAlert(sym);
		});

		detailsEl.querySelectorAll('[data-tech-tf]').forEach((btn) => {
			btn.addEventListener('click', () => {
				techTf = btn.dataset.techTf;
				refreshSymbolInsights(sym, true);
			});
		});
	}

	function patchDetailsValues() {
		const sym = getActiveSymbol();
		if (detailsEl.dataset.sym !== sym) {
			renderDetailsFull();
			return;
		}
		const t = marketHub.getTicker(sym);
		const m = marketHub.getMark(sym);

		if (t) {
			const pxEl = detailsEl.querySelector('#det-price');
			const chgEl = detailsEl.querySelector('#det-chg');
			const volBaseEl = detailsEl.querySelector('#det-vol-base');
			const volFillEl = detailsEl.querySelector('#det-vol-fill');
			const volUsdEl = detailsEl.querySelector('#det-vol-usd');
			const lowEl = detailsEl.querySelector('#det-low');
			const highEl = detailsEl.querySelector('#det-high');
			const rFill = detailsEl.querySelector('#det-range-fill');
			const rDot = detailsEl.querySelector('#det-range-dot');

			const cls = t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral';
			if (pxEl) pxEl.innerHTML = formatSplitPriceHtml(t.last, sym, t.dir);
			if (chgEl) {
				chgEl.textContent = `${t.chg >= 0 ? '+' : ''}${formatPriceForSymbol(t.chg, sym)} (${t.chgPct >= 0 ? '+' : ''}${t.chgPct.toFixed(2)}%)`;
				chgEl.className = `tv-det-chg ${cls}`;
			}
			if (volBaseEl) volBaseEl.textContent = formatCompactQty(t.volume);
			if (volFillEl && detailCache.avgVol30d) {
				volFillEl.style.width = `${Math.min(100, (t.volume / detailCache.avgVol30d) * 50).toFixed(1)}%`;
			}
			if (volUsdEl) volUsdEl.textContent = formatCompactUsd(t.quoteVolume);
			if (lowEl) lowEl.textContent = `24h Low: ${formatPriceForSymbol(t.low, sym)}`;
			if (highEl) highEl.textContent = `High: ${formatPriceForSymbol(t.high, sym)}`;
			const rangePos = t.high > t.low ? Math.max(0, Math.min(100, ((t.last - t.low) / (t.high - t.low)) * 100)) : 50;
			if (rFill) rFill.style.width = `${rangePos.toFixed(1)}%`;
			if (rDot) rDot.style.left = `${rangePos.toFixed(1)}%`;
		}

		if (m) {
			const markEl = detailsEl.querySelector('#det-mark');
			const fundEl = detailsEl.querySelector('#det-funding');
			const cdEl = detailsEl.querySelector('#det-fund-cd');
			if (markEl) {
				markEl.innerHTML = `${formatPriceForSymbol(m.markPrice, sym)} <span style="color:var(--text-secondary);font-weight:400;">/ ${formatPriceForSymbol(m.indexPrice, sym)}</span>`;
			}
			if (fundEl) {
				fundEl.textContent = `${(m.fundingRate * 100).toFixed(4)}%`;
				fundEl.className = `tv-stat-val ${m.fundingRate >= 0 ? 'is-up' : 'is-down'}`;
			}
			if (cdEl) cdEl.textContent = formatCountdown(m.nextFundingTime);
		}
	}

	function stepSymbol(delta = 1) {
		const ordered = [];
		for (const sec of getSections()) {
			if (sec.collapsed) continue;
			for (const item of getVisibleItems(sec)) ordered.push(item.symbol);
		}
		if (!ordered.length) return;
		const idx = ordered.indexOf(getActiveSymbol());
		const nextIdx = idx === -1 ? 0 : (idx + delta + ordered.length) % ordered.length;
		onSelectSymbol(ordered[nextIdx]);
	}

	window.setInterval(() => {
		const cdEl = detailsEl.querySelector('#det-fund-cd');
		if (!cdEl) return;
		const m = marketHub.getMark(getActiveSymbol());
		if (m) cdEl.textContent = formatCountdown(m.nextFundingTime);
	}, 1000);

	marketHub.onUpdate(() => {
		patchListValues();
		patchDetailsValues();
	});

	renderWatchlistSwitcher();
	renderListStructure();
	renderDetailsFull();
	refreshSymbolInsights(getActiveSymbol());

	return {
		onActiveSymbolChanged(sym) {
			patchListValues();
			renderDetailsFull();
			refreshSymbolInsights(sym, true);
		},
		openAddSymbolModal,
		stepSymbol,
	};
}
