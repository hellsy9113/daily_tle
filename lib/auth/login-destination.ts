export const LOGIN_DESTINATION_COOKIE = "tracking_login_destination";
export function loginDestination(value?: string | null): "/feature" | "/tracking" {
  return value === "feature" || value === "/feature" ? "/feature" : "/tracking";
}
