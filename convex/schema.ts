import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const tipo = v.union(v.literal("convidado"), v.literal("acompanhante"));

export default defineSchema({
  mesas: defineTable({
    numero: v.number(),
    nome: v.string(),
    cadeiras: v.optional(v.number()), // number of seats; missing = 10
  }).index("by_numero", ["numero"]),

  // one document per occupied chair = one person
  lugares: defineTable({
    mesa: v.number(),
    cadeira: v.number(),
    nome: v.string(),
    tipo,
    de: v.union(v.number(), v.null()), // acompanhante: chair of the guest they accompany
    codigo: v.optional(v.string()), // 6-char QR code, never changes
    entrada: v.boolean(),
    entradaHora: v.union(v.number(), v.null()), // ms
  })
    .index("by_mesa_cadeira", ["mesa", "cadeira"])
    .index("by_codigo", ["codigo"]),
});
