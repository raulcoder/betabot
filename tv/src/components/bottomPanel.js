import { formatDisplaySymbol, formatPriceForSymbol, normalizeSymbol } from '../services/binanceApi.js';
import { marketHub } from '../services/marketHub.js';
import { storage } from '../services/storage.js';
import { escapeHtml, formatCompactUsd, getCoinAvatarHtml, showToast } from './toast.js';

export function createBottomPanel({
	rootEl,
	resizerEl,
	getActiveSymbol,
	onSelectSymbol,
	getAlertLog,
	onClearAlertLog,
	onPaperChanged,
}) {
	let state = storage.getBottomPanel();
	let paper = storage.getPaperTrading();
	let paperSubTab = 'positions'; // 'positions' | 'orders' | 'history'
	let screenerFilter = 'all'; // 'all' | 'gainers' | 'losers' | 'volume' | 'funding'
	let screenerQuery = '';
	let screenerSort = { col: 'quoteVolume', asc: false };
	let ticketBuiltForSym = null;

	rootEl.innerHTML = `
		<div class="tv-bottom-tabs">
			<div class="tv-bottom-tab-list">
				<button class="tv-bottom-tab" data-btab="trading">Paper Trading <span id="bt-pos-count" class="tv-badge-count" style="display:none;">0</span></button>
				<button class="tv-bottom-tab" data-btab="screener">Futures Screener</button>
				<button class="tv-bottom-tab" data-btab="alerts-log">Alert Log <span id="bt-log-count" class="tv-badge-count" style="display:none;">0</span></button>
			</div>
			<div style="display:flex;align-items:center;gap:6px;">
				<span id="bt-equity-mini" style="font-size:11px;color:var(--text-secondary);font-variant-numeric:tabular-nums;"></span>
				<button id="bt-toggle-btn" class="tv-tb-btn is-icon" title="Expand / Collapse Panel">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 15l6-6 6 6"/></svg>
				</button>
			</div>
		</div>
		<div id="bt-body" class="tv-bottom-body"></div>
	`;

	const bodyEl = rootEl.querySelector('#bt-body');
	const toggleBtn = rootEl.querySelector('#bt-toggle-btn');
	const posCountEl = rootEl.querySelector('#bt-pos-count');
	const logCountEl = rootEl.querySelector('#bt-log-count');
	const equityMiniEl = rootEl.querySelector('#bt-equity-mini');

	function applyDrawerState() {
		rootEl.classList.toggle('is-open', state.open);
		rootEl.style.height = state.open ? `${state.height || 240}px` : '34px';
		resizerEl.style.display = state.open ? 'block' : 'none';
		toggleBtn.style.transform = state.open ? 'rotate(180deg)' : 'rotate(0deg)';
		rootEl.querySelectorAll('.tv-bottom-tab').forEach((b) => {
			b.classList.toggle('is-active', state.open && b.dataset.btab === state.tab);
		});
		storage.setBottomPanel(state);
		if (state.open) renderActiveTab();
	}

	rootEl.querySelectorAll('.tv-bottom-tab').forEach((btn) => {
		btn.addEventListener('click', () => {
			const nextTab = btn.dataset.btab;
			if (state.open && state.tab === nextTab) {
				state.open = false;
			} else {
				state.open = true;
				state.tab = nextTab;
			}
			applyDrawerState();
		});
	});

	toggleBtn.addEventListener('click', () => {
		state.open = !state.open;
		applyDrawerState();
	});

	resizerEl.addEventListener('pointerdown', (ev) => {
		if (!state.open) return;
		ev.preventDefault();
		resizerEl.classList.add('is-dragging');
		const startY = ev.clientY;
		const startH = rootEl.clientHeight;
		const onMove = (e) => {
			const nextH = Math.max(150, Math.min(window.innerHeight * 0.65, startH - (e.clientY - startY)));
			state.height = Math.round(nextH);
			rootEl.style.height = `${state.height}px`;
		};
		const onUp = () => {
			resizerEl.classList.remove('is-dragging');
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			storage.setBottomPanel(state);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	});

	function calcUnrealizedPnl(pos, currentPrice) {
		if (!currentPrice) return 0;
		const diff = pos.side === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
		return diff * pos.qty;
	}

	function calcPortfolioStats() {
		let unrealized = 0;
		let usedMargin = 0;
		for (const pos of paper.positions) {
			const t = marketHub.getTicker(pos.symbol);
			const last = t ? t.last : pos.entryPrice;
			unrealized += calcUnrealizedPnl(pos, last);
			usedMargin += pos.marginUsd;
		}
		const equity = paper.balance + usedMargin + unrealized;
		return { unrealized, usedMargin, equity };
	}

	function savePaper() {
		storage.setPaperTrading(paper);
		updateBadges();
		if (onPaperChanged) onPaperChanged(paper);
	}

	function updateBadges() {
		const count = paper.positions.length;
		posCountEl.textContent = String(count);
		posCountEl.style.display = count > 0 ? 'inline-flex' : 'none';

		const logs = getAlertLog ? getAlertLog() : [];
		logCountEl.textContent = String(logs.length);
		logCountEl.style.display = logs.length > 0 ? 'inline-flex' : 'none';

		const { equity, unrealized } = calcPortfolioStats();
		const pnlSign = unrealized >= 0 ? '+' : '';
		equityMiniEl.innerHTML = `Equity: <strong style="color:var(--text-strong);">$${equity.toFixed(2)}</strong> (<span class="${unrealized >= 0 ? 'is-up' : 'is-down'}">${pnlSign}$${unrealized.toFixed(2)}</span>)`;
	}

	function placeOrder({ symbol, side, orderType, marginUsd, leverage, limitPrice, tp, sl }) {
		const sym = normalizeSymbol(symbol || getActiveSymbol());
		const ticker = marketHub.getTicker(sym);
		if (!ticker || !ticker.last) {
			showToast({ title: 'No live price', message: 'Waiting for Binance ticker feed.', tone: 'warn' });
			return false;
		}
		if (!Number.isFinite(marginUsd) || marginUsd <= 0 || marginUsd > paper.balance) {
			showToast({ title: 'Insufficient Balance', message: `Available balance: $${paper.balance.toFixed(2)}`, tone: 'down' });
			return false;
		}

		if (orderType === 'LIMIT') {
			if (!limitPrice || limitPrice <= 0) {
				showToast({ title: 'Invalid Limit Price', tone: 'down' });
				return false;
			}
			paper.balance -= marginUsd;
			paper.orders.unshift({
				id: `ord_${Date.now()}`,
				symbol: sym,
				side,
				marginUsd,
				leverage,
				limitPrice,
				tp: tp || null,
				sl: sl || null,
				createdAt: Date.now(),
			});
			savePaper();
			renderActiveTab();
			showToast({ title: 'Limit Order Placed', message: `${side} ${formatDisplaySymbol(sym)} @ ${formatPriceForSymbol(limitPrice, sym)}` });
			return true;
		}

		openPosition({ symbol: sym, side, entryPrice: ticker.last, marginUsd, leverage, tp, sl });
		return true;
	}

	function openPosition({ symbol, side, entryPrice, marginUsd, leverage, tp, sl, alreadyDeducted = false }) {
		if (!alreadyDeducted) paper.balance -= marginUsd;
		const notional = marginUsd * leverage;
		const qty = notional / entryPrice;
		const liqDist = entryPrice * (0.9 / leverage);
		const liqPrice = side === 'LONG' ? Math.max(0, entryPrice - liqDist) : entryPrice + liqDist;

		paper.positions.unshift({
			id: `pos_${Date.now()}_${Math.random().toString(16).slice(2, 5)}`,
			symbol,
			side,
			entryPrice,
			marginUsd,
			leverage,
			qty,
			liqPrice,
			tp: tp || null,
			sl: sl || null,
			openedAt: Date.now(),
		});
		savePaper();
		renderActiveTab();
		showToast({
			title: `${side} Position Opened`,
			message: `${formatDisplaySymbol(symbol)} ${leverage}x @ ${formatPriceForSymbol(entryPrice, symbol)}`,
			tone: side === 'LONG' ? 'up' : 'down',
		});
	}

	function closePosition(posId, exitPrice, reason = 'Manual Close') {
		const idx = paper.positions.findIndex((p) => p.id === posId);
		if (idx === -1) return;
		const pos = paper.positions[idx];
		const t = marketHub.getTicker(pos.symbol);
		const closePx = exitPrice || (t ? t.last : pos.entryPrice);
		const pnl = calcUnrealizedPnl(pos, closePx);

		paper.balance = Math.max(0, paper.balance + pos.marginUsd + pnl);
		paper.realizedPnl += pnl;
		paper.history.unshift({
			id: pos.id,
			symbol: pos.symbol,
			side: pos.side,
			leverage: pos.leverage,
			entryPrice: pos.entryPrice,
			exitPrice: closePx,
			pnl,
			reason,
			closedAt: Date.now(),
		});
		if (paper.history.length > 60) paper.history.length = 60;
		paper.positions.splice(idx, 1);
		savePaper();
		renderActiveTab();
		showToast({
			title: `Position Closed (${reason})`,
			message: `${formatDisplaySymbol(pos.symbol)} PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
			tone: pnl >= 0 ? 'up' : 'down',
		});
	}

	function reversePosition(posId) {
		const pos = paper.positions.find((p) => p.id === posId);
		if (!pos) return;
		const nextSide = pos.side === 'LONG' ? 'SHORT' : 'LONG';
		const t = marketHub.getTicker(pos.symbol);
		const px = t ? t.last : pos.entryPrice;
		const margin = pos.marginUsd;
		const lev = pos.leverage;
		closePosition(posId, px, 'Reversed');
		if (paper.balance >= margin) {
			openPosition({ symbol: pos.symbol, side: nextSide, entryPrice: px, marginUsd: margin, leverage: lev });
		}
	}

	function updatePositionTpSl(posId, field, newPrice) {
		const pos = paper.positions.find((p) => p.id === posId);
		if (!pos) return;
		pos[field] = newPrice === null ? null : Number(newPrice);
		savePaper();
		if (state.open && state.tab === 'trading') renderPaperTable();
	}

	function updateLimitOrderPrice(orderId, newPrice) {
		const ord = paper.orders.find((o) => o.id === orderId);
		const px = Number(newPrice);
		if (!ord || !Number.isFinite(px) || px <= 0) return;
		ord.limitPrice = px;
		savePaper();
		if (state.open && state.tab === 'trading') renderPaperTable();
		showToast({ title: 'Order Modified', message: `${formatDisplaySymbol(ord.symbol)} @ ${formatPriceForSymbol(px, ord.symbol)}` });
	}

	function cancelLimitOrder(orderId) {
		const idx = paper.orders.findIndex((o) => o.id === orderId);
		if (idx === -1) return;
		paper.balance += paper.orders[idx].marginUsd;
		paper.orders.splice(idx, 1);
		savePaper();
		if (state.open && state.tab === 'trading') renderPaperTrading(true);
	}

	// Evaluate Limit Orders, TP, SL, and Liquidations on every live tick
	marketHub.onTick((updated) => {
		let mutated = false;
		const pxMap = new Map(updated.map((u) => [u.symbol, u.last]));

		for (let i = paper.orders.length - 1; i >= 0; i--) {
			const ord = paper.orders[i];
			const px = pxMap.get(ord.symbol);
			if (px === undefined) continue;
			const filled = ord.side === 'LONG' ? px <= ord.limitPrice : px >= ord.limitPrice;
			if (filled) {
				paper.orders.splice(i, 1);
				openPosition({
					symbol: ord.symbol,
					side: ord.side,
					entryPrice: ord.limitPrice,
					marginUsd: ord.marginUsd,
					leverage: ord.leverage,
					tp: ord.tp,
					sl: ord.sl,
					alreadyDeducted: true,
				});
				mutated = true;
			}
		}

		for (let i = paper.positions.length - 1; i >= 0; i--) {
			const pos = paper.positions[i];
			const px = pxMap.get(pos.symbol);
			if (px === undefined) continue;

			if (pos.side === 'LONG') {
				if (px <= pos.liqPrice) {
					closePosition(pos.id, pos.liqPrice, 'Liquidated');
					mutated = true;
				} else if (pos.tp && px >= pos.tp) {
					closePosition(pos.id, pos.tp, 'Take Profit');
					mutated = true;
				} else if (pos.sl && px <= pos.sl) {
					closePosition(pos.id, pos.sl, 'Stop Loss');
					mutated = true;
				}
			} else {
				if (px >= pos.liqPrice) {
					closePosition(pos.id, pos.liqPrice, 'Liquidated');
					mutated = true;
				} else if (pos.tp && px <= pos.tp) {
					closePosition(pos.id, pos.tp, 'Take Profit');
					mutated = true;
				} else if (pos.sl && px >= pos.sl) {
					closePosition(pos.id, pos.sl, 'Stop Loss');
					mutated = true;
				}
			}
		}

		if (mutated) savePaper();
	});

	function renderPaperTrading(forceTicketRebuild = false) {
		const sym = getActiveSymbol();
		const ticker = marketHub.getTicker(sym);
		const lastPx = ticker ? ticker.last : 0;
		const { unrealized, equity } = calcPortfolioStats();

		const existingWrap = bodyEl.querySelector('.tv-pt-wrap');
		if (existingWrap && !forceTicketRebuild && ticketBuiltForSym === sym) {
			const lastEl = bodyEl.querySelector('#pt-ticket-last');
			if (lastEl) lastEl.textContent = `Last: ${formatPriceForSymbol(lastPx, sym)}`;
			const sumInfoEl = bodyEl.querySelector('#pt-summary-stats');
			if (sumInfoEl) {
				sumInfoEl.innerHTML = `
					<span>Balance: <strong>$${paper.balance.toFixed(2)}</strong></span>
					<span>Equity: <strong>$${equity.toFixed(2)}</strong></span>
					<span>Unrealized PnL: <strong class="${unrealized >= 0 ? 'is-up' : 'is-down'}">${unrealized >= 0 ? '+' : ''}$${unrealized.toFixed(2)}</strong></span>
					<span>Realized: <strong class="${paper.realizedPnl >= 0 ? 'is-up' : 'is-down'}">${paper.realizedPnl >= 0 ? '+' : ''}$${paper.realizedPnl.toFixed(2)}</strong></span>
				`;
			}
			renderPaperTable();
			return;
		}

		ticketBuiltForSym = sym;
		bodyEl.innerHTML = `
			<div class="tv-pt-wrap">
				<div class="tv-pt-ticket">
					<div style="display:flex;justify-content:space-between;align-items:center;">
						<strong style="font-size:12px;">${formatDisplaySymbol(sym)}</strong>
						<span id="pt-ticket-last" style="font-size:11px;color:var(--text-secondary);">Last: ${formatPriceForSymbol(lastPx, sym)}</span>
					</div>
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
						<select id="pt-type" class="tv-select">
							<option value="MARKET">Market</option>
							<option value="LIMIT">Limit</option>
						</select>
						<select id="pt-lev" class="tv-select">
							${[1, 2, 5, 10, 20, 50].map((l) => `<option value="${l}" ${l === 10 ? 'selected' : ''}>${l}x Leverage</option>`).join('')}
						</select>
					</div>
					<input id="pt-limit" type="number" step="any" class="tv-input" placeholder="Limit Price (${lastPx || ''})" style="display:none;" />
					<input id="pt-margin" type="number" step="any" class="tv-input" value="250" placeholder="Margin (USDT)" />
					<div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:4px;">
						${[10, 25, 50, 100].map((pct) => `<button type="button" class="tv-chip-btn" data-pt-pct="${pct}" style="background:var(--bg-card);border:1px solid var(--border);">${pct}%</button>`).join('')}
					</div>
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
						<input id="pt-tp" type="number" step="any" class="tv-input" placeholder="Take Profit" />
						<input id="pt-sl" type="number" step="any" class="tv-input" placeholder="Stop Loss" />
					</div>
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:2px;">
						<button id="pt-buy" class="tv-btn-buy">Buy / Long</button>
						<button id="pt-sell" class="tv-btn-sell">Sell / Short</button>
					</div>
				</div>

				<div class="tv-pt-main">
					<div class="tv-pt-summary">
						<div id="pt-summary-stats" style="display:flex;gap:14px;flex-wrap:wrap;">
							<span>Balance: <strong>$${paper.balance.toFixed(2)}</strong></span>
							<span>Equity: <strong>$${equity.toFixed(2)}</strong></span>
							<span>Unrealized PnL: <strong class="${unrealized >= 0 ? 'is-up' : 'is-down'}">${unrealized >= 0 ? '+' : ''}$${unrealized.toFixed(2)}</strong></span>
							<span>Realized: <strong class="${paper.realizedPnl >= 0 ? 'is-up' : 'is-down'}">${paper.realizedPnl >= 0 ? '+' : ''}$${paper.realizedPnl.toFixed(2)}</strong></span>
						</div>
						<div style="display:flex;align-items:center;gap:6px;">
							<button class="tv-chip-btn ${paperSubTab === 'positions' ? 'is-active' : ''}" data-pt-sub="positions">Positions (${paper.positions.length})</button>
							<button class="tv-chip-btn ${paperSubTab === 'orders' ? 'is-active' : ''}" data-pt-sub="orders">Orders (${paper.orders.length})</button>
							<button class="tv-chip-btn ${paperSubTab === 'history' ? 'is-active' : ''}" data-pt-sub="history">History (${paper.history.length})</button>
							${paper.positions.length ? `<button id="pt-close-all" class="tv-btn-secondary" style="padding:3px 7px;font-size:11px;color:var(--down);">Close All</button>` : ''}
							<button id="pt-reset" class="tv-btn-secondary" style="padding:3px 7px;font-size:11px;">Reset $10k</button>
						</div>
					</div>
					<div id="pt-table-wrap" class="tv-table-wrap"></div>
				</div>
			</div>
		`;

		const typeEl = bodyEl.querySelector('#pt-type');
		const limitEl = bodyEl.querySelector('#pt-limit');
		const levEl = bodyEl.querySelector('#pt-lev');
		const marginEl = bodyEl.querySelector('#pt-margin');
		const tpEl = bodyEl.querySelector('#pt-tp');
		const slEl = bodyEl.querySelector('#pt-sl');

		typeEl.addEventListener('change', () => {
			limitEl.style.display = typeEl.value === 'LIMIT' ? 'block' : 'none';
			if (typeEl.value === 'LIMIT' && !limitEl.value && lastPx) limitEl.value = String(lastPx);
		});

		bodyEl.querySelectorAll('[data-pt-pct]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const pct = parseFloat(btn.dataset.ptPct) / 100;
				marginEl.value = (paper.balance * pct).toFixed(2);
			});
		});

		const submit = (side) => {
			placeOrder({
				symbol: sym,
				side,
				orderType: typeEl.value,
				marginUsd: parseFloat(marginEl.value),
				leverage: parseInt(levEl.value, 10),
				limitPrice: parseFloat(limitEl.value),
				tp: parseFloat(tpEl.value) || null,
				sl: parseFloat(slEl.value) || null,
			});
		};

		bodyEl.querySelector('#pt-buy').addEventListener('click', () => submit('LONG'));
		bodyEl.querySelector('#pt-sell').addEventListener('click', () => submit('SHORT'));
		bodyEl.querySelector('#pt-close-all')?.addEventListener('click', () => {
			for (let i = paper.positions.length - 1; i >= 0; i--) {
				closePosition(paper.positions[i].id, null, 'Close All');
			}
		});
		bodyEl.querySelector('#pt-reset').addEventListener('click', () => {
			paper = storage.resetPaperTrading();
			savePaper();
			renderPaperTrading(true);
		});

		bodyEl.querySelectorAll('[data-pt-sub]').forEach((b) => {
			b.addEventListener('click', () => {
				paperSubTab = b.dataset.ptSub;
				renderPaperTrading(true);
			});
		});

		renderPaperTable();
	}

	function renderPaperTable() {
		const wrap = bodyEl.querySelector('#pt-table-wrap');
		if (!wrap) return;

		if (paperSubTab === 'positions') {
			if (!paper.positions.length) {
				wrap.innerHTML = `<div class="tv-empty-state">No open positions. Use the order ticket or on-chart BUY/SELL buttons.</div>`;
				return;
			}
			wrap.innerHTML = `
				<table class="tv-table">
					<thead><tr><th>Symbol</th><th>Side</th><th>Size</th><th>Margin</th><th>Entry</th><th>Mark</th><th>Liq.</th><th>TP / SL</th><th>PnL (ROE%)</th><th>Action</th></tr></thead>
					<tbody>
						${paper.positions.map((pos) => {
							const t = marketHub.getTicker(pos.symbol);
							const px = t ? t.last : pos.entryPrice;
							const pnl = calcUnrealizedPnl(pos, px);
							const roe = (pnl / pos.marginUsd) * 100;
							const cls = pnl >= 0 ? 'is-up' : 'is-down';
							return `
								<tr>
									<td><button data-goto-sym="${pos.symbol}" style="font-weight:700;">${formatDisplaySymbol(pos.symbol)}</button></td>
									<td class="${pos.side === 'LONG' ? 'is-up' : 'is-down'}"><strong>${pos.side} ${pos.leverage}x</strong></td>
									<td>${pos.qty.toFixed(4)}</td>
									<td>$${pos.marginUsd.toFixed(2)}</td>
									<td>${formatPriceForSymbol(pos.entryPrice, pos.symbol)}</td>
									<td>${formatPriceForSymbol(px, pos.symbol)}</td>
									<td style="color:var(--warn);">${formatPriceForSymbol(pos.liqPrice, pos.symbol)}</td>
									<td>${pos.tp ? formatPriceForSymbol(pos.tp, pos.symbol) : '--'} / ${pos.sl ? formatPriceForSymbol(pos.sl, pos.symbol) : '--'}</td>
									<td class="${cls}"><strong>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${roe >= 0 ? '+' : ''}${roe.toFixed(1)}%)</strong></td>
									<td style="display:flex;gap:4px;">
										<button class="tv-btn-secondary" data-rev-pos="${pos.id}" style="padding:2px 6px;font-size:11px;">Rev</button>
										<button class="tv-btn-secondary" data-close-pos="${pos.id}" style="padding:2px 8px;font-size:11px;">Close</button>
									</td>
								</tr>
							`;
						}).join('')}
					</tbody>
				</table>
			`;
			wrap.querySelectorAll('[data-close-pos]').forEach((btn) => {
				btn.addEventListener('click', () => closePosition(btn.dataset.closePos));
			});
			wrap.querySelectorAll('[data-rev-pos]').forEach((btn) => {
				btn.addEventListener('click', () => reversePosition(btn.dataset.revPos));
			});
			wrap.querySelectorAll('[data-goto-sym]').forEach((btn) => {
				btn.addEventListener('click', () => onSelectSymbol(btn.dataset.gotoSym));
			});
		} else if (paperSubTab === 'orders') {
			if (!paper.orders.length) {
				wrap.innerHTML = `<div class="tv-empty-state">No open limit orders.</div>`;
				return;
			}
			wrap.innerHTML = `
				<table class="tv-table">
					<thead><tr><th>Symbol</th><th>Side</th><th>Margin</th><th>Limit Price</th><th>TP / SL</th><th>Action</th></tr></thead>
					<tbody>
						${paper.orders.map((ord) => `
							<tr>
								<td><strong>${formatDisplaySymbol(ord.symbol)}</strong></td>
								<td class="${ord.side === 'LONG' ? 'is-up' : 'is-down'}">${ord.side} ${ord.leverage}x</td>
								<td>$${ord.marginUsd}</td>
								<td>${formatPriceForSymbol(ord.limitPrice, ord.symbol)}</td>
								<td>${ord.tp || '--'} / ${ord.sl || '--'}</td>
								<td><button class="tv-btn-secondary" data-cancel-ord="${ord.id}" style="padding:2px 8px;font-size:11px;">Cancel</button></td>
							</tr>
						`).join('')}
					</tbody>
				</table>
			`;
			wrap.querySelectorAll('[data-cancel-ord]').forEach((btn) => {
				btn.addEventListener('click', () => cancelLimitOrder(btn.dataset.cancelOrd));
			});
		} else {
			if (!paper.history.length) {
				wrap.innerHTML = `<div class="tv-empty-state">No closed trades yet.</div>`;
				return;
			}
			wrap.innerHTML = `
				<table class="tv-table">
					<thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th>Reason</th><th>Realized PnL</th></tr></thead>
					<tbody>
						${paper.history.map((h) => `
							<tr>
								<td style="color:var(--text-secondary);">${new Date(h.closedAt).toLocaleTimeString('en-GB', { hour12: false })}</td>
								<td><strong>${formatDisplaySymbol(h.symbol)}</strong></td>
								<td class="${h.side === 'LONG' ? 'is-up' : 'is-down'}">${h.side} ${h.leverage}x</td>
								<td>${formatPriceForSymbol(h.entryPrice, h.symbol)}</td>
								<td>${formatPriceForSymbol(h.exitPrice, h.symbol)}</td>
								<td>${escapeHtml(h.reason)}</td>
								<td class="${h.pnl >= 0 ? 'is-up' : 'is-down'}"><strong>${h.pnl >= 0 ? '+' : ''}$${h.pnl.toFixed(2)}</strong></td>
							</tr>
						`).join('')}
					</tbody>
				</table>
			`;
		}
	}

	function renderScreener() {
		bodyEl.innerHTML = `
			<div class="tv-screener-bar">
				<div style="display:flex;gap:4px;flex-wrap:wrap;">
					<button class="tv-chip-btn ${screenerFilter === 'all' ? 'is-active' : ''}" data-sc-f="all">All USDT-M</button>
					<button class="tv-chip-btn ${screenerFilter === 'gainers' ? 'is-active' : ''}" data-sc-f="gainers">Top Gainers</button>
					<button class="tv-chip-btn ${screenerFilter === 'losers' ? 'is-active' : ''}" data-sc-f="losers">Top Losers</button>
					<button class="tv-chip-btn ${screenerFilter === 'volume' ? 'is-active' : ''}" data-sc-f="volume">Top Volume</button>
					<button class="tv-chip-btn ${screenerFilter === 'funding' ? 'is-active' : ''}" data-sc-f="funding">Extreme Funding</button>
				</div>
				<input id="sc-search" class="tv-input" value="${escapeHtml(screenerQuery)}" placeholder="Filter symbol..." style="width:180px;padding:4px 8px;" />
			</div>
			<div id="sc-table-wrap" class="tv-table-wrap"></div>
		`;

		bodyEl.querySelectorAll('[data-sc-f]').forEach((btn) => {
			btn.addEventListener('click', () => {
				screenerFilter = btn.dataset.scF;
				if (screenerFilter === 'gainers') screenerSort = { col: 'chgPct', asc: false };
				else if (screenerFilter === 'losers') screenerSort = { col: 'chgPct', asc: true };
				else if (screenerFilter === 'volume') screenerSort = { col: 'quoteVolume', asc: false };
				else if (screenerFilter === 'funding') screenerSort = { col: 'fundingAbs', asc: false };
				renderScreener();
			});
		});

		const searchEl = bodyEl.querySelector('#sc-search');
		searchEl.addEventListener('input', () => {
			screenerQuery = searchEl.value;
			renderScreenerRows();
		});

		renderScreenerRows();
	}

	function renderScreenerRows() {
		const wrap = bodyEl.querySelector('#sc-table-wrap');
		if (!wrap) return;
		const q = screenerQuery.trim().toUpperCase();

		let rows = [];
		for (const [sym, t] of marketHub.tickers.entries()) {
			if (!sym.endsWith('USDT')) continue;
			if (q && !sym.includes(q)) continue;
			const m = marketHub.getMark(sym);
			rows.push({
				symbol: sym,
				last: t.last,
				chgPct: t.chgPct,
				quoteVolume: t.quoteVolume,
				high: t.high,
				low: t.low,
				funding: m ? m.fundingRate * 100 : 0,
				fundingAbs: m ? Math.abs(m.fundingRate) : 0,
			});
		}

		rows.sort((a, b) => {
			const c = screenerSort.col;
			if (c === 'symbol') return screenerSort.asc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
			return screenerSort.asc ? a[c] - b[c] : b[c] - a[c];
		});
		rows = rows.slice(0, 80);

		wrap.innerHTML = `
			<table class="tv-table">
				<thead>
					<tr>
						<th data-sc-col="symbol">Symbol</th>
						<th data-sc-col="last">Last</th>
						<th data-sc-col="chgPct">24h Chg%</th>
						<th data-sc-col="quoteVolume">24h Vol (USDT)</th>
						<th data-sc-col="funding">Funding %</th>
						<th>24h Low / High</th>
					</tr>
				</thead>
				<tbody>
					${rows.map((r) => `
						<tr data-sc-sym="${r.symbol}" style="cursor:pointer;">
							<td><div style="display:flex;align-items:center;gap:7px;">${getCoinAvatarHtml(r.symbol, 16)}<strong>${formatDisplaySymbol(r.symbol)}</strong></div></td>
							<td>${formatPriceForSymbol(r.last, r.symbol)}</td>
							<td class="${r.chgPct >= 0 ? 'is-up' : 'is-down'}"><strong>${r.chgPct >= 0 ? '+' : ''}${r.chgPct.toFixed(2)}%</strong></td>
							<td>${formatCompactUsd(r.quoteVolume)}</td>
							<td class="${r.funding >= 0 ? 'is-up' : 'is-down'}">${r.funding.toFixed(4)}%</td>
							<td style="color:var(--text-secondary);">${formatPriceForSymbol(r.low, r.symbol)} / ${formatPriceForSymbol(r.high, r.symbol)}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;

		wrap.querySelectorAll('[data-sc-col]').forEach((th) => {
			th.addEventListener('click', () => {
				const col = th.dataset.scCol;
				if (screenerSort.col === col) screenerSort.asc = !screenerSort.asc;
				else screenerSort = { col, asc: col === 'symbol' };
				renderScreenerRows();
			});
		});

		wrap.querySelectorAll('[data-sc-sym]').forEach((tr) => {
			tr.addEventListener('click', () => onSelectSymbol(tr.dataset.scSym));
		});
	}

	function renderAlertLog() {
		const logs = getAlertLog ? getAlertLog() : [];
		bodyEl.innerHTML = `
			<div class="tv-screener-bar">
				<span style="font-size:12px;color:var(--text-secondary);">Triggered Price Alerts (${logs.length})</span>
				<button id="log-clear-btn" class="tv-btn-secondary" style="padding:3px 8px;font-size:11px;">Clear Log</button>
			</div>
			<div class="tv-table-wrap">
				${logs.length ? `
					<table class="tv-table">
						<thead><tr><th>Time</th><th>Symbol</th><th>Condition</th><th>Target</th><th>Triggered @</th><th>Note</th></tr></thead>
						<tbody>
							${logs.map((l) => `
								<tr>
									<td style="color:var(--text-secondary);">${new Date(l.time).toLocaleTimeString('en-GB', { hour12: false })}</td>
									<td><strong>${formatDisplaySymbol(l.symbol)}</strong></td>
									<td>${escapeHtml(l.condition)}</td>
									<td>${formatPriceForSymbol(l.price, l.symbol)}</td>
									<td>${formatPriceForSymbol(l.triggeredPrice, l.symbol)}</td>
									<td style="color:var(--text-secondary);">${escapeHtml(l.note || '')}</td>
								</tr>
							`).join('')}
						</tbody>
					</table>
				` : `<div class="tv-empty-state">No triggered alerts yet.</div>`}
			</div>
		`;
		bodyEl.querySelector('#log-clear-btn')?.addEventListener('click', () => {
			if (onClearAlertLog) onClearAlertLog();
			renderAlertLog();
		});
	}

	function renderActiveTab() {
		if (!state.open) return;
		if (state.tab === 'trading') renderPaperTrading(true);
		else if (state.tab === 'screener') renderScreener();
		else renderAlertLog();
	}

	marketHub.onUpdate(() => {
		updateBadges();
		if (state.open && state.tab === 'trading' && paperSubTab === 'positions') {
			renderPaperTrading(false);
		} else if (state.open && state.tab === 'screener') {
			const searchEl = bodyEl.querySelector('#sc-search');
			if (document.activeElement !== searchEl) renderScreenerRows();
		}
	});

	applyDrawerState();
	updateBadges();

	return {
		openTab(tab) {
			state.open = true;
			state.tab = tab;
			applyDrawerState();
		},
		toggleTab(tab) {
			if (state.open && state.tab === tab) state.open = false;
			else {
				state.open = true;
				state.tab = tab;
			}
			applyDrawerState();
		},
		isOpen: () => state.open,
		refresh: () => {
			updateBadges();
			if (state.open) renderActiveTab();
		},
		getPaper: () => paper,
		quickMarketOrder(side, marginUsd = 250) {
			placeOrder({
				symbol: getActiveSymbol(),
				side,
				orderType: 'MARKET',
				marginUsd: Number(marginUsd) || 250,
				leverage: 10,
			});
		},
		prefillLimitOrder({ symbol, side = 'LONG', price }) {
			state.open = true;
			state.tab = 'trading';
			applyDrawerState();
			const typeEl = bodyEl.querySelector('#pt-type');
			const limitEl = bodyEl.querySelector('#pt-limit');
			const marginEl = bodyEl.querySelector('#pt-margin');
			if (typeEl && limitEl) {
				typeEl.value = 'LIMIT';
				limitEl.style.display = 'block';
				limitEl.value = String(Number(price));
			}
			marginEl?.focus();
			showToast({
				title: `Limit ${side} Prefilled`,
				message: `${formatDisplaySymbol(symbol || getActiveSymbol())} @ ${formatPriceForSymbol(price, symbol || getActiveSymbol())}`,
			});
		},
		closePosition,
		reversePosition,
		updatePositionTpSl,
		updateLimitOrderPrice,
		cancelLimitOrder,
		onActiveSymbolChanged() {
			if (state.open && state.tab === 'trading') renderPaperTrading(true);
		},
	};
}
