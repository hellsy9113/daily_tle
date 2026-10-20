"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

const TimezoneContext = createContext(DEFAULT_TIMEZONE);
export function TimezoneProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: ReactNode;
}) {
  return <TimezoneContext.Provider value={timezone}>{children}</TimezoneContext.Provider>;
}
export const useTimezone = () => useContext(TimezoneContext);
