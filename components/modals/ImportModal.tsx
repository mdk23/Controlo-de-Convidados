"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Modal, useBusy, type ModalProps } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { MAX_SEATS, norm, serverMsg } from "@/lib/util";

const BATCH = 200;
const GUEST_BATCH = 100;

type Row = { mesa: number; cadeira: number; nome: string; tipo: "convidado" | "acompanhante"; de: number | null };
type Guest = { mesa: number; nome: string; acompanhante?: string };
type Result = { pessoas: number; ignorados: { mesa: number; nome: string; motivo: string }[] };

const cells = (l: string) => l.split(/\t|;/).map((x) => x.trim());
const mesaNum = (s: string) => {
  const d = s.match(/\d+/);
  return d ? parseInt(d[0], 10) : NaN;
};

/**
 * Two formats, picked from the header row:
 * - guests (main): Mesa Nº · Nome da Mesa · Convidado · Acompanhante — chairs are given automatically
 * - chairs: N.º mesa; Nome da mesa; N.º cadeira; Nome; Tipo (C ou A); Acompanha cadeira
 */
function parse(txt: string) {
  const lines = txt.split(/\r?\n/).filter((l) => l.replace(/[;\t]/g, "").trim());
  if (!lines.length) return { kind: "empty" as const };
  const head = cells(lines[0]).map(norm);
  const hasHeader = isNaN(mesaNum(cells(lines[0])[0] ?? ""));
  const body = hasHeader ? lines.slice(1) : lines;
  const chairFormat = hasHeader ? head.some((h) => h.includes("cadeira")) : /^\d+$/.test(cells(body[0] ?? "")[2] ?? "");
  const mesas: Record<number, string> = {};
  const bad: number[] = [];
  const first = hasHeader ? 2 : 1; // spreadsheet row number of body[0]

  if (chairFormat) {
    const seats: Row[] = [];
    body.forEach((l, i) => {
      const p = cells(l);
      const n = mesaNum(p[0] ?? ""),
        c = parseInt(p[2], 10);
      if (!(n >= 1) || !(c >= 1 && c <= MAX_SEATS) || !p[3]) return void bad.push(i + first);
      mesas[n] = p[1] || mesas[n] || `Mesa ${n}`;
      const tipo = norm(p[4] || "c").charAt(0) === "a" ? "acompanhante" : "convidado";
      const de = tipo === "acompanhante" ? parseInt(p[5], 10) || null : null;
      seats.push({ mesa: n, cadeira: c, nome: p[3], tipo, de: de && de >= 1 && de <= MAX_SEATS ? de : null });
    });
    return { kind: "chairs" as const, mesas, seats, bad };
  }

  const col = (test: (h: string) => boolean, dflt: number) => {
    const i = hasHeader ? head.findIndex(test) : -1;
    return i >= 0 ? i : dflt;
  };
  const iNomeMesa = col((h) => h.includes("nome") && h.includes("mesa"), 1);
  const iMesa = col((h) => h.includes("mesa") && !h.includes("nome"), 0);
  const iConv = col((h) => h.includes("convidad"), 2);
  const iAcomp = col((h) => h.includes("acompanh"), 3);
  const guests: Guest[] = [];
  let lastMesa = NaN;
  body.forEach((l, i) => {
    const p = cells(l);
    const raw = p[iMesa] ?? "";
    // a blank table number continues the table above (grouped / merged cells)
    const n = raw ? mesaNum(raw) : lastMesa;
    if (!(n >= 1)) return void bad.push(i + first);
    lastMesa = n;
    mesas[n] = p[iNomeMesa] || mesas[n] || `Mesa ${n}`;
    const nome = p[iConv] ?? "",
      acomp = p[iAcomp] ?? "";
    if (nome) guests.push({ mesa: n, nome, acompanhante: acomp || undefined });
    else if (acomp) bad.push(i + first); // companion without a guest
  });
  return { kind: "guests" as const, mesas, guests, bad };
}

export function ImportModal({ close }: ModalProps) {
  const toast = useToast();
  const importar = useMutation(api.lugares.importar);
  const importarConvidados = useMutation(api.lugares.importarConvidados);
  const [txt, setTxt] = useState("");
  const [err, setErr] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  /** reads the first non-empty sheet into the textarea (one line per row, tab separated) */
  const readFile = async (file: File) => {
    setErr("");
    setFileInfo("");
    try {
      let lines: string[];
      const text = /\.(csv|txt)$/i.test(file.name) ? await file.text() : null;
      if (text !== null && /[;\t]/.test(text)) {
        // already in the "a; b; c" or tab format
        lines = text.split(/\r?\n/).filter((l) => l.replace(/[;\t]/g, "").trim());
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(text ?? (await file.arrayBuffer()), { type: text !== null ? "string" : undefined });
        const ws = wb.SheetNames.map((n) => wb.Sheets[n]).find((s) => s["!ref"]);
        const rows = ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false }) : [];
        lines = rows
          .map((r) => r.map((c) => String(c ?? "").replace(/[\t;\r\n]+/g, " ").trim()).join("\t"))
          .filter((l) => l.replace(/\t/g, "").trim());
      }
      if (!lines.length) return setErr("O ficheiro está vazio.");
      setTxt(lines.join("\n"));
      const p = parse(lines.join("\n"));
      const what =
        p.kind === "guests"
          ? `${p.guests.length} convidados em ${Object.keys(p.mesas).length} mesas`
          : p.kind === "chairs"
            ? `${p.seats.length} lugares`
            : "";
      setFileInfo(`${file.name} · ${what}. Confira a lista e carregue em Importar.`);
    } catch {
      setErr("Não foi possível ler o ficheiro. Use .xlsx, .xls, .ods ou .csv.");
    }
  };

  const save = useBusy(async () => {
    setErr("");
    const p = parse(txt);
    if (p.kind === "empty") return setErr("Não encontrei linhas para importar.");
    if (p.bad.length)
      return setErr(
        `Linhas com erro: ${p.bad.slice(0, 8).join(", ")}${p.bad.length > 8 ? "…" : ""}. ` +
          (p.kind === "guests"
            ? "Cada linha precisa do n.º da mesa e do nome do convidado."
            : "O n.º da cadeira e o nome são obrigatórios."),
      );
    const ms = Object.entries(p.mesas).map(([n, nome]) => ({ numero: +n, nome }));

    try {
      if (p.kind === "chairs") {
        if (!p.seats.length) return setErr("Não encontrei linhas para importar.");
        close();
        toast(`A importar ${p.seats.length} lugares…`);
        for (let i = 0; i < p.seats.length; i += BATCH) {
          await importar({ mesas: i === 0 ? ms : [], lugares: p.seats.slice(i, i + BATCH) });
        }
        toast(`${p.seats.length} lugares importados`);
        return;
      }

      const total: Result = { pessoas: 0, ignorados: [] };
      if (!p.guests.length) {
        await importarConvidados({ mesas: ms, convidados: [] });
      }
      for (let i = 0; i < p.guests.length; i += GUEST_BATCH) {
        setProgress(`A importar… ${Math.min(i + GUEST_BATCH, p.guests.length)}/${p.guests.length} convidados`);
        const r = await importarConvidados({ mesas: i === 0 ? ms : [], convidados: p.guests.slice(i, i + GUEST_BATCH) });
        total.pessoas += r.pessoas;
        total.ignorados.push(...r.ignorados);
      }
      setProgress("");
      if (!total.ignorados.length) {
        close();
        toast(`${total.pessoas} pessoas importadas em ${ms.length} mesas`);
      } else {
        setResult(total);
      }
    } catch (e) {
      setProgress("");
      toast(serverMsg(e) ?? "Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  });

  if (result)
    return (
      <Modal onClose={close}>
        <h3>Importação concluída</h3>
        <p className="hint drop-ok">{result.pessoas} pessoas importadas.</p>
        <p className="hint">
          {result.ignorados.length} {result.ignorados.length === 1 ? "linha não entrou" : "linhas não entraram"}:
        </p>
        <ul className="skipped">
          {result.ignorados.map((g, i) => (
            <li key={i}>
              <b>Mesa {g.mesa}</b> · {g.nome} <span className="hint">— {g.motivo}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="btn primary" onClick={close}>
            Fechar
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal onClose={close} onSave={save}>
      <h3>Importar convidados</h3>
      <p className="hint">
        Uma linha por convidado, com estas colunas (a 1.ª linha pode ser o cabeçalho):
        <br />
        <span className="num" style={{ fontSize: 12 }}>
          Mesa Nº · Nome da Mesa · Convidado · Acompanhante
        </span>
        <br />
        As cadeiras são dadas por ordem: o convidado na 1.ª livre e o acompanhante (opcional) logo a seguir. Quem já estiver na mesa não
        é duplicado.
      </p>
      <label
        className={`drop${dragging ? " on" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) readFile(file);
        }}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.ods,.csv,.txt"
          className="sr-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = "";
          }}
        />
        <span className="drop-title">Escolher ficheiro Excel</span>
        <span className="hint">ou arraste-o para aqui · .xlsx, .xls, .ods ou .csv · lê a 1.ª folha</span>
      </label>
      {fileInfo && <p className="hint drop-ok">{fileInfo}</p>}
      <div className="field">
        <label htmlFor="i_txt">Lista (ou cole aqui)</label>
        <textarea
          id="i_txt"
          value={txt}
          onChange={(e) => {
            setTxt(e.target.value);
            setFileInfo("");
          }}
          placeholder={
            "Mesa Nº\tNome da Mesa\tConvidado\tAcompanhante\n3\tColegas\tJoana Macuácua\tPedro Macuácua\n3\tColegas\tLúcia Banze"
          }
        />
      </div>
      <p className="hint">
        Também aceita o formato por cadeira:{" "}
        <span className="num" style={{ fontSize: 12 }}>
          N.º mesa; Nome da mesa; N.º cadeira; Nome; Tipo (C ou A); Acompanha cadeira
        </span>
      </p>
      {err && <p className="err">{err}</p>}
      {progress && <p className="hint">{progress}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={close}>
          Cancelar
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={!!progress}>
          Importar
        </button>
      </div>
    </Modal>
  );
}
