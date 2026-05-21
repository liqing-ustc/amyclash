# amyclash

End-to-end AmyTelecom → Clash tooling: fetch a fresh subscription URL and patch it
into a ready-to-use Clash config in one command.

It bundles two self-contained pieces plus a thin wrapper that chains them:

```
amyclash/
├── bin/amyclash      # wrapper: opencli fetch URL → amy-patch → write Clash profile
├── adapter/          # OpenCLI adapter for amytele.co (services / detail / subscription)
└── patch/            # amy-patch — the Python CLI that rewrites the Clash config
```

## How it works

1. `adapter/` is an [OpenCLI](https://github.com/jackwener/opencli) adapter that drives the
   amytele.co WHMCS client area (browser-cookie auth) to mint a fresh AnyTLS subscription URL.
   These URLs are only valid ~10 minutes after activation.
2. `patch/` (amy-patch) fetches that URL, strips the traffic/expiry pseudo-proxies, builds
   per-region `url-test` groups + a `PROXY` selector + per-service selectors, merges custom
   rule providers, and writes the patched config.
3. `bin/amyclash` runs both: `opencli amytele subscription` → `amy-patch --url … -o <profile>`.

## Install

Prereqs:

- [`opencli`](https://github.com/jackwener/opencli) installed and bound to a Chrome session logged into amytele.co
- [`uv`](https://docs.astral.sh/uv/) and `jq`
- A Clash client to load the generated profile (both use the mihomo core):
  - macOS — [ClashX.Meta](https://github.com/MetaCubeX/ClashX.Meta) (the default output path targets its profile directory)
  - Ubuntu/Linux — [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) (point it at the generated file with `-o`)

```sh
make install        # install-adapter + sync + link  (or run them individually)
```

- `make install-adapter` — copies `adapter/` into `~/.opencli/{clis,sites}/amytele`
  (opencli skips symlinks, so this is a real copy; re-run after pulling changes).
- `make sync` — `uv sync` the amy-patch CLI in `patch/`.
- `make link` — symlinks `bin/amyclash` into `~/.local/bin/`.

## Usage

```sh
amyclash                                   # fetch a fresh URL → patch → active profile
amyclash --url https://161.../?<base64>    # patch a URL you already have (skips opencli)
amyclash -o ~/some/config.yaml             # write somewhere else
amyclash --mode whitelist --tun-mode       # other flags pass through to amy-patch
```

- `--url <URL>` — subscription URL to patch; omit it to fetch a fresh one via `opencli amytele subscription`.
- `-o, --output <path>` — output path. Defaults to the active ClashX Meta profile `~/.config/clash.meta/AmyTelecom_Clash.yaml`.
- Any other flags pass straight through to amy-patch. To customize rules, copy
`patch/clash-rules.example.yaml` / `patch/extra-rules.example.yaml` to the un-suffixed names
in `patch/` and edit (the CLI falls back to the `.example.yaml` versions otherwise).

See `patch/CLAUDE.md` for amy-patch internals and `adapter/sites/notes.md` for adapter notes.

## Acknowledgements

The `patch/` config patcher is based on [ytyt-yt/amy-patch](https://github.com/ytyt-yt/amy-patch).
