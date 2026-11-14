"use client";

import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from "react";

let openModals = 0;
let restoreScroll: (() => void) | undefined;

function lockBackgroundScroll() {
  if (openModals === 0) {
    const root = document.documentElement, left = window.scrollX, top = window.scrollY;
    const previous = ["overflow", "padding-right", "scrollbar-gutter"].map(name => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
    const gutter = window.innerWidth - root.clientWidth;
    const padding = parseFloat(getComputedStyle(root).paddingRight) || 0;
    root.style.setProperty("overflow", "hidden");
    if (gutter > 0) {
      if (CSS.supports("scrollbar-gutter", "stable")) root.style.setProperty("scrollbar-gutter", "stable");
      else root.style.setProperty("padding-right", `${padding + gutter}px`);
    }
    restoreScroll = () => {
      for (const [name, value, priority] of previous) root.style.setProperty(name, value, priority);
      window.scrollTo({ left, top, behavior: "instant" });
    };
  }
  openModals++;
  return () => {
    if (--openModals === 0) { restoreScroll?.(); restoreScroll = undefined; }
  };
}

/** Shared native-modal lifecycle and keyboard boundaries; each editor owns its draft/review/busy rules. */
export function useAdminDialog({ returnFocusTo, onEscape }: { returnFocusTo?: HTMLElement | null; onEscape: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null), dialog = ref.current;
    if (!dialog) return;
    const fallback = dialog.closest("[data-admin-frame]")?.querySelector<HTMLElement>("#admin-content");
    const unlock = lockBackgroundScroll();
    dialog.showModal();
    return () => {
      dialog.close(); unlock();
      const target = opener?.isConnected && opener !== document.body && !opener.matches(":disabled") && opener.getClientRects().length ? opener : fallback;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
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
