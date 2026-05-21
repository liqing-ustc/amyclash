// AmyTelecom detail — traffic usage + expiry for one service.
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
    AMY_HOST,
    AMY_BASE,
    emptyOrNull,
    toGB,
    gotoLoggedIn,
    ArgumentError,
    CommandExecutionError,
} from './utils.js';

cli({
    site: 'amytele',
    name: 'detail',
    access: 'read',
    description: 'Show traffic usage and expiry for one AmyTelecom service',
    domain: AMY_HOST,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [
        { name: 'id', type: 'string', default: null, help: 'Service id (from `opencli amytele services`)' },
    ],
    columns: ['id', 'product', 'status', 'usedGB', 'remainingGB', 'totalGB', 'usedPct', 'resetInDays', 'nextDue'],
    func: async (page, args) => {
        const id = args.id == null ? '' : String(args.id).trim();
        if (!id) throw new ArgumentError('--id <serviceId> is required (get it from `opencli amytele services`)');
        if (!/^\d+$/.test(id)) throw new ArgumentError(`--id must be a numeric service id, got "${id}"`);

        await gotoLoggedIn(page, `${AMY_BASE}/clientarea.php?action=productdetails&id=${id}`);
        const res = await page.evaluate(`(() => {
            const bt = document.body.innerText;
            const pick = (re) => { const m = bt.match(re); return m ? m[1].trim() : null; };
            return {
                product: pick(/#\\s*([A-Za-z0-9 ]+?)\\s*下次付款/),
                used: pick(/已用流量\\s*[:：]\\s*([\\d.]+\\s*[KMGT]?B)/i),
                remaining: pick(/剩余流量\\s*[:：]\\s*([\\d.]+\\s*[KMGT]?B)/i),
                resetIn: pick(/(\\d+)\\s*日后\\s*流量重置/),
                nextDue: pick(/下次付款\\s*[:：]\\s*([\\d/]+)/),
                exhausted: /流量已用尽/.test(bt),
            };
        })()`);

        const usedGB = toGB(res.used);
        const remainingGB = toGB(res.remaining);
        const totalGB = usedGB != null && remainingGB != null
            ? Math.round((usedGB + remainingGB) * 100) / 100
            : null;
        if (usedGB == null && remainingGB == null) {
            throw new CommandExecutionError(`amytele detail: could not read traffic figures for service ${id}`);
        }
        const usedPct = totalGB && totalGB > 0 ? Math.round((usedGB / totalGB) * 1000) / 10 : null;

        return [{
            id,
            product: res.product ? `# ${res.product}` : null,
            status: res.exhausted ? '流量已用尽' : '正常',
            usedGB,
            remainingGB,
            totalGB,
            usedPct,
            resetInDays: res.resetIn != null ? Number(res.resetIn) : null,
            nextDue: emptyOrNull(res.nextDue),
        }];
    },
});
