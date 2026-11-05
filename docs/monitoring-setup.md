# Monitoring setup

The scheduled worker and in-app alerts require deployment configuration and verification. They are not proof that a wallet is safe. Never store real secret values in Git.

## Database

Apply every migration in `supabase/migrations` in filename order in the NOTTR Supabase project. In particular, the saved-wallet, holder-slot, monitoring, transaction-history and approval-signal migrations must all be applied. Existing earlier migrations, including the public scan limiter, remain necessary. Test on a non-production project before applying to production.

Saved addresses and user-to-address associations are private application data. RLS is enabled and access is restricted to the server's service role, which must filter by the verified Privy user ID. Deleting a saved address cascades to its observations and alerts.

## Environment

Configure existing Supabase, Privy app ID and Alchemy values. In addition:

- `PRIVY_APP_SECRET`: Privy server-side app secret. Needed to retrieve linked wallets for holder verification. Never expose it to the browser.
- `CRON_SECRET`: random secret of at least 16 characters. Vercel sends it as a bearer token to the cron endpoint.

`vercel.json` schedules `/api/cron/monitor` daily at 00:00 UTC. The job uses a finite runtime and processes due work in batches, so a backlog, provider throttling, plan restrictions or downtime can delay checks. Monitor execution and capacity; use a reliable external scheduler or queue if the workload grows. Retry jobs do not run until the next invocation unless another authorized scheduler invokes the endpoint. Avoid overlapping unrelated schedulers without testing.

Alerts are stored in the user's account and appear in the dashboard. Telegram delivery is planned for a later update.

## Coverage and risk sources

Current checks sample recent native and ERC-20 transfers plus the latest Blockscout transaction page where available. Historical pages, internal transfers, some contract calls and offchain dApp connections are not fully covered. Newly observed does not necessarily mean newly created. A first scan establishes the baseline without sending an alert for every existing counterparty.

Saved addresses also backfill Blockscout's paginated transaction, token-transfer and internal-transaction endpoints, storing a checkpoint after each page. The backfill resumes on later worker runs after provider errors or runtime limits. Completion means the explorer returned no further pages in those three feeds; it does not establish complete onchain coverage, offchain connections, or a complete permission inventory. Historical discoveries do not create misleading new-activity alerts, but are compared with configured risk indicators. If no registry is configured, historical coverage does not provide scam screening.

The optional permission check discovers direct ERC-20 `Approval` events in only the latest 1,000 blocks and verifies the current allowance for at most 20 token/spender pairs. It raises an explainable alert for an unlimited allowance; this does not identify the spender as malicious. Older approvals, permit signatures, NFT approvals and contract-mediated approvals can be missing. A missing result is never evidence that no active permissions exist. If the provider rejects the log query, the UI marks the check unavailable.

`risk_indicators` is initially empty. It requires operator-maintained, Robinhood Chain-specific address indicators with reliable HTTPS source links. No feed or automatic scam discovery is configured. An empty registry or lack of an alert is not evidence of safety. Before adding data, verify source quality, chain relevance, licensing, update/removal policy and how reports distinguish an allegation from a confirmed incident. Integrate a vetted provider and its freshness monitoring before advertising automated threat coverage.

The free tier has two saved addresses. Additional addresses are checked against a Privy-linked wallet holding at least 1,000,000 $NOTTR, based on the contract's onchain decimals. If verification fails because a provider is unavailable, additional checks are retried rather than permanently removed. Addresses remain saved after eligibility changes; monitoring beyond the two lowest occupied slots pauses while a verified balance is below the threshold.

Saving an address attempts its first baseline scan within the save request, using the same IP-based scan quota as the public scanner. The request may take several seconds. A scan, quota, or provider failure does not discard the saved address: the daily worker can retry it. The initial check records the score and observations, but the paginated history backfill continues in later worker runs.
