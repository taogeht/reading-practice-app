"use client";

// Section-level disclosure: a heading that folds its body away.
//
// Distinct from CollapsibleCard, which wraps its contents in a Card. Use this
// when the body already contains cards (a grid of them, a table in its own
// Card) and nesting one card inside another would read as a mistake.
//
// Two modes:
//   uncontrolled — manages its own state; pass `storageKey` to persist the
//                  choice per browser.
//   controlled   — pass `open` + `onOpenChange` when the open set is derived
//                  from data (e.g. open every grade that has a current list).
//
// Only the heading toggles. `actions` render as a sibling of the toggle, never
// inside it, because nesting a <button> or <select> inside a <button> is
// invalid HTML and swallows the inner control's clicks. They are hidden rather
// than unmounted so a filter selection survives a collapse.

import { ReactNode, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  title: ReactNode;
  /** Quiet text next to the title — a count, a total. Part of the toggle. */
  meta?: ReactNode;
  /** Status chips shown beside the title. Part of the toggle, so keep these
   *  non-interactive; anything clickable belongs in `actions`. */
  badges?: ReactNode;
  /** Controls shown only while open, as a sibling of the toggle. */
  actions?: ReactNode;
  /** Shown only while closed — say what is hidden, so a collapsed section
   *  still explains itself. */
  collapsedHint?: ReactNode;
  /** Uncontrolled initial state. Ignored when `open` is supplied. */
  defaultOpen?: boolean;
  /** Persist the uncontrolled choice to localStorage under this key. */
  storageKey?: string;
  /** Controlled state. Supply with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Tailwind classes for the title element (default: section-sized). */
  titleClassName?: string;
  className?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  meta,
  badges,
  actions,
  collapsedHint,
  defaultOpen = true,
  storageKey,
  open: controlledOpen,
  onOpenChange,
  titleClassName = "text-lg font-semibold text-gray-900",
  className,
  children,
}: CollapsibleSectionProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  // Hydrate after mount so the server-rendered frame matches defaultOpen and
  // React doesn't complain about a hydration mismatch.
  useEffect(() => {
    if (isControlled || !storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "open") setUncontrolledOpen(true);
      else if (stored === "closed") setUncontrolledOpen(false);
    } catch {
      // localStorage throws in private browsing; the default stands.
    }
  }, [isControlled, storageKey]);

  const toggle = () => {
    const next = !open;
    if (isControlled) {
      onOpenChange?.(next);
      return;
    }
    setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-3 border-b pb-2 mb-5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-left"
        >
          {open ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-gray-500" />
          )}
          <span className={`${titleClassName} shrink-0`}>{title}</span>
          {meta && <span className="text-sm text-gray-500 shrink-0">{meta}</span>}
          {!open && collapsedHint && (
            <span className="text-sm font-normal text-gray-500">{collapsedHint}</span>
          )}
          {badges}
        </button>
        {actions && (
          <div className={`flex shrink-0 items-center gap-2 ${open ? "" : "hidden"}`}>
            {actions}
          </div>
        )}
      </div>
      {open && children}
    </section>
  );
}

// The "…and there are N more" affordance: a quiet dashed control that reveals
// a secondary set without implying the set is a section of its own. Used for
// archived classes and archived spelling lists, which should stay out of the
// working view but remain one click away.
export function ShowMoreToggle({
  open,
  onToggle,
  label,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  /** Called with the current state so the caller owns the wording. */
  label: (open: boolean) => ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 ${className ?? ""}`}
    >
      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      {label(open)}
    </button>
  );
}
