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
