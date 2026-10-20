import { normalizeTimezone } from "@/lib/timezone";
import { ApiError } from "@/lib/http/api-error";
import type { GfgQuery } from "./types";

export function parseGfgUsername(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(value.trim()))
    throw new ApiError(
      400,
      "Enter a GFG username using letters, numbers, underscores, dots, or hyphens.",
    );
  return value.trim();
}

function parseDate(value: string | null): string | undefined {
  if (value === null) return;
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new ApiError(400, "Use valid ISO dates (YYYY-MM-DD).");
  return value;
}

export function parseGfgQuery(params: URLSearchParams): GfgQuery {
  if (params.has("timezone") && !normalizeTimezone(params.get("timezone")))
    throw new ApiError(400, "Choose a valid timezone.");
  const period = params.get("period") ?? "all";
  const include = params.get("includeProblems") ?? "false";
  if (!["daily", "weekly", "all"].includes(period) || !["true", "false"].includes(include))
    throw new ApiError(400, "Use period=daily, weekly, or all and includeProblems=true or false.");
  const startDate = parseDate(params.get("startDate"));
  const endDate = parseDate(params.get("endDate"));
  if (startDate && endDate && startDate >= endDate)
    throw new ApiError(400, "startDate must be before the exclusive endDate.");
  return {
    period: period as GfgQuery["period"],
    includeProblems: include === "true",
    startDate,
    endDate,
  };
}
