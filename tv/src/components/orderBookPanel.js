import { formatDisplaySymbol, formatPriceForSymbol, normalizeSymbol } from '../services/binanceApi.js';
import { formatCompactUsd } from './toast.js';

export function createOrderBookPanel({ rootEl, getActiveSymbol, onPriceClick }) {
	let subTab = 'book'; // 'book' | 'trades'
	let active = false;
	let currentSym = null;
	let depthWs = null;
	let tradeWs = null;
	let lastBook = { bids: [], asks: [] };
	let trades = [];

	rootEl.innerHTML = `
		<div class="tv-panel-header">
			<span class="tv-panel-title">Order Book & Trades</span>
			<span id="ob-sym-label" style="font-size:11px;color:var(--text-secondary);">--</span>
		</div>
		<div class="tv-ob-subtabs">
			<button class="tv-chip-btn is-active" data-ob-tab="book">Order Book</button>
			<button class="tv-chip-btn" data-ob-tab="trades">Market Trades</button>
		</div>
		<div id="ob-body" class="tv-ob-body"></div>
	`;

	const symLabelEl = rootEl.querySelector('#ob-sym-label');
	const bodyEl = rootEl.querySelector('#ob-body');

	rootEl.querySelectorAll('[data-ob-tab]').forEach((btn) => {
		btn.addEventListener('click', () => {
			subTab = btn.dataset.obTab;
			rootEl.querySelectorAll('[data-ob-tab]').forEach((b) => {
				b.classList.toggle('is-active', b.dataset.obTab === subTab);
			});
			render();
		});
	});

	function disconnect() {
		if (depthWs) {
			try { depthWs.onclose = null; depthWs.close(); } catch { /* ignore */ }
			depthWs = null;
		}
		if (tradeWs) {
			try { tradeWs.onclose = null; tradeWs.close(); } catch { /* ignore */ }
			tradeWs = null;
		}
	}

	function connect(sym) {
		disconnect();
		currentSym = normalizeSymbol(sym);
		symLabelEl.textContent = formatDisplaySymbol(currentSym);
		lastBook = { bids: [], asks: [] };
		trades = [];
		render();

		const low = currentSym.toLowerCase();
		depthWs = new WebSocket(`wss://fstream.binance.com/ws/${low}@depth20@100ms`);
		depthWs.onmessage = (ev) => {
			if (!active) return;
			try {
				const d = JSON.parse(ev.data);
				if (Array.isArray(d.b) && Array.isArray(d.a)) {
					lastBook = {
						bids: d.b.slice(0, 14).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
						asks: d.a.slice(0, 14).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
					};
					if (subTab === 'book') renderBook();
				}
			} catch { /* ignore */ }
		};

		tradeWs = new WebSocket(`wss://fstream.binance.com/ws/${low}@aggTrade`);
		tradeWs.onmessage = (ev) => {
			if (!active) return;
			try {
				const d = JSON.parse(ev.data);
				const price = parseFloat(d.p);
				const qty = parseFloat(d.q);
				trades.unshift({
					price,
					qty,
					usd: price * qty,
					isSell: Boolean(d.m),
					time: new Date(d.T).toLocaleTimeString('en-GB', { hour12: false }),
				});
				if (trades.length > 45) trades.length = 45;
				if (subTab === 'trades') renderTrades();
			} catch { /* ignore */ }
		};
	}

	function renderBook() {
		const sym = currentSym || getActiveSymbol();
		const asks = [...lastBook.asks].reverse();
		const bids = lastBook.bids;

		if (!asks.length && !bids.length) {
			bodyEl.innerHTML = `<div class="tv-empty-state">Connecting to Binance Futures L2 depth...</div>`;
			return;
		}

		const maxAsk = Math.max(1e-9, ...asks.map((x) => x[1]));
		const maxBid = Math.max(1e-9, ...bids.map((x) => x[1]));
		const sumBid = bids.reduce((a, b) => a + b[1], 0);
		const sumAsk = asks.reduce((a, b) => a + b[1], 0);
		const bidPct = sumBid + sumAsk > 0 ? (sumBid / (sumBid + sumAsk)) * 100 : 50;

		const bestAsk = asks.length ? asks[asks.length - 1][0] : 0;
		const bestBid = bids.length ? bids[0][0] : 0;
		const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
		const spreadPct = bestAsk ? (spread / bestAsk) * 100 : 0;

		bodyEl.innerHTML = `
			<div class="tv-ob-cols"><span>Price</span><span>Size</span><span>Total (USDT)</span></div>
			<div>
				${asks.map(([p, q]) => `
					<div class="tv-ob-row is-ask" data-price="${p}">
						<div class="tv-ob-depth" style="width:${Math.min(100, (q / maxAsk) * 100).toFixed(1)}%"></div>
						<span class="is-down">${formatPriceForSymbol(p, sym)}</span>
						<span>${q.toFixed(3)}</span>
						<span>${formatCompactUsd(p * q)}</span>
					</div>
				`).join('')}
			</div>
			<div class="tv-ob-spread">
				<span>Spread: ${formatPriceForSymbol(spread, sym)}</span>
				<span style="color:var(--text-secondary);font-size:11px;">${spreadPct.toFixed(3)}%</span>
			</div>
			<div class="tv-ob-ratio" title="Bid ${bidPct.toFixed(1)}% / Ask ${(100 - bidPct).toFixed(1)}%">
				<div class="tv-ob-ratio-bid" style="width:${bidPct.toFixed(1)}%"></div>
			</div>
			<div>
				${bids.map(([p, q]) => `
					<div class="tv-ob-row is-bid" data-price="${p}">
						<div class="tv-ob-depth" style="width:${Math.min(100, (q / maxBid) * 100).toFixed(1)}%"></div>
						<span class="is-up">${formatPriceForSymbol(p, sym)}</span>
						<span>${q.toFixed(3)}</span>
						<span>${formatCompactUsd(p * q)}</span>
					</div>
				`).join('')}
			</div>
		`;

		bodyEl.querySelectorAll('.tv-ob-row').forEach((row) => {
			row.addEventListener('click', () => {
				if (onPriceClick) onPriceClick(parseFloat(row.dataset.price));
			});
		});
	}

	function renderTrades() {
		const sym = currentSym || getActiveSymbol();
		if (!trades.length) {
			bodyEl.innerHTML = `<div class="tv-empty-state">Waiting for live trades...</div>`;
			return;
		}
		bodyEl.innerHTML = `
			<div class="tv-ob-cols"><span>Price</span><span>Size (USDT)</span><span>Time</span></div>
			${trades.map((tr) => `
				<div class="tv-ob-row tv-trade-row ${tr.usd >= 50000 ? 'is-whale' : ''}" data-price="${tr.price}">
					<span class="${tr.isSell ? 'is-down' : 'is-up'}">${formatPriceForSymbol(tr.price, sym)}</span>
					<span>${formatCompactUsd(tr.usd)}</span>
					<span style="color:var(--text-secondary);">${tr.time}</span>
				</div>
			`).join('')}
		`;
	}

	function render() {
		if (subTab === 'book') renderBook();
		else renderTrades();
	}

	return {
		setActive(isOpen) {
			active = isOpen;
			if (active) {
				connect(getActiveSymbol());
			} else {
				disconnect();
			}
		},
		onActiveSymbolChanged(sym) {
			if (active && normalizeSymbol(sym) !== currentSym) {
				connect(sym);
			} else {
				symLabelEl.textContent = formatDisplaySymbol(sym);
			}
		},
	};
}
