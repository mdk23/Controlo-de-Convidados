/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules);

const seat = <T extends { mesa: number; cadeira: number }>(all: T[], m: number, c: number) =>
  all.find((s) => s.mesa === m && s.cadeira === c);

describe("mesas e lugares", () => {
  test("registar convidado com acompanhante", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "Honra" });
    await expect(t.mutation(api.mesas.create, { numero: 1, nome: "X" })).rejects.toThrow("A mesa 1 já existe.");

    const r = await t.mutation(api.lugares.add, { mesa: 1, cadeira: 3, nome: " Ana ", entrada: false, acompanhante: "Rui" });
    expect(r).toEqual({ cadeira: 3, acompCadeira: 4 });

    const all = await t.query(api.lugares.list, {});
    expect(seat(all, 1, 3)).toMatchObject({ nome: "Ana", tipo: "convidado", de: null });
    expect(seat(all, 1, 4)).toMatchObject({ nome: "Rui", tipo: "acompanhante", de: 3 });
    expect(seat(all, 1, 3)!.codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await expect(t.mutation(api.lugares.add, { mesa: 1, cadeira: 3, nome: "B", entrada: false })).rejects.toThrow(
      "Essa cadeira acabou de ser ocupada.",
    );
  });

  test("mesa cheia: sem cadeira para o acompanhante", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "Cheia" });
    for (let c = 1; c <= 9; c++) await t.mutation(api.lugares.add, { mesa: 1, cadeira: c, nome: `P${c}`, entrada: false });
    await expect(
      t.mutation(api.lugares.add, { mesa: 1, cadeira: 10, nome: "Último", entrada: false, acompanhante: "Extra" }),
    ).rejects.toThrow("Não há cadeira livre nesta mesa para o acompanhante.");
    expect(await t.query(api.lugares.list, {})).toHaveLength(9);
  });

  test("check-in guarda e limpa a hora", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "M" });
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 1, nome: "Ana", entrada: false });
    expect(await t.mutation(api.lugares.toggleEntrada, { mesa: 1, cadeira: 1 })).toEqual({ nome: "Ana", entrada: true });
    let s = seat(await t.query(api.lugares.list, {}), 1, 1)!;
    expect(s.entradaHora).toBeTypeOf("number");
    await t.mutation(api.lugares.toggleEntrada, { mesa: 1, cadeira: 1 });
    s = seat(await t.query(api.lugares.list, {}), 1, 1)!;
    expect(s).toMatchObject({ entrada: false, entradaHora: null });
  });

  test("mudar de cadeira actualiza o acompanhante", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "M" });
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 1, nome: "Ana", entrada: false, acompanhante: "Rui" });
    await t.mutation(api.lugares.update, { mesa: 1, cadeira: 1, novaCadeira: 5, nome: "Ana", entrada: true });
    const all = await t.query(api.lugares.list, {});
    expect(seat(all, 1, 1)).toBeUndefined();
    expect(seat(all, 1, 5)).toMatchObject({ nome: "Ana", entrada: true });
    expect(seat(all, 1, 2)).toMatchObject({ nome: "Rui", de: 5 });

    // a guest without a companion can get one
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 7, nome: "Leo", entrada: false });
    const r = await t.mutation(api.lugares.update, { mesa: 1, cadeira: 7, novaCadeira: 7, nome: "Leo", entrada: false, acompanhante: "Mia" });
    expect(r.acompCadeira).toBe(8);
  });

  test("transferir mantém código e check-in", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "A" });
    await t.mutation(api.mesas.create, { numero: 2, nome: "B" });
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 1, nome: "Ana", entrada: true, acompanhante: "Rui" });
    const before = await t.query(api.lugares.list, {});
    const codigo = seat(before, 1, 1)!.codigo!;

    await expect(
      t.mutation(api.lugares.transfer, { mesa: 1, cadeira: 1, destMesa: 2, destCadeira: 4, destCadeiraAcomp: 4 }),
    ).rejects.toThrow("Escolha cadeiras diferentes");

    const r = await t.mutation(api.lugares.transfer, { mesa: 1, cadeira: 1, destMesa: 2, destCadeira: 4, destCadeiraAcomp: 6 });
    expect(r).toEqual({ nome: "Ana", compNome: "Rui" });
    const all = await t.query(api.lugares.list, {});
    expect(all.filter((s) => s.mesa === 1)).toHaveLength(0);
    expect(seat(all, 2, 4)).toMatchObject({ nome: "Ana", entrada: true, codigo });
    expect(seat(all, 2, 6)).toMatchObject({ nome: "Rui", de: 4 });
    expect(await t.query(api.lugares.byCodigo, { codigo: codigo.toLowerCase() })).toMatchObject({ mesa: 2, cadeira: 4 });
  });

  test("importar mantém código e check-in de quem já está na cadeira", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 3, nome: "Colegas" });
    await t.mutation(api.lugares.add, { mesa: 3, cadeira: 1, nome: "Joana", entrada: true });
    const codigo = seat(await t.query(api.lugares.list, {}), 3, 1)!.codigo;

    await t.mutation(api.lugares.importar, {
      mesas: [{ numero: 3, nome: "Colegas do trabalho" }, { numero: 4, nome: "Vizinhos" }],
      lugares: [
        { mesa: 3, cadeira: 1, nome: "Joana Macuácua", tipo: "convidado", de: null },
        { mesa: 3, cadeira: 2, nome: "Pedro Macuácua", tipo: "acompanhante", de: 1 },
        { mesa: 4, cadeira: 1, nome: "Lúcia Banze", tipo: "convidado", de: null },
      ],
    });
    const mesas = await t.query(api.mesas.list, {});
    expect(mesas.map((m) => [m.numero, m.nome])).toEqual([[3, "Colegas do trabalho"], [4, "Vizinhos"]]);
    const all = await t.query(api.lugares.list, {});
    expect(all).toHaveLength(3);
    expect(seat(all, 3, 1)).toMatchObject({ nome: "Joana Macuácua", entrada: true, codigo });
    expect(seat(all, 3, 2)).toMatchObject({ tipo: "acompanhante", de: 1 });
  });

  test("importar do Excel por convidado dá as cadeiras por ordem", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "Honra" });
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 1, nome: "Já Cá", entrada: true });

    const r = await t.mutation(api.lugares.importarConvidados, {
      mesas: [{ numero: 1, nome: "Honra" }, { numero: 2, nome: "Amigos" }],
      convidados: [
        { mesa: 1, nome: "Ana", acompanhante: "Rui" },
        { mesa: 1, nome: "ja ca" }, // already there (accents/case ignored)
        { mesa: 2, nome: "Leo" },
      ],
    });
    expect(r.pessoas).toBe(3);
    expect(r.ignorados).toEqual([{ mesa: 1, nome: "ja ca", motivo: "já está nesta mesa" }]);
    const all = await t.query(api.lugares.list, {});
    expect(seat(all, 1, 2)).toMatchObject({ nome: "Ana", tipo: "convidado" });
    expect(seat(all, 1, 3)).toMatchObject({ nome: "Rui", tipo: "acompanhante", de: 2 });
    expect(seat(all, 2, 1)).toMatchObject({ nome: "Leo" });

    // importing the same file again adds nobody; a full table is reported
    for (let c = 4; c <= 10; c++) await t.mutation(api.lugares.add, { mesa: 1, cadeira: c, nome: `P${c}`, entrada: false });
    const again = await t.mutation(api.lugares.importarConvidados, {
      mesas: [],
      convidados: [{ mesa: 1, nome: "Ana", acompanhante: "Rui" }, { mesa: 1, nome: "Nova" }],
    });
    expect(again).toEqual({
      pessoas: 0,
      ignorados: [
        { mesa: 1, nome: "Ana", motivo: "já está nesta mesa" },
        { mesa: 1, nome: "Nova", motivo: "mesa cheia" },
      ],
    });
  });

  test("número de lugares por mesa", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "Pequena", cadeiras: 4 });
    await expect(t.mutation(api.lugares.add, { mesa: 1, cadeira: 5, nome: "X", entrada: false })).rejects.toThrow(
      "A cadeira tem de ser de 1 a 4.",
    );
    // the companion wraps round a 4-seat table
    const r = await t.mutation(api.lugares.add, { mesa: 1, cadeira: 4, nome: "Ana", entrada: false, acompanhante: "Rui" });
    expect(r.acompCadeira).toBe(1);

    await t.mutation(api.mesas.rename, { numero: 1, nome: "Grande", cadeiras: 12 });
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 12, nome: "Leo", entrada: false });
    await expect(t.mutation(api.mesas.rename, { numero: 1, nome: "Grande", cadeiras: 8 })).rejects.toThrow(
      "A cadeira 12 está ocupada.",
    );
    await expect(t.mutation(api.mesas.rename, { numero: 1, nome: "Grande", cadeiras: 31 })).rejects.toThrow(
      "O número de lugares tem de ser de 1 a 30.",
    );
    // tables without a seat count keep 10
    await t.mutation(api.mesas.create, { numero: 2, nome: "Normal" });
    expect((await t.query(api.mesas.list, {})).find((m) => m.numero === 2)?.cadeiras).toBe(10);
  });

  test("apagar mesa apaga as pessoas", async () => {
    const t = setup();
    await t.mutation(api.mesas.create, { numero: 1, nome: "A" });
    await t.mutation(api.mesas.create, { numero: 2, nome: "B" });
    await t.mutation(api.lugares.add, { mesa: 1, cadeira: 1, nome: "Ana", entrada: false, acompanhante: "Rui" });
    await t.mutation(api.lugares.add, { mesa: 2, cadeira: 1, nome: "Leo", entrada: false });
    await t.mutation(api.mesas.remove, { numero: 1 });
    expect((await t.query(api.mesas.list, {})).map((m) => m.numero)).toEqual([2]);
    expect((await t.query(api.lugares.list, {})).map((s) => s.nome)).toEqual(["Leo"]);
  });
});
