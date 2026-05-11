'use client';

// Lightweight collapsible Card wrapper. The header stays visible at all
// times so the section is discoverable; only the body collapses. Pass
// `storageKey` to persist the open/closed preference across reloads
// (per browser, not per user) — useful on the teacher dashboard so a
// teacher who closes the Story Library doesn't see it pop back open
// every time they load the page.
//
// Default open=true; pass `defaultOpen={false}` for sections that
// should start closed (e.g. per-class buckets on the submissions
// page, which we want fresh-collapsed on every visit).

import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface CollapsibleCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Visual cue to render on the right side of the header (e.g. a
   *  count badge). Stays visible whether or not the body is open. */
  headerAccessory?: ReactNode;
  defaultOpen?: boolean;
  /** When set, the open/closed state is persisted to
   *  localStorage under this key. Omit for purely component-local
   *  state (e.g. transient per-class toggles). */
  storageKey?: string;
  className?: string;
  /** Tailwind classes for the inner CardContent. */
  bodyClassName?: string;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  description,
  headerAccessory,
  defaultOpen = true,
  storageKey,
  className,
  bodyClassName,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  // Hydrate from localStorage once on mount. We deliberately don't
  // make `open` controlled by storageKey so SSR can render a stable
  // first frame matching defaultOpen, then sync on the client.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'open') setOpen(true);
      else if (stored === 'closed') setOpen(false);
    } catch {
      // localStorage can throw in private browsing; ignore.
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <Card className={className}>
      <CardHeader
        onClick={toggle}
        className="cursor-pointer select-none"
        role="button"
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <div className="flex items-center gap-2 text-gray-500">
            {headerAccessory}
            {open ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {open && <CardContent className={bodyClassName}>{children}</CardContent>}
    </Card>
  );
}
