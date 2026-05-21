# amytele.co (AmyTelecom) — site notes

WHMCS proxy-service client area at `www.amytele.co` + a separate subscription host
`161.129.35.81`. Adapters are **browser:true + Strategy.COOKIE** (reuse the Chrome
session you're already logged into).

## 2026-05-21 by claude (first adapter)

Commands written: `services`, `detail`, `subscription`.

- **Login probe:** logged-in pages contain a `退出账户` (logout) link. Absent → not
  logged in → raise `AuthRequiredError`.
- **Service id:** the `?id=N` on `clientarea.php?action=productdetails`. `sid == id`.
- **Subscription token:** 14-hex, found only in the `获取订阅链接` button's `onclick`
  on the detail page (`Subscription/index?sid=N&token=<hex>`). Read it from the
  **onclick attribute**, not `innerHTML` (innerHTML escapes `&` → `&amp;`). It is an
  account secret — **never write the token (or a full subscription URL) to any file**;
  the site bans accounts for leaked subscription info.
- **Subscription URL generation (the main gotcha):** the raw onclick path
  (`/Subscription/Clash?t=anytls_clash&...`) returns **HTTP 503 系统内部异常** by
  itself. The site mints the real URL server-side: button click → jQuery POST →
  ~8s server delay (`delaytime=8`) → address appears in a layui popup as
  `订阅地址：https://161.129.35.81/?<base64>`. That **wrapped `/?<base64>`** form is
  the persistent, reusable subscription URL. The adapter clicks the button and polls
  the popup (up to ~24s).
- **Protocol:** SS/`t=2022` is **deprecated** by the provider; use **AnyTLS**
  (`t=anytls_clash` for Clash, `t=anytls` for ShadowRocket/V2RayN). The buttons are
  duplicated across platform tabs (Clash1.._Anyttls, Clash2.., …) — functionally
  identical, only a random cache-buster differs; `querySelector` picks the first.
- **Surge** uses `SurgeCopy(url, url_u)` which opens a 托管/非托管 modal (extra click)
  — **not implemented**; `subscription` supports clash / v2rayn / quantumultx.
- **Network reachability:** `161.129.35.81` is unreachable on some networks (TLS
  handshake dies). A real Chrome reaches it fine, so browser:true works. If fetching
  the minted URL from a host that can't reach it, route via a working proxy.

## 2026-05-21 (update) — default id + reliability

- `subscription` (and any command) `--id` now optional: omitting it picks the first
  **active** service (status matches `有效|active`) via `resolveDefaultServiceId`.
  `subscription` output gained a `serviceId` column so the chosen service is visible.
- **Two render races fixed** (both were "lucky pass" silent flakes):
  1. `退出账户` (top nav) appears before the DataTable body renders → `listServices`
     now also waits for `#tableServicesList tbody tr`.
  2. The subscription button exists before `window.GetSubscription`/jQuery load →
     clicking too early silently no-ops → timeout. Now wait for the handler too.
- `subscription` generation poll extended to ~42s + one re-trigger at ~18s (the host
  warns it can be overloaded). Pre-hardening flake ~1/4; post-hardening 6/6.
- **Browser-session contention** (not an adapter bug): running multiple `opencli
  browser <session>` leases concurrently (e.g. a held debug session) makes invocations
  fail with empty stdout. Release stray sessions (`opencli browser <s> close`).

## verify fixtures
`verify/{services,detail,subscription}.json`. `detail`/`subscription` seed a
placeholder `id=12345` — replace it with your own service id when running verify.
`subscription`'s `url` is pattern-matched
(`^https://161\.129\.35\.81/\?...`), never pinned, so the token is not stored.
