import { formatPriceForSymbol, getExchangeInfo } from '../services/binanceApi.js';
import { marketHub } from '../services/marketHub.js';
import { escapeHtml, getCoinAvatarHtml } from './toast.js';

const TIMEFRAMES = [
	{ label: '1 minute', value: '1', hint: '1m' },
	{ label: '3 minutes', value: '3', hint: '3m' },
	{ label: '5 minutes', value: '5', hint: '5m' },
	{ label: '15 minutes', value: '15', hint: '15m' },
	{ label: '30 minutes', value: '30', hint: '30m' },
	{ label: '1 hour', value: '60', hint: '1h' },
	{ label: '4 hours', value: '240', hint: '4h' },
	{ label: '1 day', value: '1D', hint: '1D' },
	{ label: '1 week', value: '1W', hint: '1W' },
];

export function createCommandPalette({ openModal, closeModal, onCommand }) {
	async function open(initialQuery = '') {
		const cache = await getExchangeInfo().catch(() => ({ symbols: [] }));
		let selectedIdx = 0;
		let items = [];

		const wrap = document.createElement('div');
		wrap.innerHTML = `
			<input id="cp-input" class="tv-input" value="${escapeHtml(initialQuery)}" placeholder="Search symbol (BTC, SOL), timeframe (15m, 4h), or action (replay, theme, alert)..." style="width:100%;font-size:13px;padding:8px 10px;" />
			<div id="cp-list" class="tv-cp-list"></div>
		`;
		openModal('Symbol & Command Search  (Ctrl+K)', wrap);

		const inputEl = wrap.querySelector('#cp-input');
		const listEl = wrap.querySelector('#cp-list');

		const staticActions = [
			{ kind: 'action', title: 'Start Bar Replay', hint: 'Alt+R', run: () => onCommand({ type: 'replay' }) },
			{ kind: 'action', title: 'Toggle Dark / Light Theme', hint: 'Appearance', run: () => onCommand({ type: 'toggle-theme' }) },
			{ kind: 'action', title: 'Toggle Open Interest Indicator', hint: 'Indicator', run: () => onCommand({ type: 'study', study: 'OpenInterest' }) },
			{ kind: 'action', title: 'Toggle Funding Rate Indicator', hint: 'Indicator', run: () => onCommand({ type: 'study', study: 'FundingRate' }) },
			{ kind: 'action', title: 'Toggle Long/Short Ratio Indicator', hint: 'Indicator', run: () => onCommand({ type: 'study', study: 'LongShortRatio' }) },
			{ kind: 'action', title: 'Apply EMA Ribbon (9/21/50/200)', hint: 'Template', run: () => onCommand({ type: 'study-pack', pack: 'ema-ribbon' }) },
			{ kind: 'action', title: 'Apply Scalp Pack (VWAP + RSI)', hint: 'Template', run: () => onCommand({ type: 'study-pack', pack: 'scalp-pack' }) },
			{ kind: 'action', title: 'Create Price Alert', hint: 'Alt+A', run: () => onCommand({ type: 'create-alert' }) },
			{ kind: 'action', title: 'Open Paper Trading Terminal', hint: 'Alt+T', run: () => onCommand({ type: 'bottom-tab', tab: 'trading' }) },
			{ kind: 'action', title: 'Open Futures Screener', hint: 'Scanner', run: () => onCommand({ type: 'bottom-tab', tab: 'screener' }) },
			{ kind: 'action', title: 'Layout: Single Chart (1x1)', hint: 'Alt+1', run: () => onCommand({ type: 'layout', layout: '1' }) },
			{ kind: 'action', title: 'Layout: 2 Charts Side-by-Side', hint: 'Alt+2', run: () => onCommand({ type: 'layout', layout: '2h' }) },
			{ kind: 'action', title: 'Layout: 2 Charts Stacked', hint: 'Alt+3', run: () => onCommand({ type: 'layout', layout: '2v' }) },
			{ kind: 'action', title: 'Layout: 3 Charts (1+2)', hint: 'Alt+4', run: () => onCommand({ type: 'layout', layout: '3' }) },
			{ kind: 'action', title: 'Layout: 4 Charts Grid (2x2)', hint: 'Alt+5', run: () => onCommand({ type: 'layout', layout: '4' }) },
		];

		function computeItems() {
			const q = inputEl.value.trim().toLowerCase();
			const out = [];

			for (const tf of TIMEFRAMES) {
				if (q && (tf.hint.toLowerCase() === q || tf.label.toLowerCase().includes(q))) {
					out.push({
						kind: 'Timeframe',
						title: `Switch Timeframe: ${tf.label}`,
						hint: tf.hint,
						run: () => onCommand({ type: 'interval', interval: tf.value }),
					});
				}
			}

			const qClean = q.toUpperCase().replace(/\//g, '').replace(/\.P$/, '');
			let symCount = 0;
			for (const s of cache.symbols) {
				if (!qClean || s.symbol.includes(qClean) || s.baseAsset.includes(qClean)) {
					const t = marketHub.getTicker(s.symbol);
					out.push({
						kind: 'Symbol',
						symbol: s.symbol,
						title: s.displaySymbol,
						sub: `${s.baseAsset}/${s.quoteAsset} Perpetual`,
						hint: t ? `${formatPriceForSymbol(t.last, s.symbol)} (${t.chgPct >= 0 ? '+' : ''}${t.chgPct.toFixed(2)}%)` : 'BINANCE',
						run: () => onCommand({ type: 'symbol', symbol: s.symbol }),
					});
					symCount++;
					if (symCount >= (qClean ? 28 : 10)) break;
				}
			}

			for (const act of staticActions) {
				if (!q || act.title.toLowerCase().includes(q) || act.hint.toLowerCase().includes(q)) {
					out.push(act);
				}
			}

			items = out.slice(0, 42);
			if (selectedIdx >= items.length) selectedIdx = 0;
		}

		function render() {
			computeItems();
			listEl.innerHTML = items.map((it, idx) => `
				<div class="tv-cp-item ${idx === selectedIdx ? 'is-selected' : ''}" data-cp-idx="${idx}">
					<div style="display:flex;align-items:center;gap:8px;">
						${it.symbol ? getCoinAvatarHtml(it.symbol, 18) : ''}
						<div>
							<strong>${escapeHtml(it.title)}</strong>
							${it.sub ? `<span style="font-size:11px;color:var(--text-secondary);margin-left:6px;">${escapeHtml(it.sub)}</span>` : ''}
						</div>
					</div>
					<span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(it.hint || it.kind)}</span>
				</div>
			`).join('');

			listEl.querySelectorAll('.tv-cp-item').forEach((row) => {
				row.addEventListener('click', () => {
					const it = items[parseInt(row.dataset.cpIdx, 10)];
					if (it) {
						closeModal();
						it.run();
					}
				});
			});
		}

		inputEl.addEventListener('input', () => {
			selectedIdx = 0;
			render();
		});

		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIdx = (selectedIdx + 1) % Math.max(1, items.length);
				render();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIdx = (selectedIdx - 1 + items.length) % Math.max(1, items.length);
				render();
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const it = items[selectedIdx];
				if (it) {
					closeModal();
					it.run();
				}
			}
		});

		render();
		setTimeout(() => inputEl.focus(), 30);
	}

	return { open };
}
