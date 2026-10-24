"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Mesa, Seats } from "@/lib/util";

export type ModalState =
  | { kind: "seat"; m: number; c: number }
  | { kind: "table"; m: number | null }
  | { kind: "transfer"; m: number; c: number }
  | { kind: "import" }
  | { kind: "qr"; m: number; c: number; nextC?: number | null };

/** live data + navigation every modal gets */
export type ModalProps = {
  mesas: Mesa[];
  mesaBy: Map<number, Mesa>;
  idx: Seats;
  open: (m: ModalState) => void;
  close: () => void;
};

/** wraps a save handler so double clicks / Enter repeats run it once */
export function useBusy(fn: () => Promise<void> | void) {
  const busy = useRef(false);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await ref.current();
    } finally {
      busy.current = false;
    }
  }, []);
}

/** overlay: Esc / click outside closes, Enter in an input saves */
export function Modal({ onClose, onSave, children }: { onClose: () => void; onSave?: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el =
      box.current?.querySelector<HTMLElement>("input:not(:disabled):not([type=checkbox]):not([type=file])") ??
      box.current?.querySelector<HTMLElement>("select:not(:disabled),textarea");
    el?.focus();
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        ref={box}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && onSave) {
            e.preventDefault();
            onSave();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
