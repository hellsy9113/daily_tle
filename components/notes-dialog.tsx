"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { NotesIconButton } from "./notes-icons";

export function NotesDialog({
  title,
  children,
  busy = false,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    (
      element.querySelector<HTMLElement>("[data-autofocus], textarea, input") ??
      element.querySelector<HTMLElement>("h2")
    )?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>('button[aria-label="Add note"]')?.focus();
    };
  }, []);
  return (
    <dialog
      className="consent-dialog notes-dialog"
      ref={dialog}
      aria-labelledby={id}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="activity-heading">
        <h2 id={id} tabIndex={-1}>
          {title}
        </h2>
        <NotesIconButton icon="close" label="Close dialog" disabled={busy} onClick={onClose} />
      </div>
      {children}
    </dialog>
  );
}
