import Datafeed from '../services/datafeed.js';
import {
	formatDisplaySymbol,
	formatPriceForSymbol,
	getKlines,
	normalizeSymbol,
	resolutionToBinance,
} from '../services/binanceApi.js';
import { replayController } from '../services/replayController.js';
import { storage } from '../services/storage.js';
import { getCustomIndicators } from './customIndicators.js';

function getThemeOverrides(theme) {
	const dark = theme === 'dark';
	return {
		'paneProperties.background': dark ? '#000000' : '#FFFFFF',
		'paneProperties.backgroundType': 'solid',
		'paneProperties.vertGridProperties.color': dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(42, 46, 57, 0.06)',
		'paneProperties.horzGridProperties.color': dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(42, 46, 57, 0.06)',
		'scalesProperties.backgroundColor': dark ? '#000000' : '#FFFFFF',
		'scalesProperties.textColor': dark ? '#8C8C8C' : '#6A6D78',
		'scalesProperties.lineColor': dark ? '#2E2E2E' : '#E0E3EB',
		'crossHairProperties.color': dark ? '#758696' : '#9598A1',
		'mainSeriesProperties.candleStyle.upColor': '#089981',
		'mainSeriesProperties.candleStyle.downColor': '#F23645',
		'mainSeriesProperties.candleStyle.borderUpColor': '#089981',
		'mainSeriesProperties.candleStyle.borderDownColor': '#F23645',
		'mainSeriesProperties.candleStyle.wickUpColor': '#089981',
		'mainSeriesProperties.candleStyle.wickDownColor': '#F23645',
		'mainSeriesProperties.hollowCandleStyle.upColor': '#089981',
		'mainSeriesProperties.hollowCandleStyle.downColor': '#F23645',
		'mainSeriesProperties.hollowCandleStyle.borderUpColor': '#089981',
		'mainSeriesProperties.hollowCandleStyle.borderDownColor': '#F23645',
		'mainSeriesProperties.barStyle.upColor': '#089981',
		'mainSeriesProperties.barStyle.downColor': '#F23645',
		'mainSeriesProperties.showCountdown': true,
		'symbolWatermarkProperties.transparency': 92,
	};
}

const STUDIES_OVERRIDES = {
	'volume.volume.color.0': 'rgba(242, 54, 69, 0.5)',
	'volume.volume.color.1': 'rgba(8, 153, 129, 0.5)',
	'volume.volume.transparency': 50,
};

const LAYOUT_PANE_COUNT = {
	'1': 1,
	'2h': 2,
	'2v': 2,
	'3': 3,
	'4': 4,
};

export class ChartManager {
	constructor(gridEl) {
		this.gridEl = gridEl;
		this.theme = storage.getTheme();
		this.locale = storage.getLocale();
		this.layoutType = storage.getLayoutType();
		this.sync = storage.getSync();
		this.panesState = storage.getPanes();
		this.activePaneIndex = 0;
		this.instances = [];
		this.listeners = new Map();
		this._syncLock = false;
		this._contextHandlers = {};
		this._lineHandlers = {};
		this._lastLinesArgs = { alerts: [], positions: [], orders: [] };

		// Optional URL override (?symbol=ETHUSDT&interval=15)
		try {
			const params = new URLSearchParams(window.location.search);
			const urlSym = params.get('symbol');
			const urlInt = params.get('interval');
			if (urlSym) {
				this.panesState[0].symbol = normalizeSymbol(urlSym);
				this.panesState[0].savedState = null;
			}
			if (urlInt) {
				this.panesState[0].interval = urlInt;
			}
			if (urlSym || urlInt) {
				this.persistPanes();
			}
		} catch {
			// ignore query parse errors
		}
	}

	on(event, cb) {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event).add(cb);
		return () => this.listeners.get(event).delete(cb);
	}

	emit(event, detail) {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const cb of set) {
			try { cb(detail); } catch (err) { console.error(err); }
		}
	}

	setContextHandlers(handlers) {
		this._contextHandlers = handlers || {};
	}

	setLineHandlers(handlers) {
		this._lineHandlers = handlers || {};
	}

	init() {
		this.renderLayout();
	}

	getActivePane() {
		return this.instances[this.activePaneIndex] || this.instances[0] || null;
	}

	getActiveSymbol() {
		const state = this.panesState[this.activePaneIndex] || this.panesState[0];
		return normalizeSymbol(state?.symbol || 'BTCUSDT');
	}

	getActiveInterval() {
		const state = this.panesState[this.activePaneIndex] || this.panesState[0];
		return state?.interval || '5';
	}

	setLayout(type) {
		if (!LAYOUT_PANE_COUNT[type]) return;
		this.saveAllPanesState(() => {
			this.layoutType = type;
			storage.setLayoutType(type);
			if (this.activePaneIndex >= LAYOUT_PANE_COUNT[type]) {
				this.activePaneIndex = 0;
			}
			this.renderLayout();
			this.emit('layout-changed', type);
		});
	}

	renderLayout() {
		this.destroyInstances();
		this.gridEl.setAttribute('data-layout', this.layoutType);
		this.gridEl.innerHTML = '';

		const count = LAYOUT_PANE_COUNT[this.layoutType] || 1;
		for (let i = 0; i < count; i++) {
			const paneEl = document.createElement('div');
			paneEl.className = `tv-chart-pane${i === this.activePaneIndex ? ' is-active' : ''}`;
			paneEl.dataset.paneIndex = String(i);

			const badgeEl = document.createElement('div');
			badgeEl.className = 'tv-chart-pane-badge';
			const st = this.panesState[i] || { symbol: 'BTCUSDT', interval: '5' };
			badgeEl.textContent = `${formatDisplaySymbol(st.symbol)} · ${st.interval}`;

			const mountEl = document.createElement('div');
			mountEl.className = 'tv-chart-pane-mount';

			paneEl.appendChild(badgeEl);
			paneEl.appendChild(mountEl);
			this.gridEl.appendChild(paneEl);

			paneEl.addEventListener('pointerdown', () => this.setActivePane(i));

			const instance = {
				index: i,
				paneEl,
				badgeEl,
				mountEl,
				widget: null,
				ready: false,
				lines: [],
			};
			this.instances.push(instance);
			this.mountWidget(instance, st);
		}
	}

	destroyInstances() {
		for (const inst of this.instances) {
			if (inst.widget) {
				try { inst.widget.remove(); } catch { /* ignore */ }
			}
		}
		this.instances = [];
	}

	mountWidget(instance, paneState) {
		const isDark = this.theme === 'dark';
		const symbol = formatDisplaySymbol(paneState.symbol || 'BTCUSDT');
		const interval = paneState.interval || '5';

		const options = {
			symbol,
			interval,
			autosize: true,
			container: instance.mountEl,
			datafeed: Datafeed,
			library_path: '/tv/charting_library_clonned_data/charting_library/',
			custom_css_url: '/tv/src/styles/tv-iframe-theme.css',
			locale: this.locale,
			timezone: 'America/Sao_Paulo',
			theme: isDark ? 'Dark' : 'Light',
			loading_screen: {
				backgroundColor: isDark ? '#000000' : '#FFFFFF',
				foregroundColor: '#2962FF',
			},
			overrides: getThemeOverrides(this.theme),
			studies_overrides: STUDIES_OVERRIDES,
			time_frames: [
				{ text: '5y', resolution: '1W', title: '5 Years' },
				{ text: '1y', resolution: '1D', title: '1 Year' },
				{ text: '6m', resolution: '240', title: '6 Months' },
				{ text: '3m', resolution: '60', title: '3 Months' },
				{ text: '1m', resolution: '30', title: '1 Month' },
				{ text: '5d', resolution: '5', title: '5 Days' },
				{ text: '1d', resolution: '1', title: '1 Day' },
			],
			favorites: {
				intervals: ['1', '5', '15', '60', '240', '1D'],
				chartTypes: ['Candles', 'Heikin Ashi', 'Line', 'Area'],
			},
			enabled_features: [
				'use_localstorage_for_settings',
				'save_chart_properties_to_local_storage',
				'side_toolbar_in_fullscreen_mode',
				'show_interval_dialog_on_key_press',
				'create_volume_indicator_by_default',
				'items_favoriting',
				'go_to_date',
				'chart_crosshair_menu',
				'move_logo_to_main_pane',
				'cropped_tick_marks',
			],
			disabled_features: [
				'header_widget',
				'header_saveload',
				'study_templates',
				'border_around_the_chart',
			],
			auto_save_delay: 2,
			custom_indicators_getter: getCustomIndicators,
		};

		if (paneState.savedState && typeof paneState.savedState === 'object') {
			options.saved_data = paneState.savedState;
		}

		let widget;
		try {
			widget = new window.TradingView.widget(options);
		} catch (err) {
			console.warn('[chartManager] saved_data fallback:', err);
			delete options.saved_data;
			widget = new window.TradingView.widget(options);
		}
		instance.widget = widget;

		widget.onChartReady(() => {
			instance.ready = true;
			const expectedTvTheme = this.theme === 'dark' ? 'Dark' : 'Light';
			try {
				if (typeof widget.getTheme === 'function' && widget.getTheme() !== expectedTvTheme) {
					widget.changeTheme(expectedTvTheme, { disableUndo: true });
					setTimeout(() => {
						try { widget.applyOverrides(getThemeOverrides(this.theme)); } catch { /* ignore */ }
					}, 250);
				}
			} catch { /* ignore */ }
			const chart = widget.activeChart();

			chart.onSymbolChanged().subscribe(null, () => {
				if (this._syncLock) return;
				const info = chart.symbol();
				const clean = normalizeSymbol(info);
				this.panesState[instance.index].symbol = clean;
				instance.badgeEl.textContent = `${formatDisplaySymbol(clean)} · ${chart.resolution()}`;
				this.persistPanes();

				if (this.sync.symbol) {
					this.syncOtherPanesSymbol(instance.index, clean);
				}
				if (instance.index === this.activePaneIndex) {
					this.emit('active-symbol-changed', clean);
				}
				this.emit('objects-changed');
			});

			chart.onIntervalChanged().subscribe(null, (newRes) => {
				if (this._syncLock) return;
				this.panesState[instance.index].interval = newRes;
				instance.badgeEl.textContent = `${formatDisplaySymbol(this.panesState[instance.index].symbol)} · ${newRes}`;
				this.persistPanes();

				if (this.sync.interval) {
					this.syncOtherPanesInterval(instance.index, newRes);
				}
				if (instance.index === this.activePaneIndex) {
					this.emit('active-interval-changed', newRes);
				}
			});

			try {
				chart.onChartTypeChanged().subscribe(null, (chartType) => {
					if (instance.index === this.activePaneIndex) {
						this.emit('active-chart-type-changed', chartType);
					}
				});
			} catch { /* ignore */ }

			try {
				chart.crossHairMoved((params) => {
					if (instance.index === this.activePaneIndex) {
						this.emit('crosshair-moved', params);
					}
				});
			} catch { /* ignore */ }

			try {
				widget.onContextMenu((unixTime, price) => {
					if (!Number.isFinite(price)) return [];
					const sym = normalizeSymbol(chart.symbol());
					const disp = formatDisplaySymbol(sym);
					const pxStr = formatPriceForSymbol(price, sym);
					return [
						{
							position: 'top',
							text: `Add Alert on ${disp} @ ${pxStr}`,
							click: () => this._contextHandlers.onAddAlert?.(sym, price),
						},
						{
							position: 'top',
							text: `Buy Limit ${disp} @ ${pxStr}`,
							click: () => this._contextHandlers.onQuickLimit?.(sym, 'LONG', price),
						},
						{
							position: 'top',
							text: `Sell Limit ${disp} @ ${pxStr}`,
							click: () => this._contextHandlers.onQuickLimit?.(sym, 'SHORT', price),
						},
					];
				});
			} catch { /* ignore */ }

			widget.subscribe('onAutoSaveNeeded', () => {
				this.savePaneSnapshot(instance.index);
				this.emit('undo-redo-changed');
			});

			widget.subscribe('study', () => {
				this.emit('objects-changed');
				this.emit('undo-redo-changed');
			});
			widget.subscribe('drawing', () => {
				this.emit('objects-changed');
				this.emit('undo-redo-changed');
			});
			widget.subscribe('undo_redo_state_changed', () => {
				this.emit('undo-redo-changed');
			});

			if (instance.index === this.activePaneIndex) {
				this.emit('active-chart-ready', instance);
				this.emit('active-symbol-changed', this.getActiveSymbol());
				this.emit('active-interval-changed', this.getActiveInterval());
				this.emit('active-chart-type-changed', this.getChartType());
				this.emit('objects-changed');
				this.emit('undo-redo-changed');
			}
		});
	}

	setActivePane(index) {
		if (index === this.activePaneIndex || !this.instances[index]) return;
		this.activePaneIndex = index;
		for (const inst of this.instances) {
			inst.paneEl.classList.toggle('is-active', inst.index === index);
		}
		this.emit('active-symbol-changed', this.getActiveSymbol());
		this.emit('active-interval-changed', this.getActiveInterval());
		this.emit('active-chart-type-changed', this.getChartType());
		this.emit('active-chart-ready', this.getActivePane());
		this.emit('objects-changed');
		this.emit('undo-redo-changed');
	}

	syncOtherPanesSymbol(sourceIdx, symbol) {
		this._syncLock = true;
		try {
			const disp = formatDisplaySymbol(symbol);
			for (const inst of this.instances) {
				if (inst.index === sourceIdx || !inst.ready) continue;
				const ch = inst.widget.activeChart();
				if (normalizeSymbol(ch.symbol()) !== symbol) {
					ch.setSymbol(disp);
					this.panesState[inst.index].symbol = symbol;
					inst.badgeEl.textContent = `${disp} · ${ch.resolution()}`;
				}
			}
			this.persistPanes();
		} finally {
			setTimeout(() => { this._syncLock = false; }, 100);
		}
	}

	syncOtherPanesInterval(sourceIdx, res) {
		this._syncLock = true;
		try {
			for (const inst of this.instances) {
				if (inst.index === sourceIdx || !inst.ready) continue;
				const ch = inst.widget.activeChart();
				if (ch.resolution() !== res) {
					ch.setResolution(res);
					this.panesState[inst.index].interval = res;
					inst.badgeEl.textContent = `${formatDisplaySymbol(this.panesState[inst.index].symbol)} · ${res}`;
				}
			}
			this.persistPanes();
		} finally {
			setTimeout(() => { this._syncLock = false; }, 100);
		}
	}

	setSymbol(rawSymbol, paneIndex = this.activePaneIndex) {
		const clean = normalizeSymbol(rawSymbol);
		const disp = formatDisplaySymbol(clean);
		const inst = this.instances[paneIndex];
		if (!inst) return;
		if (replayController.active && replayController.symbol !== clean) {
			replayController.stop();
		}
		this.panesState[paneIndex].symbol = clean;
		inst.badgeEl.textContent = `${disp} · ${this.panesState[paneIndex].interval}`;
		this.persistPanes();

		if (inst.ready) {
			inst.widget.activeChart().setSymbol(disp);
		}
		if (this.sync.symbol) {
			this.syncOtherPanesSymbol(paneIndex, clean);
		}
		if (paneIndex === this.activePaneIndex) {
			this.emit('active-symbol-changed', clean);
		}
	}

	setInterval(resolution, paneIndex = this.activePaneIndex) {
		const inst = this.instances[paneIndex];
		if (!inst) return;
		this.panesState[paneIndex].interval = resolution;
		inst.badgeEl.textContent = `${formatDisplaySymbol(this.panesState[paneIndex].symbol)} · ${resolution}`;
		this.persistPanes();

		if (inst.ready) {
			inst.widget.activeChart().setResolution(resolution);
		}
		if (this.sync.interval) {
			this.syncOtherPanesInterval(paneIndex, resolution);
		}
		if (paneIndex === this.activePaneIndex) {
			this.emit('active-interval-changed', resolution);
		}
	}

	setSync(nextSync) {
		this.sync = { ...this.sync, ...nextSync };
		storage.setSync(this.sync);
	}

	setTheme(theme) {
		this.theme = theme === 'light' ? 'light' : 'dark';
		storage.setTheme(this.theme);
		const isDark = this.theme === 'dark';
		const tvTheme = isDark ? 'Dark' : 'Light';
		const overrides = getThemeOverrides(this.theme);

		for (const inst of this.instances) {
			if (!inst.ready) continue;
			try {
				inst.widget.changeTheme(tvTheme, { disableUndo: true });
				const doc = inst.mountEl.querySelector('iframe')?.contentDocument;
				if (doc?.documentElement) {
					doc.documentElement.classList.toggle('theme-dark', isDark);
					doc.documentElement.classList.toggle('theme-light', !isDark);
				}
				setTimeout(() => {
					try { inst.widget.applyOverrides(overrides); } catch { /* ignore */ }
				}, 250);
			} catch (err) {
				console.warn('[chartManager] changeTheme fallback:', err);
			}
		}
	}

	setLocale(locale) {
		this.locale = locale === 'en' ? 'en' : 'pt';
		storage.setLocale(this.locale);
		this.saveAllPanesState(() => this.renderLayout());
	}

	executeAction(actionId) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return false;
		try {
			inst.widget.activeChart().executeActionById(actionId);
			setTimeout(() => this.emit('undo-redo-changed'), 120);
			return true;
		} catch (err) {
			console.warn('[chartManager] executeAction:', actionId, err);
			return false;
		}
	}

	toggleDrawingsPanel() {
		return this.executeAction('drawingToolbarAction');
	}

	isDrawingsPanelVisible() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return true;
		try {
			return Boolean(inst.widget.activeChart().getCheckableActionState('drawingToolbarAction'));
		} catch {
			return true;
		}
	}

	setChartType(style) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		try {
			inst.widget.activeChart().setChartType(Number(style));
			this.emit('active-chart-type-changed', Number(style));
		} catch (err) {
			console.warn('[chartManager] setChartType:', err);
		}
	}

	getChartType() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return 1;
		try {
			return inst.widget.activeChart().chartType();
		} catch {
			return 1;
		}
	}

	getUndoRedoState() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return { enableUndo: false, enableRedo: false };
		try {
			return inst.widget.undoRedoState();
		} catch {
			return { enableUndo: false, enableRedo: false };
		}
	}

	async applyStudyPack(packName) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		const chart = inst.widget.activeChart();

		if (packName === 'clear-studies') {
			chart.removeAllStudies();
			this.emit('objects-changed');
			return;
		}

		if (packName === 'ema-ribbon') {
			const configs = [
				{ len: 9, color: '#2962FF' },
				{ len: 21, color: '#FF9800' },
				{ len: 50, color: '#E040FB' },
				{ len: 200, color: '#089981' },
			];
			for (const c of configs) {
				try {
					await chart.createStudy('Moving Average Exponential', false, false, [c.len], {
						'plot.color': c.color,
						'plot.linewidth': 2,
					});
				} catch { /* ignore */ }
			}
			this.emit('objects-changed');
			return;
		}

		if (packName === 'scalp-pack') {
			try { await chart.createStudy('VWAP', false, false); } catch { /* ignore */ }
			try { await chart.createStudy('Relative Strength Index', false, false, [14]); } catch { /* ignore */ }
			this.emit('objects-changed');
		}
	}

	async toggleCustomStudy(studyName) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return false;
		const chart = inst.widget.activeChart();
		const all = chart.getAllStudies();
		const existing = all.find((s) => s.name === studyName);
		if (existing) {
			chart.removeEntity(existing.id);
			this.emit('objects-changed');
			return false;
		}
		await chart.createStudy(studyName, false, false);
		this.emit('objects-changed');
		return true;
	}

	getActiveCustomStudySet() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return new Set();
		const all = inst.widget.activeChart().getAllStudies();
		return new Set(all.map((s) => s.name));
	}

	getActiveObjects() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return { studies: [], shapes: [] };
		const chart = inst.widget.activeChart();
		return {
			studies: chart.getAllStudies() || [],
			shapes: chart.getAllShapes() || [],
		};
	}

	setEntityVisibility(id, visible) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		try {
			inst.widget.activeChart().setEntityVisibility(id, Boolean(visible));
		} catch (err) {
			console.warn('[chartManager] setEntityVisibility:', err);
		}
	}

	openEntitySettings(id) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		try {
			inst.widget.activeChart().showPropertiesDialog(id);
		} catch (err) {
			console.warn('[chartManager] showPropertiesDialog:', err);
		}
	}

	removeEntity(id) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		try {
			inst.widget.activeChart().removeEntity(id);
			this.emit('objects-changed');
		} catch (err) {
			console.warn('[chartManager] removeEntity:', err);
		}
	}

	removeAllShapes() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		try {
			inst.widget.activeChart().removeAllShapes();
			this.emit('objects-changed');
		} catch (err) {
			console.warn('[chartManager] removeAllShapes:', err);
		}
	}

	async beginReplaySelection() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return { ok: false, reason: 'chart_not_ready' };
		const chart = inst.widget.activeChart();
		const sym = this.getActiveSymbol();
		const res = chart.resolution();
		const binInterval = resolutionToBinance(res);

		replayController.setSelecting(true);
		try {
			const selectedSec = await chart.requestSelectBar();
			if (!selectedSec || !Number.isFinite(selectedSec)) {
				replayController.setSelecting(false);
				return { ok: false, reason: 'cancelled' };
			}

			const futureBars = [];
			let cursorStart = Number(selectedSec) * 1000 + 1;
			const nowMs = Date.now();
			let safety = 0;

			while (cursorStart < nowMs && safety < 4) {
				safety++;
				const raw = await getKlines(sym, binInterval, {
					startTime: cursorStart,
					endTime: nowMs,
					limit: 1000,
				});
				if (!Array.isArray(raw) || !raw.length) break;
				const chunk = raw.map((k) => ({
					time: Number(k[0]),
					open: parseFloat(k[1]),
					high: parseFloat(k[2]),
					low: parseFloat(k[3]),
					close: parseFloat(k[4]),
					volume: parseFloat(k[5]),
				}));
				futureBars.push(...chunk);
				const lastTime = chunk[chunk.length - 1].time;
				if (raw.length < 1000 || lastTime <= cursorStart) break;
				cursorStart = lastTime + 1;
			}

			replayController.start(sym, res, Number(selectedSec), futureBars);
			chart.resetData();
			return { ok: true, count: futureBars.length, cutoffSec: selectedSec };
		} catch (err) {
			replayController.setSelecting(false);
			return { ok: false, reason: err?.message || 'cancelled' };
		}
	}

	cancelReplaySelection() {
		const inst = this.getActivePane();
		if (inst?.ready) {
			try { inst.widget.activeChart().cancelSelectBar(); } catch { /* ignore */ }
		}
		replayController.setSelecting(false);
	}

	exitReplay() {
		const inst = this.getActivePane();
		replayController.stop();
		if (inst?.ready) {
			try { inst.widget.activeChart().resetData(); } catch { /* ignore */ }
		}
	}

	syncChartLines(alerts = [], positions = [], orders = []) {
		this._lastLinesArgs = { alerts, positions, orders };
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		const chart = inst.widget.activeChart();
		const activeSym = this.getActiveSymbol();

		for (const line of inst.lines) {
			try { line.remove(); } catch { /* ignore */ }
		}
		inst.lines = [];

		// Active Price Alerts
		for (const al of alerts) {
			if (!al.active || normalizeSymbol(al.symbol) !== activeSym) continue;
			try {
				const line = chart
					.createOrderLine()
					.setPrice(Number(al.price))
					.setText(`Alert: ${al.condition} ${formatPriceForSymbol(al.price, activeSym)}`)
					.setQuantity('')
					.setLineStyle(2)
					.setLineColor('#F7931A')
					.setBodyBackgroundColor('#1F1F1F')
					.setBodyTextColor('#F7931A')
					.setBodyBorderColor('#F7931A')
					.setCancelButtonBackgroundColor('#1F1F1F')
					.setCancelButtonIconColor('#F7931A');
				try {
					line.onMove(() => {
						const newPx = line.getPrice();
						this._lineHandlers.onMoveAlert?.(al.id, newPx);
					});
					line.onCancel(() => {
						this._lineHandlers.onCancelAlert?.(al.id);
					});
				} catch { /* ignore */ }
				inst.lines.push(line);
			} catch { /* ignore */ }
		}

		// Open Paper Positions + TP/SL
		for (const pos of positions) {
			if (normalizeSymbol(pos.symbol) !== activeSym) continue;
			const isLong = pos.side === 'LONG';
			const color = isLong ? '#089981' : '#F23645';
			try {
				const posLine = chart
					.createPositionLine()
					.setPrice(Number(pos.entryPrice))
					.setText(`${pos.side} ${pos.leverage}x`)
					.setQuantity(`${pos.qty.toFixed(3)}`)
					.setLineColor(color)
					.setBodyBackgroundColor(color)
					.setBodyTextColor('#FFFFFF')
					.setBodyBorderColor(color)
					.setQuantityBackgroundColor('#1F1F1F')
					.setQuantityTextColor('#DBDBDB')
					.setQuantityBorderColor(color);
				try {
					posLine.onClose(() => this._lineHandlers.onClosePosition?.(pos.id));
					posLine.onReverse(() => this._lineHandlers.onReversePosition?.(pos.id));
				} catch { /* ignore */ }
				inst.lines.push(posLine);

				if (pos.tp) {
					const tpLine = chart
						.createOrderLine()
						.setPrice(Number(pos.tp))
						.setText('TP')
						.setQuantity(formatPriceForSymbol(pos.tp, activeSym))
						.setLineStyle(2)
						.setLineColor('#089981')
						.setBodyBackgroundColor('#0A0A0A')
						.setBodyTextColor('#089981')
						.setBodyBorderColor('#089981');
					try {
						tpLine.onMove(() => this._lineHandlers.onMoveTpSl?.(pos.id, 'tp', tpLine.getPrice()));
						tpLine.onCancel(() => this._lineHandlers.onMoveTpSl?.(pos.id, 'tp', null));
					} catch { /* ignore */ }
					inst.lines.push(tpLine);
				}

				if (pos.sl) {
					const slLine = chart
						.createOrderLine()
						.setPrice(Number(pos.sl))
						.setText('SL')
						.setQuantity(formatPriceForSymbol(pos.sl, activeSym))
						.setLineStyle(2)
						.setLineColor('#F23645')
						.setBodyBackgroundColor('#0A0A0A')
						.setBodyTextColor('#F23645')
						.setBodyBorderColor('#F23645');
					try {
						slLine.onMove(() => this._lineHandlers.onMoveTpSl?.(pos.id, 'sl', slLine.getPrice()));
						slLine.onCancel(() => this._lineHandlers.onMoveTpSl?.(pos.id, 'sl', null));
					} catch { /* ignore */ }
					inst.lines.push(slLine);
				}
			} catch { /* ignore */ }
		}

		// Pending Limit Orders
		for (const ord of orders) {
			if (normalizeSymbol(ord.symbol) !== activeSym) continue;
			const color = ord.side === 'LONG' ? '#2962FF' : '#F23645';
			try {
				const oLine = chart
					.createOrderLine()
					.setPrice(Number(ord.limitPrice))
					.setText(`Limit ${ord.side} ${ord.leverage}x`)
					.setQuantity(`$${ord.marginUsd}`)
					.setLineStyle(1)
					.setLineColor(color)
					.setBodyBackgroundColor('#1F1F1F')
					.setBodyTextColor(color)
					.setBodyBorderColor(color);
				try {
					oLine.onMove(() => this._lineHandlers.onMoveOrder?.(ord.id, oLine.getPrice()));
					oLine.onCancel(() => this._lineHandlers.onCancelOrder?.(ord.id));
				} catch { /* ignore */ }
				inst.lines.push(oLine);
			} catch { /* ignore */ }
		}
	}

	savePaneSnapshot(index) {
		const inst = this.instances[index];
		if (!inst || !inst.ready) return;
		try {
			inst.widget.save((json) => {
				this.panesState[index].savedState = json;
				this.persistPanes();
			});
		} catch { /* ignore */ }
	}

	saveAllPanesState(done) {
		const readyPanes = this.instances.filter((i) => i.ready);
		if (!readyPanes.length) {
			if (done) done();
			return;
		}
		let pending = readyPanes.length;
		for (const inst of readyPanes) {
			try {
				inst.widget.save((json) => {
					this.panesState[inst.index].savedState = json;
					pending--;
					if (pending === 0) {
						this.persistPanes();
						if (done) done();
					}
				});
			} catch {
				pending--;
				if (pending === 0) {
					this.persistPanes();
					if (done) done();
				}
			}
		}
	}

	persistPanes() {
		storage.setPanes(this.panesState);
	}

	saveNamedLayout(name) {
		return new Promise((resolve) => {
			this.saveAllPanesState(() => {
				const list = storage.getSavedLayouts();
				const record = {
					id: `lay_${Date.now()}`,
					name: name.trim() || `Layout ${list.length + 1}`,
					updatedAt: Date.now(),
					layoutType: this.layoutType,
					panes: structuredClone(this.panesState),
				};
				list.unshift(record);
				storage.setSavedLayouts(list.slice(0, 20));
				resolve(record);
			});
		});
	}

	loadNamedLayout(id) {
		const list = storage.getSavedLayouts();
		const found = list.find((l) => l.id === id);
		if (!found) return false;
		this.layoutType = LAYOUT_PANE_COUNT[found.layoutType] ? found.layoutType : '1';
		storage.setLayoutType(this.layoutType);
		this.panesState = structuredClone(found.panes);
		this.persistPanes();
		this.activePaneIndex = 0;
		this.renderLayout();
		this.emit('layout-changed', this.layoutType);
		return true;
	}

	importLayoutJson(parsed) {
		if (!parsed || !Array.isArray(parsed.panes) || !parsed.panes.length) return false;
		const layoutType = LAYOUT_PANE_COUNT[parsed.layoutType] ? parsed.layoutType : '1';
		this.layoutType = layoutType;
		storage.setLayoutType(layoutType);
		this.panesState = parsed.panes.slice(0, 4).map((p, idx) => ({
			symbol: normalizeSymbol(p?.symbol || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'][idx]),
			interval: String(p?.interval || '5'),
			savedState: p?.savedState && typeof p.savedState === 'object' ? p.savedState : null,
		}));
		while (this.panesState.length < 4) {
			this.panesState.push({ symbol: 'BTCUSDT', interval: '5', savedState: null });
		}
		this.persistPanes();
		this.activePaneIndex = 0;
		this.renderLayout();
		this.emit('layout-changed', this.layoutType);
		return true;
	}

	deleteNamedLayout(id) {
		const list = storage.getSavedLayouts().filter((l) => l.id !== id);
		storage.setSavedLayouts(list);
	}

	exportActiveLayout() {
		return new Promise((resolve) => {
			this.saveAllPanesState(() => {
				resolve({
					version: 2,
					exportedAt: new Date().toISOString(),
					layoutType: this.layoutType,
					panes: this.panesState,
				});
			});
		});
	}

	async takeScreenshot() {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return null;
		try {
			if (typeof inst.widget.takeClientScreenshot === 'function') {
				const canvas = await inst.widget.takeClientScreenshot({
					backgroundColor: this.theme === 'dark' ? '#000000' : '#FFFFFF',
				});
				return canvas.toDataURL('image/png');
			}
			inst.widget.takeScreenshot();
			return null;
		} catch (err) {
			console.warn('[chartManager] screenshot error:', err);
			return null;
		}
	}
}
