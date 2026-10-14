import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import type { ActivityPlatform, WeeklyGoal } from "./types";

export function parseActivityPlatform(value: unknown): ActivityPlatform {
  if (value !== "leetcode" && value !== "gfg") throw new ApiError(400, "Choose LeetCode or GFG.");
  return value;
}

export function parseActivityDate(value: string | null): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new ApiError(400, "Choose a valid date (YYYY-MM-DD).");
  return value;
}

export function parseGoal(value: unknown): WeeklyGoal & { platform: ActivityPlatform } {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "platform" && key !== "weeklyTarget")
  )
    throw new ApiError(400, "Provide only the platform and weekly target.");
  const platform = parseActivityPlatform(value.platform);
  const target = value.weeklyTarget;
  if (target === null) return { platform, weeklyTarget: null };
  if (typeof target !== "number" || !Number.isInteger(target) || target < 1 || target > 1000)
    throw new ApiError(
      400,
      "Choose a whole-number weekly target from 1 to 1,000, or null to remove it.",
    );
  return { platform, weeklyTarget: target };
}
