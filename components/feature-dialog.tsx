"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function FeatureDialog({
  title,
  triggerId,
  children,
}: {
  title: string;
  triggerId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    heading.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      const target =
        previous instanceof HTMLElement && previous !== document.body && previous.isConnected
          ? previous
          : document.getElementById(triggerId);
      target?.focus();
    };
  }, [triggerId]);

  function close() {
    router.replace("/feature", { scroll: false });
  }

  return (
    <dialog
      className="consent-dialog feature-dialog"
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
    >
      <div className="feature-dialog-heading">
        <h2 id={titleId} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button
          type="button"
          className="button secondary"
          aria-label="Close service management"
          onClick={close}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
