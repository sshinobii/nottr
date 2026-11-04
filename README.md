<p align="center">
  <img src="docs/nottr-banner.png" alt="NOTTR — Your wallet is public. Know what it reveals." width="100%" />
</p>

<p align="center">
  <strong>Wallet Privacy Intelligence for Robinhood Chain</strong><br />
  Understand the onchain footprint your wallet leaves behind.
</p>

<p align="center">
  <a href="https://nottr.xyz">Visit NOTTR</a> ·
  <a href="https://nottr.xyz/dashboard">Launch app</a> ·
  <a href="https://robinhoodchain.blockscout.com/address/0xd4531a83a8b29d54aab30428f99de889e9e0fc54">$NOTTR contract</a>
</p>

## About

Blockchain activity is public. NOTTR helps people explore the connections and patterns visible around an address on Robinhood Chain, with evidence and clear descriptions of the data available.

Enter an EVM address to start a public scan. A wallet connection is optional for public scans; sign in with email or a wallet to access account features.

## Features

- **Wallet scans** — explore recent activity using Robinhood Chain data.
- **Privacy Score** — an experimental, rule-based estimate with an explanation of its factors and the limits of the available sample.
- **Exposure map** — visualize direct counterparties and follow links to the underlying transactions.
- **Privacy signals** — identify repeated direct interactions and review their evidence.
- **NOTTR Analyst** — ask an AI assistant to explain a fresh scan and suggest practical next steps.
- **Personal workspace** — sign in through Privy, revisit scan history, and export or clear saved history.

The Privacy Score describes the activity observed within the scan's scope. It is not a guarantee of anonymity or security. AI responses are interpretations and may contain errors; check conclusions against the linked evidence. A connection between addresses does not prove common ownership.

## Network

NOTTR currently focuses on **Robinhood Chain Mainnet** (chain ID `4663`). Scans use Alchemy when configured and can fall back to Blockscout. Coverage is partial: the application displays the source and scope of each scan.

**$NOTTR contract:** [`0xd4531a83a8b29d54aab30428f99de889e9e0fc54`](https://robinhoodchain.blockscout.com/address/0xd4531a83a8b29d54aab30428f99de889e9e0fc54)

## Development

Built with Next.js, React, TypeScript, Supabase, Privy, Alchemy and OpenAI.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure the variables in `.env.local` for your environment, then open [localhost:3000](http://localhost:3000). Run the SQL migrations in `supabase/migrations` in filename order when setting up a new Supabase project. Enable email and wallet login in Privy and configure its allowed domains.

```bash
npm test       # Run automated tests
npm run build  # Build the application
```

Keep server credentials out of source control and client-side code. The AI analyst requires an OpenAI API key and sends scan data and the user's question to OpenAI when requested.

## Project status

NOTTR is under active development. Paid reports, subscriptions, monitoring, token holder benefits and automated buyback or burn operations are not currently available. The product does not hide transactions or make a wallet anonymous.
