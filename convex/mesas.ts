import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MSG, SEATS, checkLugares, cleanNome, fail, getMesa, requireMesa, seatsOf } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("mesas").withIndex("by_numero").collect();
  },
});

export const create = mutation({
  args: { numero: v.number(), nome: v.string(), cadeiras: v.optional(v.number()) },
  handler: async (ctx, { numero, nome, cadeiras = SEATS }) => {
    if (!Number.isInteger(numero) || numero < 1) fail(MSG.mesaInvalida);
    checkLugares(cadeiras);
    if (await getMesa(ctx, numero)) fail(MSG.mesaExiste(numero));
    await ctx.db.insert("mesas", { numero, nome: cleanNome(nome, MSG.nomeMesa), cadeiras });
  },
});

/** rename and/or change the number of seats; fewer seats only when the removed chairs are free */
export const rename = mutation({
  args: { numero: v.number(), nome: v.string(), cadeiras: v.optional(v.number()) },
  handler: async (ctx, { numero, nome, cadeiras }) => {
    const mesa = await requireMesa(ctx, numero);
    const patch: { nome: string; cadeiras?: number } = { nome: cleanNome(nome, MSG.nomeMesa) };
    if (cadeiras !== undefined) {
      checkLugares(cadeiras);
      const beyond = (await seatsOf(ctx, numero)).filter((s) => s.cadeira > cadeiras).sort((a, b) => a.cadeira - b.cadeira);
      if (beyond.length) fail(MSG.lugaresOcupados(beyond[0].cadeira, cadeiras));
      patch.cadeiras = cadeiras;
    }
    await ctx.db.patch(mesa._id, patch);
  },
});

/** deletes the table and its people */
export const remove = mutation({
  args: { numero: v.number() },
  handler: async (ctx, { numero }) => {
    for (const s of await seatsOf(ctx, numero)) await ctx.db.delete(s._id);
    const mesa = await getMesa(ctx, numero);
    if (mesa) await ctx.db.delete(mesa._id);
  },
});
