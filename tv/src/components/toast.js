import { formatPriceForSymbol, getCoinIconBase } from '../services/binanceApi.js';

export function showToast({ title, message, tone = 'info', duration = 4200 }) {
	const stack = document.getElementById('toast-stack');
	if (!stack) return;
	const el = document.createElement('div');
	el.className = `tv-toast ${tone === 'up' ? 'is-up' : tone === 'down' ? 'is-down' : tone === 'warn' ? 'is-warn' : ''}`;
	el.innerHTML = `
		<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px;">
			<strong style="font-size:12px;">${escapeHtml(title || 'Notice')}</strong>
			<button type="button" style="color:var(--text-secondary);font-size:14px;line-height:1;">&times;</button>
		</div>
		${message ? `<div style="color:var(--text-secondary);font-size:11px;">${escapeHtml(message)}</div>` : ''}
	`;
	el.querySelector('button').addEventListener('click', () => el.remove());
	stack.appendChild(el);
	setTimeout(() => {
		if (el.parentNode) el.remove();
	}, duration);
}

export function escapeHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function formatCompactUsd(val) {
	const num = Number(val);
	if (!Number.isFinite(num)) return '--';
	if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
	if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
	if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
	return `$${num.toFixed(2)}`;
}

export function formatCompactQty(val) {
	const num = Number(val);
	if (!Number.isFinite(num)) return '--';
	if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
	if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
	if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
	return num.toFixed(2);
}

export function playAlertBeep() {
	try {
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return;
		const ctx = new AudioCtx();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(880, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14);
		gain.gain.setValueAtTime(0.08, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + 0.34);
	} catch {
		// ignore audio block
	}
}

const AVATAR_PALETTE = [
	'#F7931A',
	'#627EEA',
	'#089981',
	'#2962FF',
	'#E040FB',
	'#F0B90B',
	'#00B8D9',
	'#F23645',
];

function avatarColorFor(base) {
	let hash = 0;
	for (let i = 0; i < base.length; i++) {
		hash = (hash * 31 + base.charCodeAt(i)) | 0;
	}
	return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function getCoinAvatarHtml(symbol, size = 18) {
	const base = getCoinIconBase(symbol);
	const letter = escapeHtml((base[0] || '?').toUpperCase());
	const bg = avatarColorFor(base);
	const fontSize = Math.max(9, Math.round(size * 0.54));
	return `<span class="tv-coin-avatar" style="width:${size}px;height:${size}px;background:${bg};font-size:${fontSize}px;"><span>${letter}</span><img src="../icons/${encodeURIComponent(base)}.png" alt="" loading="lazy" onerror="this.remove()" /></span>`;
}

export function formatSplitPriceHtml(price, symbol, dir = 0) {
	const str = formatPriceForSymbol(price, symbol);
	if (!str || str === '--' || str.length < 3 || dir === 0) {
		return escapeHtml(str);
	}
	const head = escapeHtml(str.slice(0, -2));
	const tail = escapeHtml(str.slice(-2));
	const cls = dir > 0 ? 'is-up' : 'is-down';
	return `${head}<span class="tv-px-tail ${cls}">${tail}</span>`;
}
