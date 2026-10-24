import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** default seats per table, and the most a table can have */
export const SEATS = 10;
export const MAX_SEATS = 30;

export const seatCount = (m: Doc<"mesas"> | null | undefined) => m?.cadeiras ?? SEATS;

export const MSG = {
  mesaInvalida: "Indique um número de mesa válido.",
  mesaExiste: (n: number) => `A mesa ${n} já existe.`,
  mesaNaoExiste: (n: number) => `A mesa ${n} não existe.`,
  nomeMesa: "Dê um nome à mesa.",
  nome: "Escreva o nome.",
  cadeiraInvalida: (n: number) => `A cadeira tem de ser de 1 a ${n}.`,
  lugaresInvalidos: `O número de lugares tem de ser de 1 a ${MAX_SEATS}.`,
  lugaresOcupados: (c: number, n: number) =>
    `A cadeira ${c} está ocupada. Liberte ou mude essa pessoa antes de reduzir para ${n} lugares.`,
  ocupada: "Essa cadeira acabou de ser ocupada. Escolha outra.",
  livre: "Esta cadeira já não está ocupada.",
  semCadeiraAcomp: "Não há cadeira livre nesta mesa para o acompanhante.",
  cadeirasIguais: "Escolha cadeiras diferentes para o convidado e o acompanhante.",
  mesmaMesa: "Escolha outra mesa.",
};

export const fail = (msg: string): never => {
  throw new ConvexError(msg);
};

export function checkCadeira(c: number, n = SEATS) {
  if (!Number.isInteger(c) || c < 1 || c > n) fail(MSG.cadeiraInvalida(n));
}

export function checkLugares(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEATS) fail(MSG.lugaresInvalidos);
}

export async function getMesa(ctx: QueryCtx, numero: number) {
  return await ctx.db
    .query("mesas")
    .withIndex("by_numero", (q) => q.eq("numero", numero))
    .unique();
}

export async function requireMesa(ctx: QueryCtx, numero: number) {
  return (await getMesa(ctx, numero)) ?? fail(MSG.mesaNaoExiste(numero));
}

export async function getSeat(ctx: QueryCtx, mesa: number, cadeira: number) {
  return await ctx.db
    .query("lugares")
    .withIndex("by_mesa_cadeira", (q) => q.eq("mesa", mesa).eq("cadeira", cadeira))
    .first();
}

export async function seatsOf(ctx: QueryCtx, mesa: number) {
  return await ctx.db
    .query("lugares")
    .withIndex("by_mesa_cadeira", (q) => q.eq("mesa", mesa))
    .collect();
}

export const isAc = (s: Doc<"lugares"> | null | undefined) => !!s && s.tipo === "acompanhante";

export function companionOf(seats: Doc<"lugares">[], cadeira: number) {
  return seats.find((o) => o.tipo === "acompanhante" && o.de === cadeira) ?? null;
}

/** next free chair after `cad`, going round the table; `vacated` counts as free */
export function freeAfter(seats: Doc<"lugares">[], cad: number, vacated: number | undefined, total: number) {
  const taken = new Set(seats.map((s) => s.cadeira));
  if (vacated !== undefined && vacated !== cad) taken.delete(vacated);
  for (let k = 1; k < total; k++) {
    const n = ((cad - 1 + k) % total) + 1;
    if (!taken.has(n)) return n;
  }
  return null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function newCodigo(ctx: MutationCtx) {
  for (;;) {
    let r = "";
    for (let i = 0; i < 6; i++) r += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const dup = await ctx.db
      .query("lugares")
      .withIndex("by_codigo", (q) => q.eq("codigo", r))
      .first();
    if (!dup) return r;
  }
}

export function cleanNome(nome: string, msg = MSG.nome) {
  const n = nome.trim();
  if (!n) fail(msg);
  return n;
}
