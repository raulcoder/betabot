import { formatDisplaySymbol, formatPriceForSymbol } from '../services/binanceApi.js';
import { marketHub } from '../services/marketHub.js';
import { escapeHtml, formatCompactQty, formatCompactUsd } from './toast.js';

export function createObjectTreePanel({ rootEl, chartManager }) {
	let subTab = 'objects'; // 'objects' | 'data'
	let lastCrosshair = null;
	const hiddenIds = new Set();

	rootEl.innerHTML = `
		<div class="tv-panel-header">
			<span class="tv-panel-title">Objects &amp; Data</span>
			<div class="tv-panel-actions">
				<button id="obj-clear-drawings" class="tv-btn-secondary" style="padding:3px 7px;font-size:11px;" title="Remove all drawings">Clear Drawings</button>
				<button id="obj-refresh-btn" class="tv-tb-btn is-icon" title="Refresh">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
				</button>
			</div>
		</div>
		<div class="tv-ob-subtabs">
			<button class="tv-chip-btn is-active" data-ot-tab="objects">Object Tree</button>
			<button class="tv-chip-btn" data-ot-tab="data">Data Window</button>
		</div>
		<div id="obj-list" class="tv-scroll-list"></div>
	`;

	const listEl = rootEl.querySelector('#obj-list');
	rootEl.querySelector('#obj-refresh-btn').addEventListener('click', render);
	rootEl.querySelector('#obj-clear-drawings').addEventListener('click', () => chartManager.removeAllShapes());

	rootEl.querySelectorAll('[data-ot-tab]').forEach((btn) => {
		btn.addEventListener('click', () => {
			subTab = btn.dataset.otTab;
			rootEl.querySelectorAll('[data-ot-tab]').forEach((b) => {
				b.classList.toggle('is-active', b.dataset.otTab === subTab);
			});
			render();
		});
	});

	function renderObjects() {
		const sym = chartManager.getActiveSymbol();
		const { studies, shapes } = chartManager.getActiveObjects();

		let html = `
			<div class="tv-card-item">
				<div class="tv-card-row">
					<strong>${formatDisplaySymbol(sym)}</strong>
					<span style="font-size:10px;color:var(--text-secondary);">Main Series</span>
				</div>
			</div>
		`;

		html += `<div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-top:6px;letter-spacing:0.4px;">INDICATORS (${studies.length})</div>`;
		if (!studies.length) {
			html += `<div style="font-size:11px;color:var(--text-muted);padding:4px 2px;">No active indicators</div>`;
		} else {
			for (const st of studies) {
				const isHidden = hiddenIds.has(st.id);
				html += `
					<div class="tv-card-item" style="opacity:${isHidden ? 0.55 : 1};">
						<div class="tv-card-row">
							<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(st.name)}</span>
							<div style="display:flex;align-items:center;gap:4px;">
								<button class="tv-btn-secondary" data-eye-entity="${escapeHtml(st.id)}" style="padding:2px 6px;font-size:10px;" title="Toggle visibility">${isHidden ? 'Show' : 'Hide'}</button>
								<button class="tv-btn-secondary" data-cfg-entity="${escapeHtml(st.id)}" style="padding:2px 6px;font-size:10px;" title="Settings">&#9881;</button>
								<button class="tv-btn-secondary" data-rm-entity="${escapeHtml(st.id)}" style="padding:2px 6px;font-size:10px;" title="Remove">&times;</button>
							</div>
						</div>
					</div>
				`;
			}
		}

		html += `<div style="font-size:10px;font-weight:700;color:var(--text-secondary);margin-top:6px;letter-spacing:0.4px;">DRAWINGS (${shapes.length})</div>`;
		if (!shapes.length) {
			html += `<div style="font-size:11px;color:var(--text-muted);padding:4px 2px;">No drawings on active chart</div>`;
		} else {
			for (const sh of shapes) {
				const isHidden = hiddenIds.has(sh.id);
				html += `
					<div class="tv-card-item" style="opacity:${isHidden ? 0.55 : 1};">
						<div class="tv-card-row">
							<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(sh.name || 'Drawing')}</span>
							<div style="display:flex;align-items:center;gap:4px;">
								<button class="tv-btn-secondary" data-eye-entity="${escapeHtml(sh.id)}" style="padding:2px 6px;font-size:10px;" title="Toggle visibility">${isHidden ? 'Show' : 'Hide'}</button>
								<button class="tv-btn-secondary" data-cfg-entity="${escapeHtml(sh.id)}" style="padding:2px 6px;font-size:10px;" title="Settings">&#9881;</button>
								<button class="tv-btn-secondary" data-rm-entity="${escapeHtml(sh.id)}" style="padding:2px 6px;font-size:10px;" title="Remove">&times;</button>
							</div>
						</div>
					</div>
				`;
			}
		}

		listEl.innerHTML = html;

		listEl.querySelectorAll('[data-eye-entity]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const id = btn.dataset.eyeEntity;
				const nextVisible = hiddenIds.has(id);
				if (nextVisible) hiddenIds.delete(id);
				else hiddenIds.add(id);
				chartManager.setEntityVisibility(id, nextVisible);
				renderObjects();
			});
		});

		listEl.querySelectorAll('[data-cfg-entity]').forEach((btn) => {
			btn.addEventListener('click', () => {
				chartManager.openEntitySettings(btn.dataset.cfgEntity);
			});
		});

		listEl.querySelectorAll('[data-rm-entity]').forEach((btn) => {
			btn.addEventListener('click', () => {
				hiddenIds.delete(btn.dataset.rmEntity);
				chartManager.removeEntity(btn.dataset.rmEntity);
			});
		});
	}

	function renderDataWindow() {
		const sym = chartManager.getActiveSymbol();
		const res = chartManager.getActiveInterval();
		const t = marketHub.getTicker(sym);
		const m = marketHub.getMark(sym);

		const chgCls = t ? (t.chgPct >= 0 ? 'is-up' : 'is-down') : '';
		const fundCls = m ? (m.fundingRate >= 0 ? 'is-up' : 'is-down') : '';
		const crossTime = lastCrosshair?.time ? new Date(lastCrosshair.time * 1000).toLocaleString('en-GB', { hour12: false }) : '--';
		const crossPrice = Number.isFinite(lastCrosshair?.price) ? formatPriceForSymbol(lastCrosshair.price, sym) : '--';

		listEl.innerHTML = `
			<div class="tv-card-item" style="padding:4px 8px;gap:0;">
				<div class="tv-dw-row"><span>Symbol</span><strong>${formatDisplaySymbol(sym)}</strong></div>
				<div class="tv-dw-row"><span>Interval</span><strong>${escapeHtml(res)}</strong></div>
				<div class="tv-dw-row"><span>Last</span><strong>${t ? formatPriceForSymbol(t.last, sym) : '--'}</strong></div>
				<div class="tv-dw-row"><span>24h Open</span><strong>${t ? formatPriceForSymbol(t.open, sym) : '--'}</strong></div>
				<div class="tv-dw-row"><span>24h High</span><strong>${t ? formatPriceForSymbol(t.high, sym) : '--'}</strong></div>
				<div class="tv-dw-row"><span>24h Low</span><strong>${t ? formatPriceForSymbol(t.low, sym) : '--'}</strong></div>
				<div class="tv-dw-row"><span>24h Change</span><strong class="${chgCls}">${t ? `${t.chg >= 0 ? '+' : ''}${formatPriceForSymbol(t.chg, sym)} (${t.chgPct.toFixed(2)}%)` : '--'}</strong></div>
				<div class="tv-dw-row"><span>24h Vol (Base)</span><strong>${t ? formatCompactQty(t.volume) : '--'}</strong></div>
				<div class="tv-dw-row"><span>24h Vol (USDT)</span><strong>${t ? formatCompactUsd(t.quoteVolume) : '--'}</strong></div>
				<div class="tv-dw-row"><span>Mark Price</span><strong>${m ? formatPriceForSymbol(m.markPrice, sym) : '--'}</strong></div>
				<div class="tv-dw-row"><span>Index Price</span><strong>${m ? formatPriceForSymbol(m.indexPrice, sym) : '--'}</strong></div>
				<div class="tv-dw-row" style="border-bottom:none;"><span>Funding Rate</span><strong class="${fundCls}">${m ? `${(m.fundingRate * 100).toFixed(4)}%` : '--'}</strong></div>
			</div>
			<div class="tv-card-item" style="padding:4px 8px;gap:0;">
				<div style="font-size:10px;font-weight:700;color:var(--text-secondary);padding:4px 8px;text-transform:uppercase;">Cursor Crosshair</div>
				<div class="tv-dw-row"><span>Cursor Price</span><strong>${crossPrice}</strong></div>
				<div class="tv-dw-row" style="border-bottom:none;"><span>Cursor Time</span><strong>${crossTime}</strong></div>
			</div>
		`;
	}

	function render() {
		if (subTab === 'objects') renderObjects();
		else renderDataWindow();
	}

	chartManager.on('objects-changed', () => {
		if (subTab === 'objects') renderObjects();
	});
	chartManager.on('active-chart-ready', render);
	chartManager.on('active-symbol-changed', render);
	chartManager.on('crosshair-moved', (params) => {
		lastCrosshair = params;
		if (subTab === 'data' && rootEl.classList.contains('is-active')) {
			renderDataWindow();
		}
	});
	marketHub.onUpdate(() => {
		if (subTab === 'data' && rootEl.classList.contains('is-active')) {
			renderDataWindow();
		}
	});

	return { refresh: render };
}
