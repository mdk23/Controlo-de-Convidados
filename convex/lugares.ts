import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { tipo } from "./schema";
import {
  MSG,
  seatCount,
  checkCadeira,
  cleanNome,
  companionOf,
  fail,
  freeAfter,
  getMesa,
  getSeat,
  isAc,
  newCodigo,
  requireMesa,
  seatsOf,
} from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("lugares").collect();
  },
});

export const byCodigo = query({
  args: { codigo: v.string() },
  handler: async (ctx, { codigo }) => {
    return await ctx.db
      .query("lugares")
      .withIndex("by_codigo", (q) => q.eq("codigo", codigo.trim().toUpperCase()))
      .first();
  },
});

async function requireSeat(ctx: Parameters<typeof getSeat>[0], mesa: number, cadeira: number) {
  return (await getSeat(ctx, mesa, cadeira)) ?? fail(MSG.livre);
}

/** new guest; the companion goes to the next free chair */
export const add = mutation({
  args: {
    mesa: v.number(),
    cadeira: v.number(),
    nome: v.string(),
    entrada: v.boolean(),
    acompanhante: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const total = seatCount(await requireMesa(ctx, a.mesa));
    checkCadeira(a.cadeira, total);
    const nome = cleanNome(a.nome);
    const extra = a.acompanhante?.trim() ?? "";
    const seats = await seatsOf(ctx, a.mesa);
    if (seats.some((s) => s.cadeira === a.cadeira)) fail(MSG.ocupada);
    const acompCadeira = extra ? freeAfter(seats, a.cadeira, undefined, total) ?? fail(MSG.semCadeiraAcomp) : null;

    await ctx.db.insert("lugares", {
      mesa: a.mesa,
      cadeira: a.cadeira,
      nome,
      tipo: "convidado",
      de: null,
      codigo: await newCodigo(ctx),
      entrada: a.entrada,
      entradaHora: a.entrada ? Date.now() : null,
    });
    if (acompCadeira !== null) {
      await ctx.db.insert("lugares", {
        mesa: a.mesa,
        cadeira: acompCadeira,
        nome: extra,
        tipo: "acompanhante",
        de: a.cadeira,
        codigo: await newCodigo(ctx),
        entrada: false,
        entradaHora: null,
      });
    }
    return { cadeira: a.cadeira, acompCadeira };
  },
});

/** edit a person; moving chair updates the companion's `de`; a guest without a companion can get one */
export const update = mutation({
  args: {
    mesa: v.number(),
    cadeira: v.number(),
    novaCadeira: v.number(),
    nome: v.string(),
    entrada: v.boolean(),
    acompanhante: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const total = seatCount(await requireMesa(ctx, a.mesa));
    checkCadeira(a.novaCadeira, total);
    const nome = cleanNome(a.nome);
    const s = await requireSeat(ctx, a.mesa, a.cadeira);
    const seats = await seatsOf(ctx, a.mesa);
    const moved = a.novaCadeira !== a.cadeira;
    if (moved && seats.some((o) => o.cadeira === a.novaCadeira)) fail(MSG.ocupada);

    const extra = s.tipo === "convidado" && !companionOf(seats, a.cadeira) ? a.acompanhante?.trim() ?? "" : "";
    const acompCadeira = extra
      ? freeAfter(seats, a.novaCadeira, a.cadeira, total) ?? fail(MSG.semCadeiraAcomp)
      : null;

    await ctx.db.patch(s._id, {
      cadeira: a.novaCadeira,
      nome,
      codigo: s.codigo ?? (await newCodigo(ctx)),
      entrada: a.entrada,
      entradaHora: a.entrada ? (s.entrada ? s.entradaHora : Date.now()) : null,
    });
    if (moved) {
      for (const o of seats) if (isAc(o) && o.de === a.cadeira) await ctx.db.patch(o._id, { de: a.novaCadeira });
    }
    if (acompCadeira !== null) {
      await ctx.db.insert("lugares", {
        mesa: a.mesa,
        cadeira: acompCadeira,
        nome: extra,
        tipo: "acompanhante",
        de: a.novaCadeira,
        codigo: await newCodigo(ctx),
        entrada: false,
        entradaHora: null,
      });
    }
    return { cadeira: a.novaCadeira, acompCadeira };
  },
});

/** "Libertar cadeira" */
export const free = mutation({
  args: { mesa: v.number(), cadeira: v.number() },
  handler: async (ctx, { mesa, cadeira }) => {
    const s = await getSeat(ctx, mesa, cadeira);
    if (s) await ctx.db.delete(s._id);
  },
});

export const toggleEntrada = mutation({
  args: { mesa: v.number(), cadeira: v.number() },
  handler: async (ctx, { mesa, cadeira }) => {
    const s = await requireSeat(ctx, mesa, cadeira);
    const entrada = !s.entrada;
    await ctx.db.patch(s._id, { entrada, entradaHora: entrada ? Date.now() : null });
    return { nome: s.nome, entrada };
  },
});

/** guest + companion move together; code and check-in are kept */
export const transfer = mutation({
  args: {
    mesa: v.number(),
    cadeira: v.number(),
    destMesa: v.number(),
    destCadeira: v.number(),
    destCadeiraAcomp: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    if (a.destMesa === a.mesa) fail(MSG.mesmaMesa);
    const total = seatCount(await requireMesa(ctx, a.destMesa));
    checkCadeira(a.destCadeira, total);
    const p = await requireSeat(ctx, a.mesa, a.cadeira);
    const comp = isAc(p) ? null : companionOf(await seatsOf(ctx, a.mesa), a.cadeira);
    const dest = await seatsOf(ctx, a.destMesa);
    const taken = new Set(dest.map((s) => s.cadeira));
    if (taken.has(a.destCadeira)) fail(MSG.ocupada);

    let dc2: number | null = null;
    if (comp) {
      dc2 = a.destCadeiraAcomp ?? freeAfter(dest, a.destCadeira, undefined, total) ?? fail(MSG.semCadeiraAcomp);
      checkCadeira(dc2, total);
      if (dc2 === a.destCadeira) fail(MSG.cadeirasIguais);
      if (taken.has(dc2)) fail(MSG.ocupada);
    }

    await ctx.db.patch(p._id, {
      mesa: a.destMesa,
      cadeira: a.destCadeira,
      de: isAc(p) ? null : p.de,
      codigo: p.codigo ?? (await newCodigo(ctx)),
    });
    if (comp && dc2 !== null) {
      await ctx.db.patch(comp._id, { mesa: a.destMesa, cadeira: dc2, de: a.destCadeira });
    }
    return { nome: p.nome, compNome: comp?.nome ?? null };
  },
});

/** gives a code to older records that have none */
export const ensureCodigo = mutation({
  args: { mesa: v.number(), cadeira: v.number() },
  handler: async (ctx, { mesa, cadeira }) => {
    const s = await requireSeat(ctx, mesa, cadeira);
    if (s.codigo) return s.codigo;
    const codigo = await newCodigo(ctx);
    await ctx.db.patch(s._id, { codigo });
    return codigo;
  },
});

/** paste import (the client sends batches); keeps the code and check-in of people already in those chairs */
export const importar = mutation({
  args: {
    mesas: v.array(v.object({ numero: v.number(), nome: v.string() })),
    lugares: v.array(
      v.object({
        mesa: v.number(),
        cadeira: v.number(),
        nome: v.string(),
        tipo,
        de: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (ctx, a) => {
    await upsertMesas(ctx, a.mesas);
    for (const l of a.lugares) {
      const total = await ensureMesa(ctx, l.mesa);
      checkCadeira(l.cadeira, total);
      const nome = cleanNome(l.nome);
      const de = l.tipo === "acompanhante" && l.de !== null && l.de >= 1 && l.de <= total ? l.de : null;
      const old = await getSeat(ctx, l.mesa, l.cadeira);
      const data = {
        mesa: l.mesa,
        cadeira: l.cadeira,
        nome,
        tipo: l.tipo,
        de,
        codigo: old?.codigo ?? (await newCodigo(ctx)),
        entrada: old?.entrada ?? false,
        entradaHora: old?.entrada ? old.entradaHora : null,
      };
      if (old) await ctx.db.replace(old._id, data);
      else await ctx.db.insert("lugares", data);
    }
    return { count: a.lugares.length };
  },
});

/**
 * Excel import, one row per guest: Mesa Nº · Nome da Mesa · Convidado · Acompanhante.
 * Chairs are given in order (guest, then companion in the next free chair). Guests already at that
 * table are skipped, so importing the same file twice adds nobody; rows that don't fit are reported.
 */
export const importarConvidados = mutation({
  args: {
    mesas: v.array(v.object({ numero: v.number(), nome: v.string() })),
    convidados: v.array(v.object({ mesa: v.number(), nome: v.string(), acompanhante: v.optional(v.string()) })),
  },
  handler: async (ctx, a) => {
    await upsertMesas(ctx, a.mesas);
    let pessoas = 0;
    const ignorados: { mesa: number; nome: string; motivo: string }[] = [];
    for (const g of a.convidados) {
      const nome = g.nome.trim(),
        acomp = g.acompanhante?.trim() ?? "";
      if (!nome) continue;
      if (!Number.isInteger(g.mesa) || g.mesa < 1) {
        ignorados.push({ mesa: g.mesa, nome, motivo: "n.º de mesa inválido" });
        continue;
      }
      const total = await ensureMesa(ctx, g.mesa);
      const seats = await seatsOf(ctx, g.mesa);
      if (seats.some((s) => s.tipo === "convidado" && simple(s.nome) === simple(nome))) {
        ignorados.push({ mesa: g.mesa, nome, motivo: "já está nesta mesa" });
        continue;
      }
      const taken = new Set(seats.map((s) => s.cadeira));
      const free = Array.from({ length: total }, (_, i) => i + 1).filter((c) => !taken.has(c));
      if (free.length < (acomp ? 2 : 1)) {
        ignorados.push({ mesa: g.mesa, nome, motivo: acomp ? "mesa sem 2 cadeiras livres" : "mesa cheia" });
        continue;
      }
      await ctx.db.insert("lugares", {
        mesa: g.mesa,
        cadeira: free[0],
        nome,
        tipo: "convidado",
        de: null,
        codigo: await newCodigo(ctx),
        entrada: false,
        entradaHora: null,
      });
      pessoas++;
      if (acomp) {
        await ctx.db.insert("lugares", {
          mesa: g.mesa,
          cadeira: free[1],
          nome: acomp,
          tipo: "acompanhante",
          de: free[0],
          codigo: await newCodigo(ctx),
          entrada: false,
          entradaHora: null,
        });
        pessoas++;
      }
    }
    return { pessoas, ignorados };
  },
});

const simple = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

async function upsertMesas(ctx: MutationCtx, mesas: { numero: number; nome: string }[]) {
  for (const m of mesas) {
    if (!Number.isInteger(m.numero) || m.numero < 1) fail(MSG.mesaInvalida);
    const nome = m.nome.trim() || `Mesa ${m.numero}`;
    const cur = await getMesa(ctx, m.numero);
    if (!cur) await ctx.db.insert("mesas", { numero: m.numero, nome });
    else if (cur.nome !== nome) await ctx.db.patch(cur._id, { nome });
  }
}

/** creates the table if needed; returns its number of seats */
async function ensureMesa(ctx: MutationCtx, numero: number) {
  const m = await getMesa(ctx, numero);
  if (!m) await ctx.db.insert("mesas", { numero, nome: `Mesa ${numero}` });
  return seatCount(m);
}
