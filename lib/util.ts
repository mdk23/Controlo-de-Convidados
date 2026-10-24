import { ConvexError } from "convex/values";
import type { Doc } from "@/convex/_generated/dataModel";

export type Mesa = Doc<"mesas">;
export type Lugar = Doc<"lugares">;
export type Seats = Map<string, Lugar>;

/** default seats per table, and the most a table can have */
export const SEATS = 10;
export const MAX_SEATS = 30;
export const CHAIRS = Array.from({ length: SEATS }, (_, i) => i + 1);

export const seatCount = (m: Mesa | null | undefined) => m?.cadeiras ?? SEATS;
export const chairs = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** lower case, accents removed */
export const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const hhmm = (ms: number | null | undefined) => {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export const isAc = (s: Lugar | null | undefined) => !!s && s.tipo === "acompanhante";

export const seatKey = (m: number, c: number) => `${m}-${c}`;

export function indexSeats(lugares: Lugar[]): Seats {
  const idx: Seats = new Map();
  for (const s of lugares) idx.set(seatKey(s.mesa, s.cadeira), s);
  return idx;
}

export const seatOf = (idx: Seats, m: number, c: number) => idx.get(seatKey(m, c));

/** name of the guest an acompanhante accompanies */
export function hostName(idx: Seats, s: Lugar | undefined) {
  if (!s || !isAc(s) || !s.de) return "";
  const h = seatOf(idx, s.mesa, s.de);
  return h && !isAc(h) ? h.nome : "";
}

export function companionOf(idx: Seats, m: number, c: number) {
  for (let n = 1; n <= MAX_SEATS; n++) {
    const o = seatOf(idx, m, n);
    if (o && isAc(o) && o.de === c) return o;
  }
  return null;
}

export const freeSeats = (idx: Seats, m: number, total = SEATS) => chairs(total).filter((n) => !seatOf(idx, m, n));

/** next free chair after `cad`, going round the table; the person's current chair `c` counts as free when moving */
export function freeAfter(idx: Seats, m: number, cad: number, c: number, total = SEATS) {
  for (let k = 1; k < total; k++) {
    const n = ((cad - 1 + k) % total) + 1;
    if (!seatOf(idx, m, n) || (n === c && cad !== c)) return n;
  }
  return null;
}

/** a linked acompanhante is transferred through their guest */
export function transferChair(idx: Seats, s: Lugar) {
  const h = isAc(s) && s.de ? seatOf(idx, s.mesa, s.de) : undefined;
  return h && !isAc(h) ? s.de! : s.cadeira;
}

export function qrLink(code: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
  return base.replace(/\/$/, "") + "/#c-" + code;
}

/** Portuguese message thrown by a mutation, or null for network/unknown errors */
export const serverMsg = (e: unknown) => (e instanceof ConvexError ? String(e.data) : null);
