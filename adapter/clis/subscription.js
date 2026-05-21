// AmyTelecom subscription — generate the (persistent, wrapped) subscription URL
// for a service, for a given client.
//
// The site mints the real subscription URL server-side: clicking a client button
// fires a POST and, after an ~8s server delay, shows the address as
// "订阅地址：https://161.129.35.81/?<base64>". The raw onclick path on its own
// returns 503, so we drive that button and read the generated URL back — exactly
// what the website's copy button does.
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
    SUB_BASE,
    resolveSidToken,
    resolveDefaultServiceId,
    waitFor,
    ArgumentError,
    CommandExecutionError,
} from './utils.js';

// client name -> CSS selector for its AnyTLS *subscription* button (not node-list).
const CLIENT_SELECTORS = {
    clash: 'input[id^="Clash"][id$="_Anyttls"]',
    v2rayn: 'input[id^="V2RayN"][id$="_Anytls"]',
    quantumultx: 'input[id="QuantumultX_Anytls"]',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

cli({
    site: 'amytele',
    name: 'subscription',
    access: 'read',
    description: 'Generate the AnyTLS subscription URL for a service (clash / v2rayn / quantumultx)',
    domain: 'www.amytele.co',
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'id', type: 'string', default: null, help: 'Service id (default: first active service)' },
        { name: 'client', type: 'string', default: 'clash', help: 'Client: clash / v2rayn / quantumultx' },
    ],
    columns: ['serviceId', 'client', 'protocol', 'url'],
    func: async (page, args) => {
        const client = String(args.client ?? 'clash').toLowerCase();
        const selector = CLIENT_SELECTORS[client];
        if (!selector) {
            throw new ArgumentError(`client must be one of: ${Object.keys(CLIENT_SELECTORS).join(', ')}`);
        }

        // --id optional: default to the first active service.
        const id = args.id != null && String(args.id).trim() !== ''
            ? String(args.id).trim()
            : await resolveDefaultServiceId(page);
        const { sid, token } = await resolveSidToken(page, id);

        await page.goto(`${SUB_BASE}/Subscription/index?sid=${sid}&token=${token}`, { waitUntil: 'load' });

        // Wait until the button AND its handler are ready — clicking before
        // GetSubscription/jQuery load silently does nothing and we'd just time out.
        const ready = await waitFor(
            page,
            `(() => !!document.querySelector(${JSON.stringify(selector)}) && typeof window.GetSubscription === 'function')()`,
        );
        if (!ready) {
            throw new CommandExecutionError(`amytele subscription: ${client} button/handler not ready on the subscription page`);
        }

        const click = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`;
        const readUrl = `(() => { const m = document.body.innerText.match(/订阅地址[：:]\\s*(https?:\\/\\/[^\\s]+)/); return m ? m[1] : null; })()`;

        // Click fires GetSubscription -> server generates the URL (delaytime≈8s, but
        // the host can be overloaded). Poll up to ~42s; re-trigger once at ~18s in
        // case the first click was lost.
        await page.evaluate(click);
        let url = null;
        for (let i = 0; i < 28; i++) {
            await sleep(1500);
            url = await page.evaluate(readUrl);
            if (url) break;
            if (i === 12) await page.evaluate(click);
        }
        if (!url) {
            throw new CommandExecutionError(
                `amytele subscription: timed out waiting for ${client} URL generation (>42s) — host may be overloaded, retry`,
            );
        }

        return [{ serviceId: sid, client, protocol: 'anytls', url }];
    },
});
