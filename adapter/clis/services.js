// AmyTelecom services — list products/services in the WHMCS client area.
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
    AMY_HOST,
    emptyOrNull,
    listServices,
    EmptyResultError,
} from './utils.js';

cli({
    site: 'amytele',
    name: 'services',
    access: 'read',
    description: 'List AmyTelecom products/services (id, status, price, next due) from the client area',
    domain: AMY_HOST,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [],
    columns: ['index', 'id', 'product', 'price', 'billingCycle', 'nextDue', 'status'],
    func: async (page) => {
        const rows = await listServices(page);
        if (rows.length === 0) {
            throw new EmptyResultError('amytele services', 'No services found in the client area');
        }

        return rows.map((r, i) => {
            // "¥0.00 半年" -> price "¥0.00", billingCycle "半年"
            const pm = (r.priceCell || '').match(/^(\S+)\s*(.*)$/);
            // DataTables injects a hidden ISO sort-date (2026-01-01) alongside the
            // displayed date (2026/01/01); innerText can grab both. Keep the display date.
            const due = (r.nextDue || '').match(/\d{4}\/\d{2}\/\d{2}/);
            return {
                index: i + 1,
                id: r.id,
                product: emptyOrNull(r.product),
                price: pm ? pm[1] : emptyOrNull(r.priceCell),
                billingCycle: pm && pm[2] ? pm[2] : null,
                nextDue: due ? due[0] : emptyOrNull(r.nextDue),
                status: emptyOrNull(r.status),
            };
        });
    },
});
