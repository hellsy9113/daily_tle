import { redirect } from "next/navigation";
import { featurePaths } from "@/lib/features/catalog";

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(`${featurePaths.leetcode}${error === "login" ? "&error=login" : ""}`);
}
