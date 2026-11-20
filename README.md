# TradeGrid Agent Desk

An open agentic website for the [Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/).
It helps a Malaysian SME exporter see which export requirements apply to one shipment,
which do not, and what is still missing.

Status: first working build, running locally. Not yet deployed, and not yet tested with a
live AI model.

## How it works

- **The page** (`index.html`, `script.js`, `styles.css`) shows a shipment form and a
  requirements checklist.
- **The desk** (`desk.js`) holds one shipment and every rule for changing it. The form and
  the agents both go through it, so they cannot disagree.
- **The rules engine** (`shared/`) is copied unchanged from TradeGrid: ten deterministic
  Malaysian export rules, ruleset `MY-EXPORT-2026.10.1`, each with an official source.
- **The agent network** (`tradegrid_export_desk.hocon`) has three agents: a coordinator
  that talks to the visitor and fills in the form, a requirements specialist and a trade
  terms specialist. They answer only from the page's own data.
- **The actions** (`site-actions.js`) are the five things an agent can do on the page:
  read the state, change the route, change the parties, set a product line, and discard
  the shipment (which the visitor must confirm).
- **The runtime** (`runtime/`) is Cognizant's browser runtime, copied unchanged from
  `cognizant-ai-labs/agentic-web` (Apache 2.0). It runs the agents in the visitor's
  browser with the visitor's own AI key. There is no server.

## Run it locally

Needs Node.js 22 or newer.

```bash
node _build/scripts/serve_site.mjs . --port 8080
```

Open http://127.0.0.1:8080/ and add an AI provider key under "AI model settings".

## Rebuild the network after editing the .hocon or the manifest

```bash
node _build/scripts/build_network.mjs tradegrid_export_desk.hocon --manifest agent-manifest.json
```

This rewrites `tradegrid_export_desk.network.json`, `agent-mcp.json`, `.well-known/` and
`bridge/`. Do not edit those by hand.

## What it does not do

It does not file customs declarations, classify goods, decide whether goods are strategic
or restricted, issue permits or certificates, calculate duties, or give legal advice.
Destination import rules were reviewed for Singapore only.

## Credits

`runtime/` and `_build/` come from `cognizant-ai-labs/agentic-web` (commit `0516537`,
19 November 2026), Apache 2.0. See `runtime/LICENSE.txt` and
`_build/LICENSE-agentic-web.txt`.
