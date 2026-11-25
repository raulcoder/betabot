import Datafeed from '../services/datafeed.js';
import { formatDisplaySymbol, formatPriceForSymbol, normalizeSymbol } from '../services/binanceApi.js';
import { storage } from '../services/storage.js';
import { getCustomIndicators } from './customIndicators.js';

function getThemeOverrides(theme) {
	const dark = theme === 'dark';
	return {
		'paneProperties.background': dark ? '#131722' : '#FFFFFF',
		'paneProperties.vertGridProperties.color': dark ? '#1E222D' : '#F0F3FA',
		'paneProperties.horzGridProperties.color': dark ? '#1E222D' : '#F0F3FA',
		'scalesProperties.backgroundColor': dark ? '#131722' : '#FFFFFF',
		'scalesProperties.textColor': dark ? '#787B86' : '#6A6D78',
		'scalesProperties.lineColor': dark ? '#2A2E39' : '#E0E3EB',
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
		this.instances = []; // { index, paneEl, badgeEl, mountEl, widget, ready, lines: [] }
		this.listeners = new Map();
		this._syncLock = false;
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
			library_path: './charting_library_clonned_data/charting_library/',
			custom_css_url: '../../src/styles/tv-iframe-theme.css',
			locale: this.locale,
			timezone: 'America/Sao_Paulo',
			theme: isDark ? 'Dark' : 'Light',
			toolbar_bg: isDark ? '#131722' : '#FFFFFF',
			loading_screen: {
				backgroundColor: isDark ? '#131722' : '#FFFFFF',
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
				'header_in_fullscreen_mode',
				'show_interval_dialog_on_key_press',
				'create_volume_indicator_by_default',
				'items_favoriting',
				'go_to_date',
				'chart_crosshair_menu',
				'move_logo_to_main_pane',
				'cropped_tick_marks',
			],
			disabled_features: [
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
			// Ensure theme matches current manager theme if toggled during widget boot
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

			widget.subscribe('onAutoSaveNeeded', () => {
				this.savePaneSnapshot(instance.index);
			});

			widget.subscribe('study', () => this.emit('objects-changed'));
			widget.subscribe('drawing', () => this.emit('objects-changed'));

			if (instance.index === this.activePaneIndex) {
				this.emit('active-chart-ready', instance);
				this.emit('active-symbol-changed', this.getActiveSymbol());
				this.emit('objects-changed');
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
		this.emit('active-chart-ready', this.getActivePane());
		this.emit('objects-changed');
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
	}

	setSync(nextSync) {
		this.sync = { ...this.sync, ...nextSync };
		storage.setSync(this.sync);
	}

	setTheme(theme) {
		this.theme = theme === 'light' ? 'light' : 'dark';
		storage.setTheme(this.theme);
		const tvTheme = this.theme === 'dark' ? 'Dark' : 'Light';
		const overrides = getThemeOverrides(this.theme);

		for (const inst of this.instances) {
			if (!inst.ready) continue;
			try {
				inst.widget.changeTheme(tvTheme, { disableUndo: true });
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

	syncChartLines(alerts = [], positions = [], orders = []) {
		const inst = this.getActivePane();
		if (!inst || !inst.ready) return;
		const chart = inst.widget.activeChart();
		const activeSym = this.getActiveSymbol();

		// Clear previous lines
		for (const line of inst.lines) {
			try { line.remove(); } catch { /* ignore */ }
		}
		inst.lines = [];

		// Render active price alerts for active symbol
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
					.setBodyBackgroundColor('#1E222D')
					.setBodyTextColor('#F7931A')
					.setBodyBorderColor('#F7931A')
					.setCancelButtonBackgroundColor('#1E222D')
					.setCancelButtonIconColor('#F7931A');
				inst.lines.push(line);
			} catch {
				// some CL builds restrict order lines
			}
		}

		// Render open paper positions
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
					.setQuantityBackgroundColor('#1E222D')
					.setQuantityTextColor('#D1D4DC')
					.setQuantityBorderColor(color);
				inst.lines.push(posLine);

				if (pos.tp) {
					const tpLine = chart
						.createOrderLine()
						.setPrice(Number(pos.tp))
						.setText('TP')
						.setQuantity(formatPriceForSymbol(pos.tp, activeSym))
						.setLineStyle(2)
						.setLineColor('#089981')
						.setBodyBackgroundColor('#131722')
						.setBodyTextColor('#089981')
						.setBodyBorderColor('#089981');
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
						.setBodyBackgroundColor('#131722')
						.setBodyTextColor('#F23645')
						.setBodyBorderColor('#F23645');
					inst.lines.push(slLine);
				}
			} catch {
				// ignore if unsupported
			}
		}

		// Render pending limit orders
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
					.setBodyBackgroundColor('#1E222D')
					.setBodyTextColor(color)
					.setBodyBorderColor(color);
				inst.lines.push(oLine);
			} catch {
				// ignore
			}
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
		} catch {
			// ignore
		}
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
		this.layoutType = found.layoutType || '1';
		storage.setLayoutType(this.layoutType);
		this.panesState = structuredClone(found.panes);
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
					backgroundColor: this.theme === 'dark' ? '#131722' : '#FFFFFF',
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
