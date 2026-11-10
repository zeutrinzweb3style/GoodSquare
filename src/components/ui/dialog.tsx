"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog.
 *
 * Renders into a portal on the document body, closes on Escape and on a scrim
 * click, locks background scroll, and traps Tab focus inside the panel. It is
 * uncontrolled: the parent owns `open` and `onClose`.
 */
export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** id of the element naming the dialog, for screen readers. */
  labelledBy?: string;
  className?: string;
  /** When false, Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape and keep Tab focus inside the panel.
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!dismissible) return;
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, dismissible]);

  // Lock background scroll and move focus into the dialog on open.
  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
