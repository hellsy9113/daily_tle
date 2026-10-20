"use client";
import { useTimezone } from "./timezone-provider";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ActivityPanelHeader({
  titleId,
  platform,
  username,
  busy,
  onRefresh,
  children,
  controls,
}: {
  titleId: string;
  platform: string;
  username: string | null;
  busy: boolean;
  onRefresh: () => void;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const timezone = useTimezone();
  return (
    <div className="activity-heading">
      <div>
        <p className="eyebrow">Last 365 days · {timezone}</p>
        <h2 id={titleId}>
          {platform}
          {username ? ` · ${username}` : ""}
        </h2>
      </div>
      <div className="activity-panel-actions">
        {controls}
        <button type="button" className="button secondary" disabled={busy} onClick={onRefresh}>
          {busy ? `Refreshing ${platform}…` : `Refresh ${platform}`}
        </button>
        <ChartInfo platform={platform}>{children}</ChartInfo>
      </div>
    </div>
  );
}

function ChartInfo({ platform, children }: { platform: string; children: ReactNode }) {
  const timezone = useTimezone();
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const [open, setOpen] = useState(false);
  const positionPopup = useCallback(() => {
    if (!container.current || !popup.current) return;
    const bounds = container.current.getBoundingClientRect();
    const below = Math.max(0, window.innerHeight - bounds.bottom - 16);
    const above = Math.max(0, bounds.top - 16);
    const showAbove = below < Math.min(320, above);
    popup.current.dataset.side = showAbove ? "above" : "below";
    popup.current.style.setProperty(
      "--chart-info-space",
      `${Math.max(0, (showAbove ? above : below) - 8)}px`,
    );
  }, []);
  const show = () => {
    positionPopup();
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [open, positionPopup]);
  return (
    <div
      className="chart-info"
      ref={container}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        hovered.current = true;
        show();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        if (!container.current?.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={show}
      onBlur={(event) => {
        if (!hovered.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="button secondary chart-info-button"
        aria-label={`${platform} chart information`}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={show}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <div id={id} ref={popup} role="tooltip" className="chart-info-popover" hidden={!open}>
        <div className="chart-info-content">
          <p className="chart-info-title">About your {platform} chart</p>
          <p>
            Select a calendar day to see its saved problems and links. All dates use {timezone}.
          </p>
          {children}
          <p>
            Hatched squares have no available history; dotted squares have partial history. The ≥
            symbol marks a lower bound.
          </p>
        </div>
      </div>
    </div>
  );
}
