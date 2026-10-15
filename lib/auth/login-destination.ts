export const LOGIN_DESTINATION_COOKIE = "tracking_login_destination";
export function loginDestination(
  value?: string | null,
): "/feature" | "/tracking" | "/feature?platform=hackerrank" {
  if (value === "hackerrank" || value === "/feature?platform=hackerrank")
    return "/feature?platform=hackerrank";
  return value === "feature" || value === "/feature" ? "/feature" : "/tracking";
}
