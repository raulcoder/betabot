import { formatDisplaySymbol } from '../services/binanceApi.js';
import { escapeHtml } from './toast.js';

export function createObjectTreePanel({ rootEl, chartManager }) {
	rootEl.innerHTML = `
		<div class="tv-panel-header">
			<span class="tv-panel-title">Object Tree</span>
			<button id="obj-refresh-btn" class="tv-tb-btn is-icon" title="Refresh Objects">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
			</button>
		</div>
		<div id="obj-list" class="tv-scroll-list"></div>
	`;

	const listEl = rootEl.querySelector('#obj-list');
	rootEl.querySelector('#obj-refresh-btn').addEventListener('click', render);

	function render() {
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

		html += `<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-top:6px;">INDICATORS (${studies.length})</div>`;
		if (!studies.length) {
			html += `<div style="font-size:11px;color:var(--text-muted);padding:4px 2px;">No active indicators</div>`;
		} else {
			for (const st of studies) {
				html += `
					<div class="tv-card-item">
						<div class="tv-card-row">
							<span>${escapeHtml(st.name)}</span>
							<button class="tv-btn-secondary" data-rm-entity="${escapeHtml(st.id)}" style="padding:2px 6px;font-size:11px;">Remove</button>
						</div>
					</div>
				`;
			}
		}

		html += `<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-top:6px;">DRAWINGS (${shapes.length})</div>`;
		if (!shapes.length) {
			html += `<div style="font-size:11px;color:var(--text-muted);padding:4px 2px;">No drawings on active chart</div>`;
		} else {
			for (const sh of shapes) {
				html += `
					<div class="tv-card-item">
						<div class="tv-card-row">
							<span>${escapeHtml(sh.name || 'Drawing')}</span>
							<button class="tv-btn-secondary" data-rm-entity="${escapeHtml(sh.id)}" style="padding:2px 6px;font-size:11px;">Remove</button>
						</div>
					</div>
				`;
			}
		}

		listEl.innerHTML = html;
		listEl.querySelectorAll('[data-rm-entity]').forEach((btn) => {
			btn.addEventListener('click', () => {
				chartManager.removeEntity(btn.dataset.rmEntity);
			});
		});
	}

	chartManager.on('objects-changed', render);
	chartManager.on('active-chart-ready', render);

	return { refresh: render };
}
