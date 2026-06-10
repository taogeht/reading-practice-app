"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Base URL for all static app icons (served from public/images/icons/). */
export const ICONS_BASE = "/images/icons";

/**
 * Build an icon URL from its set folder + id. Every PNG filename matches the
 * id already used in code (see public/images/icons/manifest.json), so most
 * call sites can derive the path with no data changes:
 *
 *   iconSrc("login/animals", opt.id)   // -> /images/icons/login/animals/cat.png
 *   iconSrc("units", `unit-${n}`)      // -> /images/icons/units/unit-3.png
 */
export function iconSrc(set: string, id: string | number): string {
  return `${ICONS_BASE}/${set}/${id}.png`;
}

export interface IconProps {
  /** Full src, e.g. "/images/icons/login/animals/cat.png". Or use set+id. */
  src?: string;
  /** Convenience: folder under /images/icons, e.g. "login/animals". */
  set?: string;
  /** Convenience: icon id / filename without extension, e.g. "cat" or 3. */
  id?: string | number;
  /** Emoji shown until the PNG exists — or if it fails to load. */
  emoji?: string;
  /** Square size in px (applies to both the image and the emoji). Default 24. */
  size?: number;
  /** Accessible label. Empty = decorative (default). */
  alt?: string;
  /** Round the image (e.g. for avatars). */
  rounded?: boolean;
  className?: string;
}

/**
 * Static app icon with a graceful emoji fallback.
 *
 * Shows the PNG at `src` (or `set`+`id`). If the file is missing (404) or
 * fails to load, it falls back to `emoji`. That makes the icon rollout
 * incremental: drop a PNG into public/images/icons/… and it lights up;
 * anything not generated yet keeps showing its emoji — no broken-image squares.
 *
 *   <Icon set="login/animals" id={opt.id} emoji={opt.emoji} size={40} />
 *   <Icon src="/images/icons/rewards/stars.png" emoji="⭐" size={20} />
 */
export function Icon({
  src,
  set,
  id,
  emoji = "",
  size = 24,
  alt = "",
  rounded,
  className,
}: IconProps) {
  const resolved = src ?? (set != null && id != null ? iconSrc(set, id) : "");
  // Track the src that errored (rather than a bare boolean) so changing `src`
  // on a reused instance retries the new image instead of staying on emoji.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const showEmoji = !resolved || failedSrc === resolved;

  if (showEmoji) {
    return (
      <span
        role={emoji ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn("inline-block leading-none", className)}
        style={{ fontSize: size }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailedSrc(resolved)}
      className={cn("inline-block object-contain", rounded && "rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
