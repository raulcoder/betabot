import { formatDisplaySymbol, formatPriceForSymbol, normalizeSymbol } from '../services/binanceApi.js';
import { marketHub } from '../services/marketHub.js';
import { storage } from '../services/storage.js';
import { escapeHtml, playAlertBeep, showToast } from './toast.js';

export function createAlertsPanel({
	rootEl,
	getActiveSymbol,
	openModal,
	closeModal,
	onAlertsChanged,
	onLogUpdated,
}) {
	let alerts = storage.getAlerts();
	let alertLog = storage.getAlertLog();
	const lastPrices = new Map();

	rootEl.innerHTML = `
		<div class="tv-panel-header">
			<span class="tv-panel-title">Alerts</span>
			<div class="tv-panel-actions">
				<button id="al-add-btn" class="tv-btn-primary" style="padding:4px 8px;font-size:11px;">+ New Alert</button>
			</div>
		</div>
		<div id="al-list" class="tv-scroll-list"></div>
	`;

	const listEl = rootEl.querySelector('#al-list');
	rootEl.querySelector('#al-add-btn').addEventListener('click', () => openCreateAlertModal(getActiveSymbol()));

	function persist() {
		storage.setAlerts(alerts);
		render();
		onAlertsChanged(alerts);
	}

	function render() {
		const badge = document.getElementById('rail-alerts-badge');
		const activeCount = alerts.filter((a) => a.active).length;
		if (badge) {
			badge.textContent = activeCount > 0 ? String(activeCount) : '';
			badge.style.display = activeCount > 0 ? 'flex' : 'none';
		}

		if (!alerts.length) {
			listEl.innerHTML = `
				<div class="tv-empty-state">
					No alerts configured.<br/>
					Click <strong>+ New Alert</strong> or press <strong>Alt+A</strong> to set a price alert.
				</div>
			`;
			return;
		}

		listEl.innerHTML = alerts.map((al) => `
			<div class="tv-card-item" style="opacity:${al.active ? 1 : 0.58};">
				<div class="tv-card-row">
					<strong>${formatDisplaySymbol(al.symbol)}</strong>
					<div style="display:flex;align-items:center;gap:6px;">
						<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${al.active ? 'var(--up-bg)' : 'var(--bg-hover)'};color:${al.active ? 'var(--up)' : 'var(--text-secondary)'};">
							${al.active ? 'Active' : 'Triggered'}
						</span>
						<button data-toggle="${al.id}" style="font-size:11px;color:var(--accent);">${al.active ? 'Pause' : 'Rearm'}</button>
						<button data-del="${al.id}" style="font-size:13px;color:var(--text-secondary);">&times;</button>
					</div>
				</div>
				<div style="font-size:12px;">
					${escapeHtml(al.condition)} <strong>${formatPriceForSymbol(al.price, al.symbol)}</strong>
				</div>
				${al.note ? `<div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(al.note)}</div>` : ''}
			</div>
		`).join('');

		listEl.querySelectorAll('[data-toggle]').forEach((btn) => {
			btn.addEventListener('click', () => {
				const al = alerts.find((a) => a.id === btn.dataset.toggle);
				if (al) {
					al.active = !al.active;
					persist();
				}
			});
		});

		listEl.querySelectorAll('[data-del]').forEach((btn) => {
			btn.addEventListener('click', () => {
				alerts = alerts.filter((a) => a.id !== btn.dataset.del);
				persist();
			});
		});
	}

	function openCreateAlertModal(defaultSym) {
		const sym = normalizeSymbol(defaultSym || getActiveSymbol());
		const ticker = marketHub.getTicker(sym);
		const currentPrice = ticker ? ticker.last : '';

		const form = document.createElement('form');
		form.style.display = 'flex';
		form.style.flexDirection = 'column';
		form.style.gap = '10px';
		form.innerHTML = `
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
				<div>
					<label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;">Symbol</label>
					<input name="symbol" class="tv-input" value="${sym}" style="width:100%;text-transform:uppercase;" required />
				</div>
				<div>
					<label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;">Condition</label>
					<select name="condition" class="tv-select" style="width:100%;">
						<option value="Crossing">Crossing</option>
						<option value="Crossing Up">Crossing Up</option>
						<option value="Crossing Down">Crossing Down</option>
					</select>
				</div>
			</div>
			<div>
				<label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;">Target Price (USDT)</label>
				<input name="price" type="number" step="any" class="tv-input" value="${currentPrice}" style="width:100%;" required />
			</div>
			<div>
				<label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;">Message / Note</label>
				<input name="note" class="tv-input" placeholder="e.g. Breakout level reached" style="width:100%;" />
			</div>
			<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
				<input name="sound" type="checkbox" checked /> Play alert chime
			</label>
			<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
				<button type="button" id="al-cancel" class="tv-btn-secondary">Cancel</button>
				<button type="submit" class="tv-btn-primary">Create Alert</button>
			</div>
		`;
		openModal('Create Price Alert', form);

		form.querySelector('#al-cancel').addEventListener('click', closeModal);
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			const fd = new FormData(form);
			const nextSym = normalizeSymbol(fd.get('symbol'));
			const price = parseFloat(fd.get('price'));
			if (!nextSym || !Number.isFinite(price)) return;

			alerts.unshift({
				id: `al_${Date.now()}`,
				symbol: nextSym,
				condition: String(fd.get('condition')),
				price,
				note: String(fd.get('note') || '').trim(),
				sound: fd.get('sound') === 'on',
				active: true,
				createdAt: Date.now(),
			});
			persist();
			closeModal();
			showToast({
				title: 'Alert Created',
				message: `${formatDisplaySymbol(nextSym)} ${fd.get('condition')} ${formatPriceForSymbol(price, nextSym)}`,
			});
		});
	}

	marketHub.onTick((updatedList) => {
		let changed = false;
		for (const t of updatedList) {
			const prev = lastPrices.get(t.symbol);
			lastPrices.set(t.symbol, t.last);
			if (prev === undefined) continue;

			for (const al of alerts) {
				if (!al.active || al.symbol !== t.symbol) continue;
				const target = al.price;
				let triggered = false;
				if (al.condition === 'Crossing Up') {
					triggered = prev < target && t.last >= target;
				} else if (al.condition === 'Crossing Down') {
					triggered = prev > target && t.last <= target;
				} else {
					triggered = (prev < target && t.last >= target) || (prev > target && t.last <= target);
				}

				if (triggered) {
					al.active = false;
					changed = true;
					const msg = `${formatDisplaySymbol(al.symbol)} ${al.condition} ${formatPriceForSymbol(target, al.symbol)}`;
					showToast({ title: 'Price Alert Triggered!', message: al.note || msg, tone: 'warn', duration: 7000 });
					if (al.sound) playAlertBeep();

					alertLog.unshift({
						id: `log_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
						time: Date.now(),
						symbol: al.symbol,
						condition: al.condition,
						price: target,
						triggeredPrice: t.last,
						note: al.note,
					});
					storage.setAlertLog(alertLog);
					if (onLogUpdated) onLogUpdated(alertLog);
				}
			}
		}
		if (changed) persist();
	});

	render();

	return {
		getAlerts: () => alerts,
		getAlertLog: () => alertLog,
		clearAlertLog() {
			alertLog = [];
			storage.setAlertLog([]);
			if (onLogUpdated) onLogUpdated([]);
		},
		openCreateAlertModal,
	};
}
