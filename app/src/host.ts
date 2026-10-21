// Host integration stub. The slot runs inside the Housebets casino frame; balance and bets are owned by the host.
// Outgoing: { source: 'crooked-house', type, ...payload } via window.parent.postMessage.
// Incoming: { target: 'crooked-house', type: 'setBalance' | 'setBet' | 'pause' | 'resume', ... }.
export type HostIn = { target: 'crooked-house'; type: 'setBalance'; balance: number } | { target: 'crooked-house'; type: 'setBet'; bet: number } | { target: 'crooked-house'; type: 'pause' | 'resume' };
export const embedded = typeof window !== 'undefined' && window.parent !== window;
export function post(type: string, payload: Record<string, unknown> = {}) {
  const msg = { source: 'crooked-house', type, ...payload };
  if (embedded) window.parent.postMessage(msg, '*');
  (window as unknown as { __hostLog?: unknown[] }).__hostLog?.push(msg);
}
export function listen(fn: (m: HostIn) => void) {
  const h = (e: MessageEvent) => { const d = e.data; if (d && d.target === 'crooked-house') fn(d as HostIn); };
  window.addEventListener('message', h); return () => window.removeEventListener('message', h);
}
