import "server-only";
import type { Account } from "@/lib/db/schema";
import { registerUsername, trackingStatus } from "@/lib/tracking/registration";
import { registerGfg } from "@/lib/gfg/service";
import { registerHackerRank } from "@/lib/hackerrank/service";
import { revokeService, setServicePaused } from "@/lib/tracking/services";
import type { TrackingStatus } from "@/lib/tracking/types";
import { activityFeatureIds, type FeatureId, type ActivityFeatureId } from "./catalog";
import { parseCode } from "@/lib/notes/access";
import { manageNotes, notesStatus, registerNotes } from "@/lib/notes/service";
import { parseRegistration } from "@/lib/tracking/agreement";

export interface FeatureAdapter {
  parseRegistration(input: unknown): unknown;
  register(account: Account, input: unknown): Promise<TrackingStatus>;
  status(account: Account): Promise<TrackingStatus>;
  pause(accountId: string, registrationId: string, paused: boolean): Promise<Account>;
  revoke(accountId: string, registrationId: string): Promise<Account>;
}

const registrations = {
  leetcode: (account, input) => registerUsername(account, input),
  gfg: (account, input) => registerGfg(account, input),
  hackerrank: (account, input) => registerHackerRank(account, input),
} satisfies Record<ActivityFeatureId, FeatureAdapter["register"]>;

const activityAdapters = Object.fromEntries(
  activityFeatureIds.map((id) => [
    id,
    {
      parseRegistration,
      register: registrations[id],
      status: (account: Account) =>
        id === "leetcode" ? trackingStatus(account) : trackingStatus(account, id),
      pause: (accountId: string, registrationId: string, paused: boolean) =>
        setServicePaused(accountId, id, registrationId, paused),
      revoke: (accountId: string, registrationId: string) =>
        revokeService(accountId, id, registrationId),
    },
  ]),
) as Record<ActivityFeatureId, FeatureAdapter>;

export const featureAdapters: Record<FeatureId, FeatureAdapter> = {
  ...activityAdapters,
  notes: {
    parseRegistration: parseCode,
    register: registerNotes,
    status: notesStatus,
    pause: (accountId, registrationId, paused) => manageNotes(accountId, registrationId, paused),
    revoke: (accountId, registrationId) => manageNotes(accountId, registrationId, "revoke"),
  },
};
