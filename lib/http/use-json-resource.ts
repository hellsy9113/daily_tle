"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api-error";
import { requestJson } from "./client";
import { isRecord } from "./validation";

/** One request per resource, retained results on failure, and sync polling. */
export function useJsonResource<T>(
  path: string | null,
  {
    initialData = null,
    immediate = true,
    poll = false,
    errorMessage,
  }: {
    initialData?: T | null;
    immediate?: boolean;
    poll?: boolean;
    errorMessage?: string | ((failure: unknown) => string);
  } = {},
) {
  const [data, setData] = useState<T | null>(initialData);
  const [busy, setBusy] = useState(Boolean(path) && immediate);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    if (!path) return Promise.resolve();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return requestJson<T>(path, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setData(next);
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            typeof errorMessage === "function"
              ? errorMessage(failure)
              : (errorMessage ??
                  (failure instanceof Error ? failure.message : "Could not refresh. Try again.")),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
  }, [path, errorMessage]);
  const refresh = useCallback(() => {
    if (!path) return Promise.resolve();
    setBusy(true);
    setError("");
    return load();
  }, [path, load]);
  useEffect(() => {
    if (immediate) void load();
    return () => request.current?.abort();
  }, [immediate, load]);
  useEffect(() => {
    if (!poll || !isRecord(data) || !data.refreshing) return;
    const timer = setTimeout(() => void refresh(), 2000);
    return () => clearTimeout(timer);
  }, [data, poll, refresh]);
  return { data, busy, error, refresh };
}

export function dashboardError(error: unknown) {
  return error instanceof ApiError && error.status === 401
    ? "Your session expired. Sign in again to continue."
    : "Could not refresh your activity. Please try again shortly.";
}
