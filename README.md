## Zuplo API

This is a Zuplo API that was created with
[`create-zuplo-api`](https://zuplo.com/docs).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:9000](http://localhost:9000) with your browser to see the
result.

You can start editing the API by modifying `config/routes.oas.json`. The dev
server will automatically reload the API with your changes.

## Debugging

In VS Code, open **Run and Debug**, select **Launch & Attach Zuplo**, and click
the green play button.

For other editors and more details, see the
[debugging guide](https://zuplo.com/docs/articles/local-development-debugging).

## Learn More

To learn more about Zuplo, you can visit the
[Zuplo documentation](https://zuplo.com/docs).

To connect with the community join [Discord](https://discord.zuplo.com).

## Usage dashboard sample

This project adds a **Usage** page to the Developer Portal (`/usage`). It charts
any monetization meter (for example `credits` or `api_requests`) per consumer,
and shows request counts by status code for a selected consumer. Product and
customer success teams can use it without opening CloudWatch or asking
engineering.

```
Browser (docs/src/UsageDashboard.tsx)
   ▼
Gateway /portal-api/usage/*  (config/routes.oas.json)
   │  modules/usage-api.ts adds the Zuplo API key server-side
   ▼
Zuplo Developer API (dev.zuplo.com)
   ├─ GET  /v3/metering/{bucketId}/meters
   ├─ POST /v3/metering/{bucketId}/meters/{meter}/query
   └─ GET  /v1/deployments/{deployment}/stats-by-status-code
```

| File | Purpose |
| --- | --- |
| `modules/usage-api.ts` | Route handlers that call the Developer API. The Zuplo API key never reaches the browser. |
| `config/routes.oas.json`, `config/policies.json` | `/portal-api/usage/*` routes and CORS for the portal. |
| `docs/src/UsageDashboard.tsx` | The portal page. |
| `docs/zudoku.config.tsx` | Adds the `/usage` nav item. |

### Setup

1. Copy `.env.example` to `.env` and fill in the usage-page variables. For
   deployed environments, set the same variables under **Settings >
   Environment Variables**, and mark `DEVELOPER_API_KEY` as a secret.
2. Run `npm run dev` and open http://localhost:9200/usage.

> **Note:** For demo simplicity the usage routes are public, so anyone with the
> portal URL can see usage for every consumer. Before production, put an
> authentication policy (for example `auth0-jwt-auth-inbound`) and an admin
> check on the `/portal-api/usage/*` routes, and sign the page's requests with
> the user's token (`useZudoku().signRequest`).

Meter usage is attributed to the consumer through each metering event's
`subject`, which the monetization policy sets to the API key's consumer.

The Metering APIs are in preview and may change.
