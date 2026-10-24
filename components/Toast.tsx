"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const ToastCtx = createContext<(msg: string) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const seq = useRef(0);
  const toast = useCallback((msg: string) => {
    const id = ++seq.current;
    setItems((a) => [...a, { id, msg }]);
    setTimeout(() => setItems((a) => a.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {items.map((t) => (
        <div key={t.id} className="toast" role="status">
          {t.msg}
        </div>
      ))}
    </ToastCtx.Provider>
  );
}
