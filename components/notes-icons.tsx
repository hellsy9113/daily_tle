import type { ButtonHTMLAttributes } from "react";

export type NotesIconName =
  | "add"
  | "edit"
  | "delete"
  | "save"
  | "close"
  | "lock"
  | "info"
  | "key"
  | "arrow"
  | "notes"
  | "refresh";
export function NotesIcon({ name }: { name: NotesIconName }) {
  const paths: Record<NotesIconName, React.ReactNode> = {
    add: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" />
      </>
    ),
    delete: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="9" r="5" />
        <path d="m12 13 8 8M17 18l3-3M14 15l3-3" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    notes: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function NotesIconButton({
  icon,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: NotesIconName; label: string }) {
  return (
    <button
      type="button"
      className="button secondary icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      <NotesIcon name={icon} />
    </button>
  );
}
