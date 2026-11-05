"use client";

import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from "react";

/** Shared native-modal lifecycle and keyboard boundaries; each editor owns its draft/review/busy rules. */
export function useAdminDialog({ returnFocusTo, onEscape }: { returnFocusTo?: HTMLElement | null; onEscape: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null), dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, [returnFocusTo]);
  function onCancel(event: SyntheticEvent<HTMLDialogElement>) { event.preventDefault(); onEscape(); }
  function onKeyDownCapture(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onEscape(); return; }
    if (event.key !== "Tab") return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]"))
      .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
    const first = elements[0], last = elements.at(-1);
    if (first && last && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  }
  return { ref, onCancel, onKeyDownCapture };
}
