import { ChartManager } from './chart/chartManager.js';
import { createAlertsPanel } from './components/alertsPanel.js';
import { createBottomPanel } from './components/bottomPanel.js';
import { createCommandPalette } from './components/commandPalette.js';
import { createObjectTreePanel } from './components/objectTreePanel.js';
import { createOrderBookPanel } from './components/orderBookPanel.js';
import { createTickerTape } from './components/tickerTape.js';
import { escapeHtml, getCoinAvatarHtml, showToast } from './components/toast.js';
import { createWatchlistPanel } from './components/watchlistPanel.js';
import { formatDisplaySymbol, formatPriceForSymbol } from './services/binanceApi.js';
import { marketHub } from './services/marketHub.js';
import { replayController } from './services/replayController.js';
import { storage } from './services/storage.js';

const ALL_TIMEFRAMES = [
	{ group: 'Minutes', items: [{ label: '1 minute', value: '1', short: '1m' }, { label: '3 minutes', value: '3', short: '3m' }, { label: '5 minutes', value: '5', short: '5m' }, { label: '15 minutes', value: '15', short: '15m' }, { label: '30 minutes', value: '30', short: '30m' }] },
	{ group: 'Hours', items: [{ label: '1 hour', value: '60', short: '1h' }, { label: '2 hours', value: '120', short: '2h' }, { label: '4 hours', value: '240', short: '4h' }, { label: '12 hours', value: '720', short: '12h' }] },
	{ group: 'Days / Weeks', items: [{ label: '1 day', value: '1D', short: '1D' }, { label: '3 days', value: '3D', short: '3D' }, { label: '1 week', value: '1W', short: '1W' }, { label: '1 month', value: '1M', short: '1M' }] },
];

const TF_SHORT_MAP = new Map(ALL_TIMEFRAMES.flatMap((g) => g.items.map((it) => [it.value, it.short])));

// Modal controller
const modalBackdrop = document.getElementById('tv-modal-backdrop');
const modalTitle = document.getElementById('tv-modal-title');
const modalBody = document.getElementById('tv-modal-body');

function openModal(title, contentNode) {
	modalTitle.textContent = title;
	modalBody.innerHTML = '';
	if (typeof contentNode === 'string') modalBody.innerHTML = contentNode;
	else if (contentNode) modalBody.appendChild(contentNode);
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

// Dropdown controller
function setupDropdown(btnId, menuId, onOpen) {
	const btn = document.getElementById(btnId);
	const menu = document.getElementById(menuId);
	if (!btn || !menu) return;
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
const chkDarkTheme = document.getElementById('chk-dark-theme');
const hdrLocaleVal = document.getElementById('hdr-locale-val');

function applyShellTheme(theme) {
	currentTheme = theme === 'light' ? 'light' : 'dark';
	document.documentElement.setAttribute('data-theme', currentTheme);
	if (chkDarkTheme) chkDarkTheme.checked = currentTheme === 'dark';
}
applyShellTheme(currentTheme);

if (hdrLocaleVal) {
	hdrLocaleVal.textContent = `${currentLocale === 'pt' ? 'Português' : 'English'} ›`;
}

// Initialize Core Services
const chartManager = new ChartManager(document.getElementById('charts-grid'));
marketHub.start();

// Header Symbol & Live Price
const hdrSymbolAvatarEl = document.getElementById('hdr-symbol-avatar');
const hdrSymbolEl = document.getElementById('hdr-active-symbol');
const hdrPriceEl = document.getElementById('hdr-active-price');
const hdrChgEl = document.getElementById('hdr-active-chg');
const wsStatusDot = document.getElementById('ws-status-dot');
const wsStatusLabel = document.getElementById('ws-status-label');

// Floating Buy / Sell Overlay
const buysellOverlayEl = document.getElementById('tv-buysell-overlay');
const ovSellBtn = document.getElementById('ov-sell-btn');
const ovBuyBtn = document.getElementById('ov-buy-btn');
const ovSellPxEl = document.getElementById('ov-sell-px');
const ovBuyPxEl = document.getElementById('ov-buy-px');
const ovQtyInput = document.getElementById('ov-qty-input');
const chkBuySell = document.getElementById('chk-buysell-buttons');
let showBuySell = storage.getShowBuySell();

function applyBuySellVisibility() {
	buysellOverlayEl.classList.toggle('is-hidden', !showBuySell);
	if (chkBuySell) chkBuySell.checked = showBuySell;
}
applyBuySellVisibility();

let lastAvatarSym = null;
function updateHeaderQuote() {
	const sym = chartManager.getActiveSymbol();
	hdrSymbolEl.textContent = formatDisplaySymbol(sym);
	if (lastAvatarSym !== sym) {
		lastAvatarSym = sym;
		hdrSymbolAvatarEl.innerHTML = getCoinAvatarHtml(sym, 18);
	}
	const t = marketHub.getTicker(sym);
	if (t) {
		const pxStr = formatPriceForSymbol(t.last, sym);
		hdrPriceEl.textContent = pxStr;
		const sign = t.chgPct >= 0 ? '+' : '';
		hdrChgEl.textContent = `${sign}${t.chgPct.toFixed(2)}%`;
		hdrChgEl.className = t.chgPct > 0 ? 'is-up' : t.chgPct < 0 ? 'is-down' : 'is-neutral';
		ovSellPxEl.textContent = pxStr;
		ovBuyPxEl.textContent = pxStr;
	} else {
		hdrPriceEl.textContent = '--';
		hdrChgEl.textContent = '--';
		hdrChgEl.className = 'is-neutral';
		ovSellPxEl.textContent = '--';
		ovBuyPxEl.textContent = '--';
	}
}

marketHub.onStatus((st) => {
	wsStatusDot.className = `tv-brand-dot ${st === 'connected' ? '' : st === 'reconnecting' ? 'is-reconnecting' : 'is-offline'}`;
	wsStatusDot.title = `Binance Futures Stream: ${st}`;
	if (wsStatusLabel) {
		wsStatusLabel.textContent = st === 'connected' ? 'Live' : st === 'reconnecting' ? 'Syncing' : 'Offline';
	}
});

// Ticker Tape
const tickerTape = createTickerTape(document.getElementById('tv-ticker-tape'), (sym) => {
	chartManager.setSymbol(sym);
});
const chkTickerTape = document.getElementById('chk-ticker-tape');
if (chkTickerTape) chkTickerTape.checked = tickerTape.isVisible();

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
	onPriceClick: (px, side) => {
		bottomPanel.prefillLimitOrder({ symbol: chartManager.getActiveSymbol(), side, price: px });
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

// Chart Context Menu & Interactive Line Callbacks
chartManager.setContextHandlers({
	onAddAlert: (sym, price) => alertsPanel.openCreateAlertModal(sym, price),
	onQuickLimit: (sym, side, price) => bottomPanel.prefillLimitOrder({ symbol: sym, side, price }),
});

chartManager.setLineHandlers({
	onMoveAlert: (id, price) => alertsPanel.updateAlertPrice(id, price),
	onCancelAlert: (id) => alertsPanel.deleteAlert(id),
	onClosePosition: (id) => bottomPanel.closePosition(id),
	onReversePosition: (id) => bottomPanel.reversePosition(id),
	onMoveTpSl: (id, field, price) => bottomPanel.updatePositionTpSl(id, field, price),
	onMoveOrder: (id, price) => bottomPanel.updateLimitOrderPrice(id, price),
	onCancelOrder: (id) => bottomPanel.cancelLimitOrder(id),
});

// Floating On-Chart Buy / Sell Buttons
ovSellBtn.addEventListener('click', () => {
	bottomPanel.quickMarketOrder('SHORT', parseFloat(ovQtyInput.value) || 250);
});
ovBuyBtn.addEventListener('click', () => {
	bottomPanel.quickMarketOrder('LONG', parseFloat(ovQtyInput.value) || 250);
});

// Timeframe Strip & Dropdown
let favIntervals = storage.getFavoriteIntervals();
const tfStripEl = document.getElementById('tv-tf-strip');
const tfMenuEl = document.getElementById('menu-tf');

function renderTimeframeStrip() {
	const activeRes = chartManager.getActiveInterval();
	const list = [...favIntervals];
	if (!list.includes(activeRes)) list.push(activeRes);

	tfStripEl.innerHTML = list.map((val) => {
		const label = TF_SHORT_MAP.get(val) || val;
		return `<button class="tv-tf-btn ${val === activeRes ? 'is-active' : ''}" data-tf-val="${val}">${escapeHtml(label)}</button>`;
	}).join('');

	tfStripEl.querySelectorAll('[data-tf-val]').forEach((btn) => {
		btn.addEventListener('click', () => {
			chartManager.setInterval(btn.dataset.tfVal);
		});
	});
}

function renderTimeframeMenu() {
	const activeRes = chartManager.getActiveInterval();
	tfMenuEl.innerHTML = ALL_TIMEFRAMES.map((grp, idx) => `
		${idx > 0 ? '<div class="tv-menu-divider"></div>' : ''}
		<div class="tv-menu-title">${grp.group}</div>
		${grp.items.map((it) => {
			const isFav = favIntervals.includes(it.value);
			return `
				<div class="tv-tf-grid">
					<button class="tv-menu-item ${it.value === activeRes ? 'is-selected' : ''}" data-pick-tf="${it.value}">
						<span>${it.label}</span>
						<span class="tv-menu-hint">${it.short}</span>
					</button>
					<button class="tv-tf-star ${isFav ? 'is-fav' : ''}" data-star-tf="${it.value}" title="Toggle favorite">&#9733;</button>
				</div>
			`;
		}).join('')}
	`).join('');

	tfMenuEl.querySelectorAll('[data-pick-tf]').forEach((b) => {
		b.addEventListener('click', () => {
			chartManager.setInterval(b.dataset.pickTf);
			tfMenuEl.classList.remove('is-open');
		});
	});

	tfMenuEl.querySelectorAll('[data-star-tf]').forEach((b) => {
		b.addEventListener('click', (e) => {
			e.stopPropagation();
			const val = b.dataset.starTf;
			if (favIntervals.includes(val)) {
				if (favIntervals.length > 1) favIntervals = favIntervals.filter((x) => x !== val);
			} else {
				favIntervals = [...favIntervals, val];
			}
			storage.setFavoriteIntervals(favIntervals);
			renderTimeframeStrip();
			renderTimeframeMenu();
		});
	});
}

setupDropdown('btn-tf-more', 'menu-tf', renderTimeframeMenu);
renderTimeframeStrip();

// Chart Type Dropdown
setupDropdown('btn-chart-type', 'menu-chart-type', () => {
	const curr = String(chartManager.getChartType());
	document.querySelectorAll('[data-chart-type]').forEach((b) => {
		b.classList.toggle('is-selected', b.dataset.chartType === curr);
	});
});
document.querySelectorAll('[data-chart-type]').forEach((btn) => {
	btn.addEventListener('click', () => {
		chartManager.setChartType(Number(btn.dataset.chartType));
		document.getElementById('menu-chart-type').classList.remove('is-open');
	});
});

// Indicators & Futures Studies Menu
function updateStudyMenuMarks() {
	const activeStudies = chartManager.getActiveCustomStudySet();
	document.querySelectorAll('[data-study]').forEach((btn) => {
		const has = activeStudies.has(btn.dataset.study);
		btn.classList.toggle('is-selected', has);
		const chk = btn.querySelector('.tv-study-check');
		if (chk) chk.textContent = has ? '✓' : '';
	});
}

document.getElementById('btn-indicators').addEventListener('click', () => {
	chartManager.executeAction('insertIndicator');
});

setupDropdown('btn-indicators-menu', 'menu-indicators', updateStudyMenuMarks);

document.querySelectorAll('[data-study]').forEach((btn) => {
	btn.addEventListener('click', async () => {
		await chartManager.toggleCustomStudy(btn.dataset.study);
		updateStudyMenuMarks();
	});
});

document.querySelectorAll('[data-study-pack]').forEach((btn) => {
	btn.addEventListener('click', async () => {
		await chartManager.applyStudyPack(btn.dataset.studyPack);
		document.getElementById('menu-indicators').classList.remove('is-open');
		showToast({ title: 'Indicators Updated' });
	});
});

// Undo / Redo Buttons
const undoBtn = document.getElementById('btn-undo');
const redoBtn = document.getElementById('btn-redo');

function refreshUndoRedo() {
	const st = chartManager.getUndoRedoState();
	undoBtn.disabled = !st.enableUndo;
	redoBtn.disabled = !st.enableRedo;
}

undoBtn.addEventListener('click', () => chartManager.executeAction('undo'));
redoBtn.addEventListener('click', () => chartManager.executeAction('redo'));

// Main Menu (Hamburger)
setupDropdown('btn-main-menu', 'menu-main', () => {
	if (chkDarkTheme) chkDarkTheme.checked = currentTheme === 'dark';
	const chkDraw = document.getElementById('chk-drawings-panel');
	if (chkDraw) chkDraw.checked = chartManager.isDrawingsPanelVisible();
	if (chkBuySell) chkBuySell.checked = showBuySell;
	if (chkTickerTape) chkTickerTape.checked = tickerTape.isVisible();
});

chkDarkTheme?.addEventListener('change', () => {
	const next = chkDarkTheme.checked ? 'dark' : 'light';
	applyShellTheme(next);
	chartManager.setTheme(next);
});

document.getElementById('chk-drawings-panel')?.addEventListener('change', () => {
	chartManager.toggleDrawingsPanel();
});

chkBuySell?.addEventListener('change', () => {
	showBuySell = chkBuySell.checked;
	storage.setShowBuySell(showBuySell);
	applyBuySellVisibility();
});

chkTickerTape?.addEventListener('change', () => {
	tickerTape.setVisible(chkTickerTape.checked);
});

document.getElementById('btn-locale-toggle').addEventListener('click', () => {
	currentLocale = currentLocale === 'pt' ? 'en' : 'pt';
	if (hdrLocaleVal) hdrLocaleVal.textContent = `${currentLocale === 'pt' ? 'Português' : 'English'} ›`;
	chartManager.setLocale(currentLocale);
	document.getElementById('menu-main').classList.remove('is-open');
	showToast({ title: 'Language Switched', message: currentLocale === 'pt' ? 'Português' : 'English' });
});

function openShortcutsModal() {
	openModal('Keyboard Shortcuts', `
		<div style="display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:12px;">
			<span>Quick Search (Symbols, Timeframes, Actions)</span><strong>Ctrl + K</strong>
			<span>Step Next / Previous Watchlist Symbol</span><strong>Space / Alt+Up/Down</strong>
			<span>Create Price Alert</span><strong>Alt + A</strong>
			<span>Toggle Paper Trading Drawer</span><strong>Alt + T</strong>
			<span>Start / Exit Bar Replay</span><strong>Alt + R</strong>
			<span>Switch Layout (1x1, 2H, 2V, 1+2, 2x2)</span><strong>Alt + 1 .. 5</strong>
			<span>Keyboard Shortcuts Help</span><strong>Ctrl + /</strong>
			<span>Close Modal / Menu</span><strong>Esc</strong>
		</div>
	`);
}

document.getElementById('btn-menu-shortcuts')?.addEventListener('click', () => {
	document.getElementById('menu-main').classList.remove('is-open');
	openShortcutsModal();
});
document.getElementById('rail-btn-shortcuts').addEventListener('click', openShortcutsModal);

// Bar Replay Toolbar & Flow
const replayBtn = document.getElementById('btn-replay');
const replayBarEl = document.getElementById('tv-replay-bar');
const rpStatusEl = document.getElementById('rp-status');
const rpPlayBtn = document.getElementById('rp-play');
const rpSpeedEl = document.getElementById('rp-speed');

function syncReplayBar(st) {
	replayBtn.classList.toggle('is-active', st.active || st.selecting);
	if (!st.active) {
		replayBarEl.style.display = 'none';
		return;
	}
	replayBarEl.style.display = 'flex';
	rpStatusEl.textContent = `Replay · ${formatDisplaySymbol(st.symbol)} (${st.remaining} bars left)`;
	rpPlayBtn.innerHTML = st.playing ? '&#10074;&#10074;' : '&#9654;';
	rpSpeedEl.value = String(st.speedMs);
}

replayController.onChange(syncReplayBar);

async function triggerReplayFlow() {
	if (replayController.selecting) {
		chartManager.cancelReplaySelection();
		return;
	}
	if (replayController.active) {
		chartManager.exitReplay();
		showToast({ title: 'Bar Replay', message: 'Returned to live market.' });
		return;
	}
	showToast({ title: 'Bar Replay', message: 'Click any candle on the chart to start replay from that bar.', duration: 5000 });
	const res = await chartManager.beginReplaySelection();
	if (res.ok) {
		showToast({ title: 'Replay Started', message: `${res.count} bars queued ahead.`, tone: 'up' });
	}
}

replayBtn.addEventListener('click', triggerReplayFlow);
document.getElementById('rp-jump').addEventListener('click', async () => {
	showToast({ title: 'Jump to Bar', message: 'Click a candle on the chart.' });
	await chartManager.beginReplaySelection();
});
rpPlayBtn.addEventListener('click', () => replayController.togglePlay());
document.getElementById('rp-step').addEventListener('click', () => replayController.stepForward());
rpSpeedEl.addEventListener('change', () => replayController.setSpeed(rpSpeedEl.value));
document.getElementById('rp-exit').addEventListener('click', () => {
	chartManager.exitReplay();
	showToast({ title: 'Bar Replay Exited' });
});

// Chart Events Wiring
chartManager.on('active-symbol-changed', (sym) => {
	updateHeaderQuote();
	watchlistPanel.onActiveSymbolChanged(sym);
	orderBookPanel.onActiveSymbolChanged(sym);
	bottomPanel.onActiveSymbolChanged(sym);
	syncChartOverlays();
});

chartManager.on('active-interval-changed', () => {
	renderTimeframeStrip();
});

chartManager.on('active-chart-type-changed', (style) => {
	document.querySelectorAll('[data-chart-type]').forEach((b) => {
		b.classList.toggle('is-selected', Number(b.dataset.chartType) === Number(style));
	});
});

chartManager.on('active-chart-ready', () => {
	updateHeaderQuote();
	renderTimeframeStrip();
	updateStudyMenuMarks();
	refreshUndoRedo();
	syncChartOverlays();
});

chartManager.on('objects-changed', () => {
	updateStudyMenuMarks();
	refreshUndoRedo();
});

chartManager.on('undo-redo-changed', refreshUndoRedo);
marketHub.onUpdate(updateHeaderQuote);

// Top Bar Direct Actions
document.getElementById('btn-compare').addEventListener('click', () => chartManager.executeAction('compareOrAdd'));
document.getElementById('btn-new-alert').addEventListener('click', () => alertsPanel.openCreateAlertModal(chartManager.getActiveSymbol()));
document.getElementById('btn-chart-settings').addEventListener('click', () => chartManager.executeAction('chartProperties'));
document.getElementById('btn-trade-pill').addEventListener('click', () => {
	bottomPanel.toggleTab('trading');
	document.getElementById('btn-trade-pill').classList.toggle('is-active', bottomPanel.isOpen());
});

// Layout Switcher Menu
const layoutLabelMap = { '1': '1x1', '2h': '2H', '2v': '2V', '3': '1+2', '4': '2x2' };
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

// Save / Load / Export / Import Layouts
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

document.getElementById('btn-save-quick').addEventListener('click', () => {
	chartManager.saveAllPanesState(() => {
		showToast({ title: 'Chart Saved', message: formatDisplaySymbol(chartManager.getActiveSymbol()), tone: 'up' });
	});
});

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

const importInput = document.getElementById('file-import-layout');
document.getElementById('btn-import-layout').addEventListener('click', () => {
	document.getElementById('menu-saveload').classList.remove('is-open');
	importInput.click();
});
importInput.addEventListener('change', async () => {
	const file = importInput.files?.[0];
	importInput.value = '';
	if (!file) return;
	try {
		const parsed = JSON.parse(await file.text());
		if (chartManager.importLayoutJson(parsed)) {
			refreshLayoutMenuUI();
			showToast({ title: 'Layout Imported', tone: 'up' });
		} else {
			showToast({ title: 'Invalid Layout JSON', tone: 'down' });
		}
	} catch {
		showToast({ title: 'Failed to Parse JSON', tone: 'down' });
	}
});

// Snapshot & Fullscreen
document.getElementById('btn-snapshot').addEventListener('click', async () => {
	const dataUrl = await chartManager.takeScreenshot();
	if (dataUrl) {
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = `${chartManager.getActiveSymbol()}-${Date.now()}.png`;
		a.click();
		try {
			const res = await fetch(dataUrl);
			const blob = await res.blob();
			await navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': blob })]);
		} catch { /* clipboard optional */ }
		showToast({ title: 'Snapshot Saved', message: `${formatDisplaySymbol(chartManager.getActiveSymbol())}.png`, tone: 'up' });
	}
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
	if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
	else document.exitFullscreen?.();
});

// Rail quick actions
document.getElementById('rail-btn-screener').addEventListener('click', () => bottomPanel.openTab('screener'));
document.getElementById('rail-btn-paper').addEventListener('click', () => bottomPanel.openTab('trading'));

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
			updateStudyMenuMarks();
		} else if (cmd.type === 'study-pack') {
			await chartManager.applyStudyPack(cmd.pack);
		} else if (cmd.type === 'toggle-theme') {
			const next = currentTheme === 'dark' ? 'light' : 'dark';
			applyShellTheme(next);
			chartManager.setTheme(next);
		} else if (cmd.type === 'create-alert') {
			alertsPanel.openCreateAlertModal(chartManager.getActiveSymbol());
		} else if (cmd.type === 'bottom-tab') {
			bottomPanel.openTab(cmd.tab);
		} else if (cmd.type === 'replay') {
			triggerReplayFlow();
		}
	},
});

document.getElementById('btn-quick-search').addEventListener('click', () => commandPalette.open());
document.getElementById('btn-search-icon').addEventListener('click', () => commandPalette.open());

// Global Hotkeys
window.addEventListener('keydown', (e) => {
	const tag = e.target?.tagName;
	const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;

	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
		e.preventDefault();
		commandPalette.open();
		return;
	}
	if ((e.ctrlKey || e.metaKey) && e.key === '/') {
		e.preventDefault();
		openShortcutsModal();
		return;
	}
	if (e.key === 'Escape') {
		closeModal();
		document.querySelectorAll('.tv-menu.is-open').forEach((m) => m.classList.remove('is-open'));
		if (replayController.selecting) chartManager.cancelReplaySelection();
		return;
	}
	if (e.altKey) {
		const k = e.key.toLowerCase();
		if (k === 'a') {
			e.preventDefault();
			alertsPanel.openCreateAlertModal(chartManager.getActiveSymbol());
		} else if (k === 't') {
			e.preventDefault();
			bottomPanel.toggleTab('trading');
		} else if (k === 'r') {
			e.preventDefault();
			triggerReplayFlow();
		} else if (k === 'arrowdown') {
			e.preventDefault();
			watchlistPanel.stepSymbol(1);
		} else if (k === 'arrowup') {
			e.preventDefault();
			watchlistPanel.stepSymbol(-1);
		} else if (['1', '2', '3', '4', '5'].includes(k)) {
			e.preventDefault();
			const map = { '1': '1', '2': '2h', '3': '2v', '4': '3', '5': '4' };
			chartManager.setLayout(map[k]);
			refreshLayoutMenuUI();
		}
		return;
	}
	if (!inInput && !e.ctrlKey && !e.metaKey && e.code === 'Space') {
		e.preventDefault();
		watchlistPanel.stepSymbol(1);
	}
});

// Boot Charts
chartManager.init();
