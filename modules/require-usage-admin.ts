import {
  environment,
  HttpProblems,
  ZuploContext,
  ZuploRequest,
} from "@zuplo/runtime";

/**
 * Allows the request only when the signed-in portal user is on the usage
 * admin list. Runs after the Auth0 JWT policy, which populates `request.user`.
 *
 * USAGE_ADMIN_SUBJECTS is a comma-separated list of Auth0 user IDs (`sub`),
 * e.g. "auth0|65f...,google-oauth2|1234...".
 *
 * This is a stand-in for Developer Portal organizations and roles. Once those
 * are available (or if you add a roles/permissions claim with an Auth0 Action),
 * check that claim here instead.
 */
export default async function requireUsageAdmin(
  request: ZuploRequest,
  context: ZuploContext,
) {
  const admins = (environment.USAGE_ADMIN_SUBJECTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!request.user || !admins.includes(request.user.sub)) {
    return HttpProblems.forbidden(request, context, {
      detail: "Usage data is only available to usage admins.",
    });
  }

  return request;
}
