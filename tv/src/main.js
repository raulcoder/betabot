import { ChartManager } from './chart/chartManager.js';
import { createAlertsPanel } from './components/alertsPanel.js';
import { createBottomPanel } from './components/bottomPanel.js';
import { createCommandPalette } from './components/commandPalette.js';
import { createObjectTreePanel } from './components/objectTreePanel.js';
import { createOrderBookPanel } from './components/orderBookPanel.js';
import { createTickerTape } from './components/tickerTape.js';
import { escapeHtml, showToast } from './components/toast.js';
import { createWatchlistPanel } from './components/watchlistPanel.js';
import { formatDisplaySymbol, formatPriceForSymbol } from './services/binanceApi.js';
import { marketHub } from './services/marketHub.js';
import { storage } from './services/storage.js';

// Modal controller
const modalBackdrop = document.getElementById('tv-modal-backdrop');
const modalTitle = document.getElementById('tv-modal-title');
const modalBody = document.getElementById('tv-modal-body');

function openModal(title, contentNode) {
	modalTitle.textContent = title;
	modalBody.innerHTML = '';
	if (typeof contentNode === 'string') {
		modalBody.innerHTML = contentNode;
	} else if (contentNode) {
		modalBody.appendChild(contentNode);
	}
	modalBackdrop.classList.add('is-open');
}

function closeModal() {
	modalBackdrop.classList.remove('is-open');
	modalBody.innerHTML = '';
}

document.getElementById('tv-modal-close').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
	if (e.target === modalBackdrop) closeModal();
});

// Dropdowns
function setupDropdown(btnId, menuId, onOpen) {
	const btn = document.getElementById(btnId);
	const menu = document.getElementById(menuId);
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		const wasOpen = menu.classList.contains('is-open');
		document.querySelectorAll('.tv-menu.is-open').forEach((m) => m.classList.remove('is-open'));
		if (!wasOpen) {
			if (onOpen) onOpen();
			menu.classList.add('is-open');
		}
	});
	menu.addEventListener('click', (e) => e.stopPropagation());
}
document.addEventListener('click', () => {
	document.querySelectorAll('.tv-menu.is-open').forEach((m) => m.classList.remove('is-open'));
});

// Theme & Locale
let currentTheme = storage.getTheme();
let currentLocale = storage.getLocale();

function applyShellTheme(theme) {
	currentTheme = theme === 'light' ? 'light' : 'dark';
	document.documentElement.setAttribute('data-theme', currentTheme);
	document.getElementById('icon-theme-sun').style.display = currentTheme === 'dark' ? 'block' : 'none';
	document.getElementById('icon-theme-moon').style.display = currentTheme === 'light' ? 'block' : 'none';
}
applyShellTheme(currentTheme);

// Initialize Core Services
const chartManager = new ChartManager(document.getElementById('charts-grid'));
marketHub.start();

// Header Symbol & Live Price Pill
const hdrSymbolEl = document.getElementById('hdr-active-symbol');
const hdrPriceEl = document.getElementById('hdr-active-price');
const hdrChgEl = document.getElementById('hdr-active-chg');
const wsStatusDot = document.getElementById('ws-status-dot');

function updateHeaderQuote() {
	const sym = chartManager.getActiveSymbol();
	hdrSymbolEl.textContent = formatDisplaySymbol(sym);
	const t = marketHub.getTicker(sym);
	if (t) {
		hdrPriceEl.textContent = formatPriceForSymbol(t.last, sym);
		const sign = t.chgPct >= 0 ? '+' : '';
		hdrChgEl.textContent = `${sign}${t.chgPct.toFixed(2)}%`;
		hdrChgEl.className = t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral';
	} else {
		hdrPriceEl.textContent = '--';
		hdrChgEl.textContent = '--';
		hdrChgEl.className = 'is-neutral';
	}
}

marketHub.onStatus((st) => {
	wsStatusDot.className = `tv-brand-dot ${st === 'connected' ? '' : st === 'reconnecting' ? 'is-reconnecting' : 'is-offline'}`;
	wsStatusDot.title = `Binance Futures Stream: ${st}`;
});

// Ticker Tape
const tickerTape = createTickerTape(document.getElementById('tv-ticker-tape'), (sym) => {
	chartManager.setSymbol(sym);
});
const tickerBtn = document.getElementById('btn-ticker-toggle');
tickerBtn.classList.toggle('is-active', tickerTape.isVisible());
tickerBtn.addEventListener('click', () => {
	tickerTape.toggle();
	tickerBtn.classList.toggle('is-active', tickerTape.isVisible());
});

// Right Panel & Icon Rail
let rightState = storage.getRightPanel();
const rightPanelEl = document.getElementById('right-panel');
const rightResizerEl = document.getElementById('right-resizer');
const railTabBtns = document.querySelectorAll('[data-rail-tab]');
const panelViews = {
	watchlist: document.getElementById('view-watchlist'),
	alerts: document.getElementById('view-alerts'),
	orderbook: document.getElementById('view-orderbook'),
	objects: document.getElementById('view-objects'),
};

let orderBookPanel;

function applyRightPanel() {
	rightPanelEl.classList.toggle('is-hidden', !rightState.open);
	rightResizerEl.classList.toggle('is-hidden', !rightState.open);
	rightPanelEl.style.width = `${rightState.width || 300}px`;

	railTabBtns.forEach((btn) => {
		btn.classList.toggle('is-active', rightState.open && btn.dataset.railTab === rightState.tab);
	});

	Object.entries(panelViews).forEach(([k, el]) => {
		el.classList.toggle('is-active', rightState.open && k === rightState.tab);
	});

	if (orderBookPanel) {
		orderBookPanel.setActive(rightState.open && rightState.tab === 'orderbook');
	}
	storage.setRightPanel(rightState);
}

railTabBtns.forEach((btn) => {
	btn.addEventListener('click', () => {
		const tab = btn.dataset.railTab;
		if (rightState.open && rightState.tab === tab) {
			rightState.open = false;
		} else {
			rightState.open = true;
			rightState.tab = tab;
		}
		applyRightPanel();
	});
});

rightResizerEl.addEventListener('pointerdown', (ev) => {
	if (!rightState.open) return;
	ev.preventDefault();
	rightResizerEl.classList.add('is-dragging');
	const startX = ev.clientX;
	const startW = rightPanelEl.clientWidth;
	const onMove = (e) => {
		const nextW = Math.max(240, Math.min(480, startW - (e.clientX - startX)));
		rightState.width = Math.round(nextW);
		rightPanelEl.style.width = `${rightState.width}px`;
	};
	const onUp = () => {
		rightResizerEl.classList.remove('is-dragging');
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		storage.setRightPanel(rightState);
	};
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
});

// Panels Initialization
let alertsPanel;
let bottomPanel;

function syncChartOverlays() {
	if (!alertsPanel || !bottomPanel) return;
	const paper = bottomPanel.getPaper();
	chartManager.syncChartLines(alertsPanel.getAlerts(), paper.positions, paper.orders);
}

const watchlistPanel = createWatchlistPanel({
	rootEl: panelViews.watchlist,
	getActiveSymbol: () => chartManager.getActiveSymbol(),
	onSelectSymbol: (sym) => chartManager.setSymbol(sym),
	onCreateAlert: (sym) => alertsPanel.openCreateAlertModal(sym),
	openModal,
	closeModal,
});

alertsPanel = createAlertsPanel({
	rootEl: panelViews.alerts,
	getActiveSymbol: () => chartManager.getActiveSymbol(),
	openModal,
	closeModal,
	onAlertsChanged: () => syncChartOverlays(),
	onLogUpdated: () => bottomPanel?.refresh(),
});

orderBookPanel = createOrderBookPanel({
	rootEl: panelViews.orderbook,
	getActiveSymbol: () => chartManager.getActiveSymbol(),
	onPriceClick: (px) => {
		showToast({
			title: 'Order Book Price',
			message: `${formatDisplaySymbol(chartManager.getActiveSymbol())} @ ${formatPriceForSymbol(px, chartManager.getActiveSymbol())}`,
		});
	},
});

createObjectTreePanel({
	rootEl: panelViews.objects,
	chartManager,
});

bottomPanel = createBottomPanel({
	rootEl: document.getElementById('bottom-drawer'),
	resizerEl: document.getElementById('bottom-resizer'),
	getActiveSymbol: () => chartManager.getActiveSymbol(),
	onSelectSymbol: (sym) => chartManager.setSymbol(sym),
	getAlertLog: () => alertsPanel.getAlertLog(),
	onClearAlertLog: () => alertsPanel.clearAlertLog(),
	onPaperChanged: () => syncChartOverlays(),
});

applyRightPanel();

// Chart Events Wiring
function updateStudyButtons() {
	const activeStudies = chartManager.getActiveCustomStudySet();
	document.querySelectorAll('[data-study]').forEach((btn) => {
		btn.classList.toggle('is-active', activeStudies.has(btn.dataset.study));
	});
}

chartManager.on('active-symbol-changed', (sym) => {
	updateHeaderQuote();
	watchlistPanel.onActiveSymbolChanged(sym);
	orderBookPanel.onActiveSymbolChanged(sym);
	bottomPanel.onActiveSymbolChanged(sym);
	syncChartOverlays();
});

chartManager.on('active-chart-ready', () => {
	updateHeaderQuote();
	updateStudyButtons();
	syncChartOverlays();
});

chartManager.on('objects-changed', () => {
	updateStudyButtons();
});

marketHub.onUpdate(updateHeaderQuote);

// Top Bar Controls
document.querySelectorAll('[data-study]').forEach((btn) => {
	btn.addEventListener('click', async () => {
		await chartManager.toggleCustomStudy(btn.dataset.study);
		updateStudyButtons();
	});
});

document.getElementById('btn-new-alert').addEventListener('click', () => {
	alertsPanel.openCreateAlertModal(chartManager.getActiveSymbol());
});

// Layout Switcher Menu
const layoutLabelMap = { '1': '1x1', '2h': '2H', '2v': '2V', '4': '2x2' };
const hdrLayoutLabel = document.getElementById('hdr-layout-label');
const chkSyncSym = document.getElementById('chk-sync-symbol');
const chkSyncInt = document.getElementById('chk-sync-interval');

function refreshLayoutMenuUI() {
	hdrLayoutLabel.textContent = layoutLabelMap[chartManager.layoutType] || '1x1';
	document.querySelectorAll('[data-layout-opt]').forEach((opt) => {
		opt.classList.toggle('is-selected', opt.dataset.layoutOpt === chartManager.layoutType);
	});
	chkSyncSym.checked = Boolean(chartManager.sync.symbol);
	chkSyncInt.checked = Boolean(chartManager.sync.interval);
}
refreshLayoutMenuUI();

setupDropdown('btn-layout-menu', 'menu-layout', refreshLayoutMenuUI);

document.querySelectorAll('[data-layout-opt]').forEach((opt) => {
	opt.addEventListener('click', () => {
		chartManager.setLayout(opt.dataset.layoutOpt);
		refreshLayoutMenuUI();
		document.getElementById('menu-layout').classList.remove('is-open');
	});
});

chkSyncSym.addEventListener('change', () => chartManager.setSync({ symbol: chkSyncSym.checked }));
chkSyncInt.addEventListener('change', () => chartManager.setSync({ interval: chkSyncInt.checked }));

// Save / Load Layouts Menu
function renderSavedLayoutsMenu() {
	const container = document.getElementById('saved-layouts-list');
	const list = storage.getSavedLayouts();
	if (!list.length) {
		container.innerHTML = `<div style="padding:8px;font-size:11px;color:var(--text-secondary);">No saved layouts yet.</div>`;
		return;
	}
	container.innerHTML = list.map((l) => `
		<div class="tv-menu-item" style="padding:4px 8px;">
			<button data-load-lay="${l.id}" style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;">
				<strong>${escapeHtml(l.name)}</strong>
				<span style="font-size:10px;color:var(--text-secondary);margin-left:4px;">(${layoutLabelMap[l.layoutType] || l.layoutType})</span>
			</button>
			<button data-del-lay="${l.id}" style="color:var(--text-secondary);font-size:13px;" title="Delete">&times;</button>
		</div>
	`).join('');

	container.querySelectorAll('[data-load-lay]').forEach((b) => {
		b.addEventListener('click', () => {
			chartManager.loadNamedLayout(b.dataset.loadLay);
			refreshLayoutMenuUI();
			document.getElementById('menu-saveload').classList.remove('is-open');
			showToast({ title: 'Layout Loaded' });
		});
	});
	container.querySelectorAll('[data-del-lay]').forEach((b) => {
		b.addEventListener('click', () => {
			chartManager.deleteNamedLayout(b.dataset.delLay);
			renderSavedLayoutsMenu();
		});
	});
}

setupDropdown('btn-saveload-menu', 'menu-saveload', renderSavedLayoutsMenu);

document.getElementById('btn-save-layout-now').addEventListener('click', () => {
	document.getElementById('menu-saveload').classList.remove('is-open');
	const form = document.createElement('form');
	form.innerHTML = `
		<label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;">Layout Name</label>
		<input name="name" class="tv-input" placeholder="e.g. BTC Scalping + OI" style="width:100%;margin-bottom:10px;" required autofocus />
		<div style="display:flex;justify-content:flex-end;gap:8px;">
			<button type="button" id="sl-cancel" class="tv-btn-secondary">Cancel</button>
			<button type="submit" class="tv-btn-primary">Save Layout</button>
		</div>
	`;
	openModal('Save Chart Layout', form);
	form.querySelector('#sl-cancel').addEventListener('click', closeModal);
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const name = new FormData(form).get('name');
		const rec = await chartManager.saveNamedLayout(String(name));
		closeModal();
		showToast({ title: 'Layout Saved', message: rec.name, tone: 'up' });
	});
});

document.getElementById('btn-export-layout').addEventListener('click', async () => {
	document.getElementById('menu-saveload').classList.remove('is-open');
	const data = await chartManager.exportActiveLayout();
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `betatv-layout-${Date.now()}.json`;
	a.click();
	URL.revokeObjectURL(url);
});

// Locale & Theme Buttons
const localeBtn = document.getElementById('btn-locale-toggle');
localeBtn.textContent = currentLocale.toUpperCase();
localeBtn.addEventListener('click', () => {
	currentLocale = currentLocale === 'pt' ? 'en' : 'pt';
	localeBtn.textContent = currentLocale.toUpperCase();
	chartManager.setLocale(currentLocale);
	showToast({ title: 'Language Switched', message: currentLocale === 'pt' ? 'Português' : 'English' });
});

document.getElementById('btn-theme-toggle').addEventListener('click', () => {
	const next = currentTheme === 'dark' ? 'light' : 'dark';
	applyShellTheme(next);
	chartManager.setTheme(next);
});

// Snapshot & Fullscreen
document.getElementById('btn-snapshot').addEventListener('click', async () => {
	const dataUrl = await chartManager.takeScreenshot();
	if (dataUrl) {
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = `${chartManager.getActiveSymbol()}-${Date.now()}.png`;
		a.click();
		showToast({ title: 'Snapshot Saved', message: `${formatDisplaySymbol(chartManager.getActiveSymbol())}.png`, tone: 'up' });
	}
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
	if (!document.fullscreenElement) {
		document.documentElement.requestFullscreen?.();
	} else {
		document.exitFullscreen?.();
	}
});

// Rail quick actions
document.getElementById('rail-btn-screener').addEventListener('click', () => bottomPanel.openTab('screener'));
document.getElementById('rail-btn-paper').addEventListener('click', () => bottomPanel.openTab('trading'));

document.getElementById('rail-btn-shortcuts').addEventListener('click', () => {
	openModal('Keyboard Shortcuts', `
		<div style="display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:12px;">
			<span>Quick Search (Symbols, Timeframes, Actions)</span><strong>Ctrl + K</strong>
			<span>Create Price Alert</span><strong>Alt + A</strong>
			<span>Toggle Paper Trading Drawer</span><strong>Alt + T</strong>
			<span>Single Chart Layout (1x1)</span><strong>Alt + 1</strong>
			<span>2 Charts Side-by-Side (2H)</span><strong>Alt + 2</strong>
			<span>2 Charts Stacked (2V)</span><strong>Alt + 3</strong>
			<span>4 Charts Grid (2x2)</span><strong>Alt + 4</strong>
			<span>Close Modal / Menu</span><strong>Esc</strong>
		</div>
	`);
});

// Command Palette
const commandPalette = createCommandPalette({
	openModal,
	closeModal,
	onCommand: async (cmd) => {
		if (cmd.type === 'symbol') chartManager.setSymbol(cmd.symbol);
		else if (cmd.type === 'interval') chartManager.setInterval(cmd.interval);
		else if (cmd.type === 'layout') {
			chartManager.setLayout(cmd.layout);
			refreshLayoutMenuUI();
		} else if (cmd.type === 'study') {
			await chartManager.toggleCustomStudy(cmd.study);
			updateStudyButtons();
		} else if (cmd.type === 'toggle-theme') {
			const next = currentTheme === 'dark' ? 'light' : 'dark';
			applyShellTheme(next);
			chartManager.setTheme(next);
		} else if (cmd.type === 'create-alert') {
			alertsPanel.openCreateAlertModal(chartManager.getActiveSymbol());
		} else if (cmd.type === 'bottom-tab') {
			bottomPanel.openTab(cmd.tab);
		}
	},
});

document.getElementById('btn-quick-search').addEventListener('click', () => commandPalette.open());

// Global Hotkeys
window.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
		e.preventDefault();
		commandPalette.open();
		return;
	}
	if (e.key === 'Escape') {
		closeModal();
		document.querySelectorAll('.tv-menu.is-open').forEach((m) => m.classList.remove('is-open'));
		return;
	}
	if (e.altKey) {
		const k = e.key.toLowerCase();
		if (k === 'a') {
			e.preventDefault();
			alertsPanel.openCreateAlertModal(chartManager.getActiveSymbol());
		} else if (k === 't') {
			e.preventDefault();
			bottomPanel.openTab('trading');
		} else if (['1', '2', '3', '4'].includes(k)) {
			e.preventDefault();
			const map = { '1': '1', '2': '2h', '3': '2v', '4': '4' };
			chartManager.setLayout(map[k]);
			refreshLayoutMenuUI();
		}
	}
});

// Boot Charts
chartManager.init();
