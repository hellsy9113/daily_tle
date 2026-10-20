"use client";
import { useTimezone } from "./timezone-provider";
export function TimezoneLabel() {
  return <span>{useTimezone()}</span>;
}
