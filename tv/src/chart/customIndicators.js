export function getCustomIndicators(PineJS) {
	return Promise.resolve([
		{
			name: 'OpenInterest',
			metainfo: {
				_metainfoVersion: 40,
				id: 'OpenInterest@tv-basicstudies-1',
				scriptIdPart: '',
				name: 'OpenInterest',
				description: 'Binance Open Interest (OHLC)',
				shortDescription: 'Open Interest',
				is_hidden_study: false,
				is_price_study: false,
				isCustomIndicator: true,
				plots: [
					{ id: 'plot_0', type: 'ohlc_open', target: 'plotcandle_0' },
					{ id: 'plot_1', type: 'ohlc_high', target: 'plotcandle_0' },
					{ id: 'plot_2', type: 'ohlc_low', target: 'plotcandle_0' },
					{ id: 'plot_3', type: 'ohlc_close', target: 'plotcandle_0' },
					{ id: 'plot_4', type: 'ohlc_colorer', palette: 'palette_0', target: 'plotcandle_0' },
				],
				palettes: {
					palette_0: {
						colors: [{ name: 'Up Color' }, { name: 'Down Color' }],
						valToIndex: { '1': 0, '-1': 1 },
					},
				},
				ohlcPlots: {
					plotcandle_0: { title: 'OpenInterest' },
				},
				defaults: {
					ohlcPlots: {
						plotcandle_0: {
							borderColor: '#089981',
							color: '#089981',
							drawBorder: false,
							drawWick: true,
							plottype: 'ohlc_candles',
							visible: true,
							wickColor: '#787B86',
						},
					},
					palettes: {
						palette_0: {
							colors: [{ color: '#089981' }, { color: '#F23645' }],
						},
					},
					precision: 2,
					inputs: {},
				},
				styles: {},
				inputs: [],
			},
			constructor: function () {
				this.init = function (context, inputCallback) {
					this._context = context;
					this._input = inputCallback;
					const symbol = `${PineJS.Std.ticker(this._context)}#OpenInterest`;
					this._context.new_sym(symbol, PineJS.Std.period(this._context));
				};
				this.main = function (context, inputCallback) {
					this._context = context;
					this._input = inputCallback;
					this._context.select_sym(1);
					const dir = PineJS.Std.volume(this._context) === 0 ? -1 : 1;
					return [
						{ value: PineJS.Std.open(this._context) },
						{ value: PineJS.Std.high(this._context) },
						{ value: PineJS.Std.low(this._context) },
						{ value: PineJS.Std.close(this._context) },
						{ value: dir },
					];
				};
			},
		},
		{
			name: 'FundingRate',
			metainfo: {
				_metainfoVersion: 40,
				id: 'FundingRate@tv-basicstudies-1',
				scriptIdPart: '',
				name: 'FundingRate',
				description: 'Binance Funding Rate (%)',
				shortDescription: 'Funding Rate %',
				is_hidden_study: false,
				is_price_study: false,
				isCustomIndicator: true,
				plots: [
					{ id: 'plot_0', type: 'line' },
					{ id: 'plot_1', type: 'colorer', palette: 'palette_0', target: 'plot_0' },
				],
				palettes: {
					palette_0: {
						colors: [{ name: 'Positive' }, { name: 'Negative' }],
						valToIndex: { '1': 0, '-1': 1 },
					},
				},
				defaults: {
					styles: {
						plot_0: {
							linestyle: 0,
							linewidth: 2,
							plottype: 5,
							trackPrice: false,
							transparency: 15,
							visible: true,
							color: '#089981',
						},
					},
					palettes: {
						palette_0: {
							colors: [{ color: '#089981' }, { color: '#F23645' }],
						},
					},
					precision: 4,
					inputs: {},
				},
				styles: {
					plot_0: { title: 'Funding %', histogramBase: 0 },
				},
				inputs: [],
			},
			constructor: function () {
				this.init = function (context, inputCallback) {
					this._context = context;
					this._input = inputCallback;
					const symbol = `${PineJS.Std.ticker(this._context)}#FundingRate`;
					this._context.new_sym(symbol, PineJS.Std.period(this._context));
				};
				this.main = function (context, inputCallback) {
					this._context = context;
					this._input = inputCallback;
					this._context.select_sym(1);
					const val = PineJS.Std.close(this._context);
					const dir = val >= 0 ? 1 : -1;
					return [{ value: val }, { value: dir }];
				};
			},
		},
		{
			name: 'LongShortRatio',
			metainfo: {
				_metainfoVersion: 40,
				id: 'LongShortRatio@tv-basicstudies-1',
				scriptIdPart: '',
				name: 'LongShortRatio',
				description: 'Binance Global Long/Short Ratio',
				shortDescription: 'Long/Short Ratio',
				is_hidden_study: false,
				is_price_study: false,
				isCustomIndicator: true,
				plots: [{ id: 'plot_0', type: 'line' }],
				defaults: {
					styles: {
						plot_0: {
							linestyle: 0,
							linewidth: 2,
							plottype: 2,
							trackPrice: false,
							transparency: 0,
							visible: true,
							color: '#2962FF',
						},
					},
					precision: 3,
					inputs: {},
				},
				styles: {
					plot_0: { title: 'Long/Short Ratio' },
				},
				inputs: [],
			},
			constructor: function () {
				this.init = function (context, inputCallback) {
					this._context = context;
					this._input = inputCallback;
					const symbol = `${PineJS.Std.ticker(this._context)}#LongShortRatio`;
					this._context.new_sym(symbol, PineJS.Std.period(this._context));
				};
				this.main = function (context, inputCallback) {
					this._context = context;
					this._input = inputCallback;
					this._context.select_sym(1);
					return [{ value: PineJS.Std.close(this._context) }];
				};
			},
		},
	]);
}
