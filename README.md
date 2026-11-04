# NOTTR

Wallet privacy intelligence for Robinhood Chain. This repository contains an early foundation, not the complete MVP described in the product specification.

## Run locally

Requires Node.js 20.9 or newer and network access to npm and Robinhood Chain's Blockscout explorer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Run `npm run build` for a production build.

## Current scope

The public address form validates EVM addresses and requests the latest transaction page from Robinhood Chain Blockscout via a server endpoint. It shows source links, scan time and limited coverage. An empty response is distinct from an upstream error. No wallet connection or secrets are required.

The score is deliberately unavailable: it needs a validated methodology, sufficient data coverage and tests. Token transfers, full historical pagination, exposure graph, recommendations, wallet authentication, reports, payment verification, subscriptions, monitoring, token entitlements, storage, rate limiting and administration are not implemented. Do not deploy this foundation as a production service without those controls and security review. Buyback and burn execution are absent and cannot run.

## Sources and limitations

The sole data source is `https://robinhoodchain.blockscout.com/api/v2`. Transactions are limited to one page; the API can be unavailable or incomplete. No association between addresses should be interpreted as shared ownership. NOTTR does not provide anonymity or guarantee privacy. The application does not aggregate other chains.
