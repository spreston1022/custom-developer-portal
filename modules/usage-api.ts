import {
  environment,
  HttpProblems,
  ZuploContext,
  ZuploRequest,
} from "@zuplo/runtime";

/**
 * Usage API for the Developer Portal "Usage" page.
 *
 * These handlers proxy a small, read-only subset of the Zuplo Developer API
 * (https://dev.zuplo.com) so the portal can chart meter usage (e.g. `credits`,
 * `api_requests`) and request analytics per consumer. The Developer API key is
 * a privileged, account-wide secret, so it only ever lives here in the gateway
 * and is never sent to the browser.
 *
 * Required environment variables (Settings > Environment Variables):
 *   DEVELOPER_API_KEY  - Zuplo API key (secret). Account > Settings > API Keys
 *   METERING_BUCKET_ID - Bucket ID shown on Services > Monetization
 *   DEPLOYMENT_NAME    - Deployment name for request analytics, e.g.
 *                        "my-project-main-abc1234" (the subdomain of the
 *                        environment's *.zuplo.app gateway URL)
 */

const DEV_API = "https://dev.zuplo.com";

const WINDOW_SIZES = ["MINUTE", "HOUR", "DAY", "MONTH"] as const;
const ANALYTICS_WINDOWS = [
  "last-hour",
  "last-24-hours",
  "last-7-days",
  "last-30-days",
  "last-3-months",
] as const;

function requireEnv(name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function devApi(
  path: string,
  context: ZuploContext,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${DEV_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("DEVELOPER_API_KEY")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    context.log.error(
      `Developer API ${init.method ?? "GET"} ${path} failed`,
      response.status,
      await response.text(),
    );
  }
  return response;
}

function upstreamError(request: ZuploRequest, context: ZuploContext) {
  return HttpProblems.badGateway(request, context, {
    detail: "The Zuplo Developer API returned an error. See gateway logs.",
  });
}

/**
 * GET /portal-api/usage/meters
 *
 * Lists the meters defined in the monetization bucket so the portal can offer
 * a meter picker (API Requests, Credits, ...).
 */
export async function listMeters(request: ZuploRequest, context: ZuploContext) {
  const bucketId = requireEnv("METERING_BUCKET_ID");
  const response = await devApi(`/v3/metering/${bucketId}/meters`, context);
  if (!response.ok) return upstreamError(request, context);

  const meters: Array<{
    slug: string;
    name?: string;
    description?: string;
    aggregation: string;
  }> = await response.json();

  return meters.map(({ slug, name, description, aggregation }) => ({
    slug,
    name: name ?? slug,
    description,
    aggregation,
  }));
}

/**
 * GET /portal-api/usage/meters/{meterSlug}?from=&to=&windowSize=&subject=&customerId=
 *
 * Returns time-bucketed usage for one meter. Each row carries the `subject`
 * (the consumer that made the request) and `customerId`, so a single query
 * gives a per-consumer breakdown.
 */
export async function queryMeter(request: ZuploRequest, context: ZuploContext) {
  const bucketId = requireEnv("METERING_BUCKET_ID");
  const { meterSlug } = request.params;
  const query = request.query;

  const to = query.to ?? new Date().toISOString();
  const from =
    query.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const windowSize = (query.windowSize ?? "DAY").toUpperCase();

  if (!WINDOW_SIZES.includes(windowSize as (typeof WINDOW_SIZES)[number])) {
    return HttpProblems.badRequest(request, context, {
      detail: `windowSize must be one of ${WINDOW_SIZES.join(", ")}`,
    });
  }

  const body: Record<string, unknown> = { from, to, windowSize };
  if (query.subject) body.subject = query.subject.split(",");
  if (query.customerId) body.filterCustomerId = query.customerId.split(",");

  const response = await devApi(
    `/v3/metering/${bucketId}/meters/${encodeURIComponent(meterSlug)}/query`,
    context,
    { method: "POST", body: JSON.stringify(body) },
  );
  if (!response.ok) return upstreamError(request, context);

  return response.json();
}

/**
 * GET /portal-api/usage/requests?consumers=a,b&window=last-7-days
 *
 * Request counts by status code for the given consumers, from the analytics
 * section of the Developer API.
 */
export async function requestStats(
  request: ZuploRequest,
  context: ZuploContext,
) {
  const deploymentName = requireEnv("DEPLOYMENT_NAME");
  const consumers = (request.query.consumers ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const window = request.query.window ?? "last-7-days";

  if (consumers.length === 0) {
    return HttpProblems.badRequest(request, context, {
      detail: "Pass at least one consumer in ?consumers=",
    });
  }
  if (!ANALYTICS_WINDOWS.includes(window as (typeof ANALYTICS_WINDOWS)[number])) {
    return HttpProblems.badRequest(request, context, {
      detail: `window must be one of ${ANALYTICS_WINDOWS.join(", ")}`,
    });
  }

  const params = new URLSearchParams({ filter: window });
  for (const consumer of consumers) params.append("consumers", consumer);

  const response = await devApi(
    `/v1/deployments/${deploymentName}/stats-by-status-code?${params}`,
    context,
  );
  if (!response.ok) return upstreamError(request, context);

  return response.json();
}
