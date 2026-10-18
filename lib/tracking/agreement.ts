import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";

export const AGREEMENT_VERSION = "1";
export const agreementClauses = [
  "Only register your own profile. Do not use another person's profile.",
  "Track.it saves your username and available public activity to provide tracking. No coding-platform password is required.",
  "Your saved data stays private from other users and is never sold. Hosting and database providers process stored data, and Telegram receives the recaps you enable.",
  "Public activity may be incomplete. Counts and solve dates reflect the information available from each platform.",
  "Pausing hides activity and stops recaps while daily data collection continues. Revoking a service permanently deletes its saved Track.it data.",
  "Your username stays fixed until you revoke the service. A later registration starts fresh and requires this agreement again.",
];

export function parseRegistration(body: unknown) {
  if (
    !isRecord(body) ||
    Object.keys(body).some(
      (key) => !["username", "agreementVersion", "acceptedAgreement"].includes(key),
    )
  )
    throw new ApiError(400, "Provide only your username and agreement acceptance.");
  if (body.acceptedAgreement !== true || body.agreementVersion !== AGREEMENT_VERSION)
    throw new ApiError(400, "Read and accept the current user agreement before registering.");
  return body.username;
}
