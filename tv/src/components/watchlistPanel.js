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
import { escapeHtml, formatCompactQty, formatCompactUsd } from './toast.js';

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

function computeTechnicals(closes) {
	if (!closes || closes.length < 35) {
		return { buy: 0, neutral: 0, sell: 0, score: 0, verdict: 'Neutral' };
	}
	const last = closes[closes.length - 1];
	let buy = 0;
	let sell = 0;
	let neutral = 0;

	const vote = (sig) => {
		if (sig > 0) buy++;
		else if (sig < 0) sell++;
		else neutral++;
	};

	// Moving Averages
	for (const len of [10, 20, 50]) {
		const sma = calcSMA(closes, len);
		if (sma !== null) vote(last > sma ? 1 : last < sma ? -1 : 0);
		const ema = calcEMA(closes, len);
		if (ema !== null) vote(last > ema ? 1 : last < ema ? -1 : 0);
	}

	// RSI 14
	const rsi = calcRSI(closes, 14);
	if (rsi !== null) {
		if (rsi < 30) vote(1);
		else if (rsi > 70) vote(-1);
		else if (rsi > 55) vote(1);
		else if (rsi < 45) vote(-1);
		else vote(0);
	}

	// MACD (12, 26, 9)
	const ema12 = calcEMA(closes, 12);
	const ema26 = calcEMA(closes, 26);
	if (ema12 !== null && ema26 !== null) {
		const macdVal = ema12 - ema26;
		vote(macdVal > 0 ? 1 : macdVal < 0 ? -1 : 0);
	}

	// Momentum 10
	const mom = last - closes[closes.length - 11];
	vote(mom > 0 ? 1 : mom < 0 ? -1 : 0);

	const total = buy + sell + neutral || 1;
	const score = (buy - sell) / total; // -1 to +1

	let verdict = 'Neutral';
	if (score >= 0.45) verdict = 'Strong Buy';
	else if (score >= 0.15) verdict = 'Buy';
	else if (score <= -0.45) verdict = 'Strong Sell';
	else if (score <= -0.15) verdict = 'Sell';

	return { buy, neutral, sell, score, verdict };
}

export function createWatchlistPanel({
	rootEl,
	getActiveSymbol,
	onSelectSymbol,
	onCreateAlert,
	openModal,
	closeModal,
}) {
	let sections = storage.getWatchlist();
	let sortField = null; // null | 'symbol' | 'last' | 'chg' | 'chgPct'
	let sortAsc = true;
	let flagFilter = 'all';
	let techTf = '15m';
	let splitRatio = storage.getRightPanel().splitRatio || 0.52;
	let prevPrices = new Map();
	let detailCache = { symbol: null, oi: null, perf: null, tech: null, techTf: null };

	rootEl.innerHTML = `
		<div class="tv-panel-header">
			<span class="tv-panel-title">Watchlist</span>
			<div class="tv-panel-actions">
				<select id="wl-flag-filter" class="tv-select" style="padding:2px 6px;font-size:11px;" title="Filter by flag">
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
		renderList();
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
			renderList();
		});
	});

	addBtnEl.addEventListener('click', () => openAddSymbolModal());

	async function openAddSymbolModal() {
		const cache = await getExchangeInfo();
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
					<div>
						<strong>${m.displaySymbol}</strong>
						<span style="font-size:11px;color:var(--text-secondary);margin-left:6px;">${m.baseAsset}/${m.quoteAsset} Perpetual</span>
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

	function addSymbol(sym, sectionId = 'favorites') {
		const clean = normalizeSymbol(sym);
		for (const sec of sections) {
			if (sec.items.some((i) => i.symbol === clean)) return;
		}
		const target = sections.find((s) => s.id === sectionId) || sections[0];
		target.items.unshift({ symbol: clean, flag: '' });
		storage.setWatchlist(sections);
		renderList();
	}

	function removeSymbol(sym) {
		for (const sec of sections) {
			sec.items = sec.items.filter((i) => i.symbol !== sym);
		}
		storage.setWatchlist(sections);
		renderList();
	}

	function cycleFlag(sym) {
		for (const sec of sections) {
			const item = sec.items.find((i) => i.symbol === sym);
			if (item) {
				const idx = FLAG_CYCLE.indexOf(item.flag || '');
				item.flag = FLAG_CYCLE[(idx + 1) % FLAG_CYCLE.length];
				break;
			}
		}
		storage.setWatchlist(sections);
		renderList();
	}

	function renderList() {
		const activeSym = getActiveSymbol();
		let html = '';

		for (const sec of sections) {
			let items = sec.items.filter((i) => flagFilter === 'all' || i.flag === flagFilter);
			if (sortField) {
				items = [...items].sort((a, b) => {
					const ta = marketHub.getTicker(a.symbol);
					const tb = marketHub.getTicker(b.symbol);
					let va, vb;
					if (sortField === 'symbol') {
						va = a.symbol;
						vb = b.symbol;
						return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
					}
					va = ta ? ta[sortField] : -Infinity;
					vb = tb ? tb[sortField] : -Infinity;
					return sortAsc ? va - vb : vb - va;
				});
			}

			html += `
				<div class="tv-wl-section-hdr" data-sec="${sec.id}">
					<span>${sec.collapsed ? '▸' : '▾'} ${escapeHtml(sec.name)} (${items.length})</span>
				</div>
			`;
			if (!sec.collapsed) {
				for (const item of items) {
					const t = marketHub.getTicker(item.symbol);
					const lastStr = t ? formatPriceForSymbol(t.last, item.symbol) : '--';
					const chgStr = t ? `${t.chg >= 0 ? '+' : ''}${formatPriceForSymbol(t.chg, item.symbol)}` : '--';
					const pctStr = t ? `${t.chgPct >= 0 ? '+' : ''}${t.chgPct.toFixed(2)}%` : '--';
					const cls = t ? (t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral') : 'is-neutral';

					let flashCls = '';
					if (t) {
						const old = prevPrices.get(item.symbol);
						if (old !== undefined && old !== t.last) {
							flashCls = t.last > old ? 'flash-up' : 'flash-down';
						}
						prevPrices.set(item.symbol, t.last);
					}

					html += `
						<div class="tv-wl-row ${item.symbol === activeSym ? 'is-active' : ''} ${flashCls}" data-sym="${item.symbol}">
							<div class="tv-wl-sym-cell">
								<span class="tv-flag-dot" data-flag="${item.flag || ''}" data-flag-sym="${item.symbol}" title="Click to change flag"></span>
								<span class="tv-wl-sym-name">${item.symbol.replace('USDT', '')}<span style="color:var(--text-secondary);font-weight:400;font-size:10px;">/USDT</span></span>
							</div>
							<span class="tv-wl-num">${lastStr}</span>
							<span class="tv-wl-num ${cls}">${chgStr}</span>
							<span class="tv-wl-num ${cls}">${pctStr}</span>
							<button class="tv-wl-remove" data-rm="${item.symbol}" title="Remove">&times;</button>
						</div>
					`;
				}
			}
		}

		listEl.innerHTML = html;

		listEl.querySelectorAll('.tv-wl-section-hdr').forEach((hdr) => {
			hdr.addEventListener('click', () => {
				const sec = sections.find((s) => s.id === hdr.dataset.sec);
				if (sec) {
					sec.collapsed = !sec.collapsed;
					storage.setWatchlist(sections);
					renderList();
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

		listEl.querySelectorAll('.tv-wl-row').forEach((row) => {
			row.addEventListener('click', () => {
				onSelectSymbol(row.dataset.sym);
			});
		});
	}

	async function refreshSymbolInsights(sym, forceTech = false) {
		if (detailCache.symbol !== sym) {
			detailCache = { symbol: sym, oi: null, perf: null, tech: null, techTf };
		}
		try {
			const [oiRes, dailyKlines, techKlines] = await Promise.all([
				getOpenInterest(sym).catch(() => null),
				detailCache.perf ? Promise.resolve(null) : getKlines(sym, '1d', { limit: 32 }).catch(() => null),
				forceTech || !detailCache.tech || detailCache.techTf !== techTf
					? getKlines(sym, techTf, { limit: 70 }).catch(() => null)
					: Promise.resolve(null),
			]);

			if (oiRes && oiRes.openInterest) {
				detailCache.oi = parseFloat(oiRes.openInterest);
			}

			if (Array.isArray(dailyKlines) && dailyKlines.length >= 2) {
				const lastC = parseFloat(dailyKlines[dailyKlines.length - 1][4]);
				const pctFrom = (daysBack) => {
					const idx = Math.max(0, dailyKlines.length - 1 - daysBack);
					const base = parseFloat(dailyKlines[idx][4]);
					return base > 0 ? ((lastC - base) / base) * 100 : 0;
				};
				detailCache.perf = {
					'7D': pctFrom(7),
					'14D': pctFrom(14),
					'30D': pctFrom(30),
				};
			}

			if (Array.isArray(techKlines) && techKlines.length >= 35) {
				const closes = techKlines.map((k) => parseFloat(k[4]));
				detailCache.tech = computeTechnicals(closes);
				detailCache.techTf = techTf;
			}

			renderDetails();
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

	function renderDetails() {
		const sym = getActiveSymbol();
		const t = marketHub.getTicker(sym);
		const m = marketHub.getMark(sym);

		const priceStr = t ? formatPriceForSymbol(t.last, sym) : '--';
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

		const oiUsd = detailCache.oi && t ? formatCompactUsd(detailCache.oi * t.last) : '--';
		const perf = detailCache.perf;
		const tech = detailCache.tech || { buy: 0, neutral: 0, sell: 0, score: 0, verdict: 'Loading...' };

		// Gauge needle angle (-90deg to +90deg)
		const angle = Math.max(-85, Math.min(85, tech.score * 85));
		const verdictCls = tech.score >= 0.15 ? 'is-up' : tech.score <= -0.15 ? 'is-down' : 'is-neutral';

		detailsEl.innerHTML = `
			<div class="tv-det-header">
				<div>
					<div class="tv-det-sym">
						${formatDisplaySymbol(sym)}
						<span class="tv-brand-dot" style="width:6px;height:6px;"></span>
					</div>
					<div class="tv-det-sub">Binance Futures · USDT-M Perpetual</div>
				</div>
				<button id="det-alert-btn" class="tv-btn-secondary" style="padding:4px 8px;font-size:11px;">+ Alert</button>
			</div>

			<div class="tv-det-price-row">
				<span class="tv-det-price">${priceStr}</span>
				<span class="tv-det-chg ${cls}">${chgStr} (${pctStr})</span>
			</div>

			<div class="tv-det-grid">
				<div class="tv-stat-box">
					<div class="tv-stat-label">Mark / Index</div>
					<div class="tv-stat-val">${markStr} <span style="color:var(--text-secondary);font-weight:400;">/ ${idxStr}</span></div>
				</div>
				<div class="tv-stat-box">
					<div class="tv-stat-label">Funding · <span id="det-fund-cd">${countdown}</span></div>
					<div class="tv-stat-val ${fundCls}">${fundPct}</div>
				</div>
				<div class="tv-stat-box">
					<div class="tv-stat-label">24h Volume (USDT)</div>
					<div class="tv-stat-val">${t ? formatCompactUsd(t.quoteVolume) : '--'}</div>
				</div>
				<div class="tv-stat-box">
					<div class="tv-stat-label">Open Interest</div>
					<div class="tv-stat-val">${oiUsd} <span style="color:var(--text-secondary);font-weight:400;">(${detailCache.oi ? formatCompactQty(detailCache.oi) : '--'})</span></div>
				</div>
			</div>

			<div class="tv-range-wrap">
				<div class="tv-range-labels">
					<span>24h Low: ${t ? formatPriceForSymbol(t.low, sym) : '--'}</span>
					<span>High: ${t ? formatPriceForSymbol(t.high, sym) : '--'}</span>
				</div>
				<div class="tv-range-bar">
					<div class="tv-range-fill" style="width:${rangePos.toFixed(1)}%;"></div>
					<div class="tv-range-dot" style="left:${rangePos.toFixed(1)}%;"></div>
				</div>
			</div>

			<div>
				<div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;">Performance</div>
				<div class="tv-perf-grid">
					${['7D', '14D', '30D'].map((k) => {
						const v = perf ? perf[k] : null;
						const c = v === null ? 'is-neutral' : v >= 0 ? 'is-up' : 'is-down';
						return `
							<div class="tv-perf-card">
								<div class="tv-perf-tf">${k}</div>
								<div class="tv-perf-val ${c}">${v === null ? '--' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}</div>
							</div>
						`;
					}).join('')}
				</div>
			</div>

			<div class="tv-tech-card">
				<div class="tv-tech-hdr">
					<span style="font-size:12px;font-weight:700;">Technicals</span>
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
						<path d="M 82 18 A 70 70 0 0 1 98 18" fill="none" stroke="#787B86" stroke-width="8"/>
						<path d="M 103 19 A 70 70 0 0 1 128 29" fill="none" stroke="#2962FF" stroke-width="8"/>
						<path d="M 134 33 A 70 70 0 0 1 160 88" fill="none" stroke="#089981" stroke-width="8" stroke-linecap="round"/>
						<g transform="translate(90, 88) rotate(${angle})">
							<line x1="0" y1="0" x2="0" y2="-54" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round"/>
							<circle cx="0" cy="0" r="4.5" fill="var(--text-primary)"/>
						</g>
					</svg>
					<div class="tv-gauge-verdict ${verdictCls}">${tech.verdict}</div>
					<div class="tv-gauge-counts">
						<span class="is-down">Sell: <strong>${tech.sell}</strong></span>
						<span class="is-neutral">Neutral: <strong>${tech.neutral}</strong></span>
						<span class="is-up">Buy: <strong>${tech.buy}</strong></span>
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

	// Live funding countdown tick every second
	window.setInterval(() => {
		const cdEl = detailsEl.querySelector('#det-fund-cd');
		if (!cdEl) return;
		const m = marketHub.getMark(getActiveSymbol());
		if (m) cdEl.textContent = formatCountdown(m.nextFundingTime);
	}, 1000);

	marketHub.onUpdate(() => {
		renderList();
		renderDetails();
	});

	renderList();
	renderDetails();
	refreshSymbolInsights(getActiveSymbol());

	return {
		onActiveSymbolChanged(sym) {
			renderList();
			renderDetails();
			refreshSymbolInsights(sym, true);
		},
		openAddSymbolModal,
	};
}
