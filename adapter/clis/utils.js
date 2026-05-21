// AmyTelecom (WHMCS) shared helpers: hosts, login wait, sid/token resolution.
//
// Auth model: amytele.co is a logged-in WHMCS client area. These adapters are
// browser:true + Strategy.COOKIE — they reuse the Chrome session you're already
// logged into. If you're not logged in, the client area never shows the "退出账户"
// logout link, and we raise AuthRequiredError.
//
// Gotcha: the site serves a "请稍候…" (please-wait) interstitial that resolves to
// the real page via JS a few seconds after `load` fires. So after every navigation
// we POLL for the real content instead of extracting immediately.
import {
    ArgumentError,
    AuthRequiredError,
    CommandExecutionError,
    EmptyResultError,
} from '@jackwener/opencli/errors';

export const AMY_HOST = 'www.amytele.co';
export const AMY_BASE = `https://${AMY_HOST}`;
// Subscription links live on a separate host that the WHMCS area points at.
export const SUB_HOST = '161.129.35.81';
export const SUB_BASE = `https://${SUB_HOST}`;

export function emptyOrNull(v) {
    return v == null || v === '' ? null : v;
}

// Parse a "110.26 GB" style figure into a float number of GB (null if unparseable).
export function toGB(text) {
    if (!text) return null;
    const m = String(text).match(/([\d.]+)\s*([KMGT]?)B/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    const unit = (m[2] || 'G').toUpperCase();
    const factor = { K: 1 / 1024 / 1024, M: 1 / 1024, G: 1, T: 1024 }[unit] ?? 1;
    return Math.round(n * factor * 100) / 100;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll page.evaluate(probeExpr) until it returns a truthy value or timeout.
// Returns the last evaluated value (truthy on success, falsy on timeout).
export async function waitFor(page, probeExpr, { timeoutMs = 15000, intervalMs = 700 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    for (;;) {
        last = await page.evaluate(probeExpr);
        if (last) return last;
        if (Date.now() >= deadline) return last;
        await sleep(intervalMs);
    }
}

// Navigate to an amytele.co client-area URL and wait past the "请稍候…" interstitial
// until the logged-in chrome (退出账户 link) is present. Raises AuthRequiredError if
// it never appears (logged out or stuck interstitial).
export async function gotoLoggedIn(page, url) {
    await page.goto(url, { waitUntil: 'load' });
    const ready = await waitFor(
        page,
        `(() => !!(document.body && document.body.innerText.includes('退出账户')))()`,
    );
    if (!ready) {
        throw new AuthRequiredError(AMY_HOST, 'Log in to AmyTelecom (amytele.co) in Chrome first');
    }
}

// List services from the client area (one row per service). Shared by `services`
// and by default-id resolution. Returns [{id, product, priceCell, nextDue, status}].
export async function listServices(page) {
    await gotoLoggedIn(page, `${AMY_BASE}/clientarea.php?action=services`);
    // The nav (退出账户) appears before the DataTable body finishes rendering; wait
    // for the table to settle. DataTables renders at least one tbody tr even when
    // empty (a "no data" placeholder row, which the id filter below drops).
    await waitFor(page, `(() => !!document.querySelector('#tableServicesList tbody tr'))()`);
    return await page.evaluate(`(() => {
        return [...document.querySelectorAll('#tableServicesList tbody tr')].map(tr => {
            const link = tr.querySelector('a[href*=productdetails]');
            const id = link ? (link.href.match(/id=(\\d+)/) || [])[1] : null;
            const td = [...tr.querySelectorAll('td')].map(x => x.innerText.trim().replace(/\\s+/g, ' '));
            return { id, product: td[1] || null, priceCell: td[2] || null, nextDue: td[3] || null, status: td[4] || null };
        }).filter(r => r.id);
    })()`);
}

// Pick the first *active* service id (status contains 有效 / Active). Used when a
// command's --id is omitted. Throws EmptyResultError if there are no services, or
// no active one.
export async function resolveDefaultServiceId(page) {
    const rows = await listServices(page);
    if (rows.length === 0) throw new EmptyResultError('amytele', 'No services found in the client area');
    const active = rows.find(r => /有效|active/i.test(r.status || ''));
    if (!active) {
        throw new EmptyResultError(
            'amytele',
            `No active service found — statuses: ${rows.map(r => r.status || '?').join(', ')}. Pass --id explicitly.`,
        );
    }
    return active.id;
}

// Resolve the subscription sid+token for a service: open its detail page (waiting
// for login) and read the token out of the "获取订阅链接" button's onclick.
export async function resolveSidToken(page, id) {
    const sid = id == null ? '' : String(id).trim();
    if (!sid) throw new ArgumentError('--id <serviceId> is required (get it from `opencli amytele services`)');
    if (!/^\d+$/.test(sid)) throw new ArgumentError(`--id must be a numeric service id, got "${sid}"`);

    await gotoLoggedIn(page, `${AMY_BASE}/clientarea.php?action=productdetails&id=${sid}`);
    const token = await page.evaluate(`(() => {
        for (const el of document.querySelectorAll('[onclick]')) {
            const oc = el.getAttribute('onclick') || '';
            const m = oc.match(/Subscription\\/index\\?sid=(\\d+)&token=([a-f0-9]+)/i);
            if (m) return m[2];
        }
        return null;
    })()`);
    if (!token) {
        throw new CommandExecutionError(
            `amytele: could not find subscription token on service ${sid} — is the id correct?`,
        );
    }
    return { sid, token };
}

export { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError };
