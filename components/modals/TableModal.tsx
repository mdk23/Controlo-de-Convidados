"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Modal, useBusy, type ModalProps } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { MAX_SEATS, SEATS, seatCount, serverMsg } from "@/lib/util";

/** new table, rename, number of seats, delete (with inline confirm) */
export function TableModal({ m, mesas, mesaBy, idx, close }: ModalProps & { m: number | null }) {
  const toast = useToast();
  const create = useMutation(api.mesas.create);
  const rename = useMutation(api.mesas.rename);
  const remove = useMutation(api.mesas.remove);

  const isNew = m == null;
  const mesa = isNew ? undefined : mesaBy.get(m);
  const [num, setNum] = useState(() => String(isNew ? mesas.reduce((x, t) => Math.max(x, t.numero), 0) + 1 : m));
  const [nome, setNome] = useState(mesa?.nome ?? "");
  const [lugares, setLugares] = useState(() => String(isNew ? SEATS : seatCount(mesa)));
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);

  // highest occupied chair: the table can't go below it
  let lastTaken = 0;
  if (!isNew) for (const s of idx.values()) if (s.mesa === m && s.cadeira > lastTaken) lastTaken = s.cadeira;

  const save = useBusy(async () => {
    const n = +num,
      nm = nome.trim(),
      cad = +lugares;
    if (!Number.isInteger(n) || n < 1) return setErr("Indique um número de mesa válido.");
    if (isNew && mesaBy.has(n)) return setErr(`A mesa ${n} já existe.`);
    if (!nm) return setErr("Dê um nome à mesa.");
    if (!Number.isInteger(cad) || cad < 1 || cad > MAX_SEATS) return setErr(`O número de lugares tem de ser de 1 a ${MAX_SEATS}.`);
    if (cad < lastTaken)
      return setErr(`A cadeira ${lastTaken} está ocupada. Liberte ou mude essa pessoa antes de reduzir para ${cad} lugares.`);
    try {
      if (isNew) await create({ numero: n, nome: nm, cadeiras: cad });
      else await rename({ numero: n, nome: nm, cadeiras: cad });
      close();
      toast(isNew ? `Mesa ${n} criada` : "Guardado");
    } catch (e) {
      const msg = serverMsg(e);
      if (msg) setErr(msg);
      else toast("Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  });

  const del = async () => {
    if (m == null) return;
    close();
    try {
      await remove({ numero: m });
      toast(`Mesa ${m} apagada`);
    } catch {
      toast("Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  };

  return (
    <Modal onClose={close} onSave={save}>
      <h3>{isNew ? "Nova mesa" : `Mesa ${m}`}</h3>
      <div className="row2">
        <div className="field">
          <label htmlFor="t_num">N.º da mesa</label>
          <input id="t_num" type="number" min={1} inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} disabled={!isNew} />
        </div>
        <div className="field">
          <label htmlFor="t_lug">Lugares</label>
          <input
            id="t_lug"
            type="number"
            min={Math.max(1, lastTaken)}
            max={MAX_SEATS}
            inputMode="numeric"
            value={lugares}
            onChange={(e) => setLugares(e.target.value)}
          />
        </div>
      </div>
      <p className="hint">
        Cadeiras numeradas de 1 a {+lugares >= 1 ? Math.min(+lugares, MAX_SEATS) : "…"} (máximo {MAX_SEATS}).
        {lastTaken > 0 && ` A cadeira ocupada mais alta é a ${lastTaken}.`}
      </p>
      <div className="field">
        <label htmlFor="t_nome">Nome da mesa</label>
        <input id="t_nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Família do Noivo" autoComplete="off" />
      </div>
      {err && <p className="err">{err}</p>}
      {confirm && (
        <div className="note" style={{ margin: 0 }}>
          <span>Apagar a mesa {m} e todos os seus convidados?</span>
          <button type="button" className="btn danger" onClick={del}>
            Sim, apagar
          </button>
        </div>
      )}
      <div className="actions">
        {!isNew && (
          <button type="button" className="btn danger" onClick={() => setConfirm(true)}>
            Apagar mesa
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={close}>
          Cancelar
        </button>
        <button type="button" className="btn primary" onClick={save}>
          {isNew ? "Criar mesa" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
