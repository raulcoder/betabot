import { formatPriceForSymbol } from '../services/binanceApi.js';
import { marketHub } from '../services/marketHub.js';
import { storage } from '../services/storage.js';

const TAPE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'LINKUSDT', 'DOGEUSDT'];

export function createTickerTape(containerEl, onSelectSymbol) {
	let visible = storage.getShowTickerTape();
	const trackEl = document.createElement('div');
	trackEl.className = 'tv-ticker-track';
	containerEl.appendChild(trackEl);

	const itemMap = new Map(); // sym -> array of DOM elements (original + duplicate for seamless marquee)

	function buildItems() {
		trackEl.innerHTML = '';
		itemMap.clear();

		for (let pass = 0; pass < 2; pass++) {
			for (const sym of TAPE_SYMBOLS) {
				const el = document.createElement('div');
				el.className = 'tv-ticker-item';
				el.innerHTML = `
					<span class="tv-ticker-sym">${sym.replace('USDT', '/USDT')}</span>
					<span class="tv-ticker-price">--</span>
					<span class="tv-ticker-chg is-neutral">0.00%</span>
				`;
				el.addEventListener('click', () => onSelectSymbol(sym));
				trackEl.appendChild(el);
				if (!itemMap.has(sym)) itemMap.set(sym, []);
				itemMap.get(sym).push(el);
			}
		}
	}

	function update() {
		if (!visible) return;
		for (const sym of TAPE_SYMBOLS) {
			const t = marketHub.getTicker(sym);
			if (!t) continue;
			const cls = t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral';
			const sign = t.chgPct > 0 ? '+' : '';
			const priceStr = formatPriceForSymbol(t.last, sym);
			const chgStr = `${sign}${t.chgPct.toFixed(2)}%`;

			for (const el of itemMap.get(sym) || []) {
				const pEl = el.querySelector('.tv-ticker-price');
				const cEl = el.querySelector('.tv-ticker-chg');
				pEl.textContent = priceStr;
				cEl.textContent = chgStr;
				cEl.className = `tv-ticker-chg ${cls}`;
			}
		}
	}

	function setVisible(next) {
		visible = Boolean(next);
		storage.setShowTickerTape(visible);
		containerEl.classList.toggle('is-hidden', !visible);
		if (visible) update();
	}

	buildItems();
	setVisible(visible);
	marketHub.onUpdate(update);

	return {
		isVisible: () => visible,
		setVisible,
		toggle: () => setVisible(!visible),
	};
}
