"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { IconQr, IconTransfer } from "@/components/icons";
import { Modal, useBusy, type ModalProps } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { chairs, companionOf, freeAfter, hostName, isAc, seatCount, seatOf, serverMsg } from "@/lib/util";

/** register / edit a person, "Traz acompanhante?", free chair */
export function SeatModal({ m, c, mesaBy, idx, open, close }: ModalProps & { m: number; c: number }) {
  const toast = useToast();
  const add = useMutation(api.lugares.add);
  const update = useMutation(api.lugares.update);
  const free = useMutation(api.lugares.free);

  const mesa = mesaBy.get(m);
  const s = seatOf(idx, m, c);
  const [isNew] = useState(!s);
  const [cad, setCad] = useState(c);
  const [nome, setNome] = useState(s?.nome ?? "");
  const [tel, setTel] = useState(s?.telefone ?? "");
  const [extra, setExtra] = useState("");
  const [extraTel, setExtraTel] = useState("");
  const [ent, setEnt] = useState(!!s?.entrada);
  const [err, setErr] = useState("");

  const tipo = isAc(s) ? "acompanhante" : "convidado";
  const comp = !isNew && tipo === "convidado" ? companionOf(idx, m, c) : null;
  const canAddComp = tipo === "convidado" && !comp;
  const total = seatCount(mesa);
  const extraSeat = freeAfter(idx, m, cad, c, total);
  const host = hostName(idx, s);

  const save = useBusy(async () => {
    const n = nome.trim();
    const x = canAddComp ? extra.trim() : "";
    if (!n) return setErr("Escreva o nome.");
    if (x && !extraSeat) return setErr("Não há cadeira livre nesta mesa para o acompanhante.");
    try {
      const phones = { telefone: tel, acompanhante: x || undefined, acompanhanteTelefone: x ? extraTel : undefined };
      const r = isNew
        ? await add({ mesa: m, cadeira: cad, nome: n, entrada: ent, ...phones })
        : await update({ mesa: m, cadeira: c, novaCadeira: cad, nome: n, entrada: ent, ...phones });
      toast(r.acompCadeira ? `Guardado · acompanhante na cadeira ${r.acompCadeira}` : "Guardado");
      if (isNew) open({ kind: "qr", m, c: cad, nextC: r.acompCadeira });
      else close();
    } catch (e) {
      const msg = serverMsg(e);
      if (msg) setErr(msg);
      else toast("Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  });

  const freeSeat = async () => {
    close();
    try {
      await free({ mesa: m, cadeira: c });
      toast(`Cadeira ${c} da mesa ${m} libertada`);
    } catch {
      toast("Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  };

  if (!mesa) return null;
  return (
    <Modal onClose={close} onSave={save}>
      <h3>
        Mesa {m} · {mesa.nome}
      </h3>
      <div className="row2">
        <div className="field">
          <label htmlFor="f_mesa">N.º da mesa</label>
          <input id="f_mesa" value={m} disabled readOnly />
        </div>
        <div className="field">
          <label htmlFor="f_cad">N.º da cadeira</label>
          <select id="f_cad" value={cad} onChange={(e) => setCad(+e.target.value)}>
            {chairs(total).map((n) => {
              const taken = !!seatOf(idx, m, n) && n !== c;
              return (
                <option key={n} value={n} disabled={taken}>
                  {n}
                  {taken ? " — ocupado" : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="f_nome">{tipo === "convidado" ? "Nome do convidado" : "Nome do acompanhante"}</label>
        <input id="f_nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="f_tel">{tipo === "convidado" ? "Telefone do convidado" : "Telefone do acompanhante"} (opcional)</label>
        <input id="f_tel" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Ex.: 84 123 4567" autoComplete="off" />
      </div>
      {tipo === "acompanhante" && host && (
        <p className="hint">
          Acompanhante de <b>{host}</b> (cadeira {s!.de}).
        </p>
      )}
      {comp && (
        <p className="hint">
          Acompanhante: <b>{comp.nome}</b> (cadeira {comp.cadeira}).
        </p>
      )}
      {canAddComp && (
        <div className="field">
          <label htmlFor="f_extra">Traz acompanhante? (opcional)</label>
          <input id="f_extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Nome do acompanhante" autoComplete="off" />
          <p className="hint">{extraSeat ? `Fica na cadeira ${extraSeat}.` : "Mesa cheia: não há cadeira livre."}</p>
        </div>
      )}
      {canAddComp && extra.trim() && (
        <div className="field">
          <label htmlFor="f_extra_tel">Telefone do acompanhante (opcional)</label>
          <input
            id="f_extra_tel"
            type="tel"
            inputMode="tel"
            value={extraTel}
            onChange={(e) => setExtraTel(e.target.value)}
            placeholder="Ex.: 84 123 4567"
            autoComplete="off"
          />
        </div>
      )}
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
        <input type="checkbox" checked={ent} onChange={(e) => setEnt(e.target.checked)} style={{ width: 18, height: 18 }} /> Check da entrada feito
      </label>
      {err && <p className="err">{err}</p>}
      <div className="actions">
        {s && (
          <button type="button" className="btn danger" onClick={freeSeat}>
            Libertar cadeira
          </button>
        )}
        {s && !isAc(s) && (
          <button type="button" className="btn" onClick={() => open({ kind: "transfer", m, c })}>
            <IconTransfer /> Transferir
          </button>
        )}
        {s && (
          <button type="button" className="btn" onClick={() => open({ kind: "qr", m, c })}>
            <IconQr /> QR code
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={close}>
          Cancelar
        </button>
        <button type="button" className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}
