"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { IconTransfer } from "@/components/icons";
import { Modal, useBusy, type ModalProps } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { companionOf, freeSeats, isAc, seatCount, seatOf, serverMsg } from "@/lib/util";

/** move to another table (with companion) */
export function TransferModal({ m, c, mesas, idx, close }: ModalProps & { m: number; c: number }) {
  const toast = useToast();
  const transfer = useMutation(api.lugares.transfer);

  const p = seatOf(idx, m, c);
  const comp = p && !isAc(p) ? companionOf(idx, m, c) : null;
  const need = comp ? 2 : 1;
  const dests = mesas.filter((t) => t.numero !== m);
  const firstOk = dests.find((t) => freeSeats(idx, t.numero, seatCount(t)).length >= need);

  const [dm, setDm] = useState(firstOk?.numero ?? 0);
  const [pick, setPick] = useState<{ dc?: number; dc2?: number }>({});
  const [err, setErr] = useState("");

  // chairs are chosen for you and can be changed; stale picks fall back to the first free ones
  const fr = freeSeats(idx, dm, seatCount(mesas.find((t) => t.numero === dm)));
  const dc = pick.dc !== undefined && fr.includes(pick.dc) ? pick.dc : fr[0];
  const dc2 = pick.dc2 !== undefined && fr.includes(pick.dc2) ? pick.dc2 : fr.find((n) => n !== dc);

  // keep the two chairs different
  const changeDc = (a: number) => setPick({ dc: a, dc2: dc2 === a ? fr[(fr.indexOf(a) + 1) % fr.length] : dc2 });

  const save = useBusy(async () => {
    if (!p || dc === undefined) return;
    if (comp && dc === dc2) return setErr("Escolha cadeiras diferentes para o convidado e o acompanhante.");
    try {
      const r = await transfer({ mesa: m, cadeira: c, destMesa: dm, destCadeira: dc, destCadeiraAcomp: comp ? dc2 : undefined });
      close();
      toast(`${r.nome}${r.compNome ? " e " + r.compNome : ""} → mesa ${dm}`);
    } catch (e) {
      const msg = serverMsg(e);
      if (msg) setErr(msg);
      else toast("Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  });

  if (!p) return null;
  return (
    <Modal onClose={close} onSave={save}>
      <h3>Transferir {p.nome}</h3>
      <p className="hint">
        Está na <b>mesa {m}</b>, cadeira {c}
        {comp && (
          <>
            , com o acompanhante <b>{comp.nome}</b> (cadeira {comp.cadeira}). Os dois mudam juntos
          </>
        )}
        {isAc(p) && ". Muda só este acompanhante"}.
      </p>
      {firstOk ? (
        <>
          <div className="field">
            <label htmlFor="x_mesa">Para a mesa</label>
            <select
              id="x_mesa"
              value={dm}
              onChange={(e) => {
                setDm(+e.target.value);
                setPick({});
              }}
            >
              {dests.map((t) => {
                const n = freeSeats(idx, t.numero, seatCount(t)).length,
                  ok = n >= need;
                return (
                  <option key={t.numero} value={t.numero} disabled={!ok}>
                    Mesa {t.numero} · {t.nome} — {n} {n === 1 ? "livre" : "livres"}
                    {ok ? "" : " (sem espaço)"}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="x_cad">Cadeira {isAc(p) ? "" : "do convidado"}</label>
              <select id="x_cad" value={dc} onChange={(e) => changeDc(+e.target.value)}>
                {fr.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {comp && (
              <div className="field">
                <label htmlFor="x_cad2">Cadeira do acompanhante</label>
                <select id="x_cad2" value={dc2} onChange={(e) => setPick({ dc, dc2: +e.target.value })}>
                  {fr.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {err && <p className="err">{err}</p>}
          <div className="actions">
            <span className="spacer" />
            <button type="button" className="btn" onClick={close}>
              Cancelar
            </button>
            <button type="button" className="btn primary" onClick={save}>
              <IconTransfer /> Transferir
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="err">
            Nenhuma outra mesa tem {need === 2 ? "2 cadeiras livres" : "uma cadeira livre"}. Crie uma mesa nova ou liberte cadeiras primeiro.
          </p>
          <div className="actions">
            <span className="spacer" />
            <button type="button" className="btn" onClick={close}>
              Fechar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
