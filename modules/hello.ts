import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * A simple metered endpoint used to generate usage for the Usage page.
 * The monetization-inbound policy on this route records one `api_requests`
 * unit per call against the caller's subscription.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  return {
    message: "Hello from the metered API",
    consumer: request.user?.sub,
    timestamp: new Date().toISOString(),
  };
}
