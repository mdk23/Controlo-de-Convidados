"use client";

import { useState } from "react";
import { Modal, type ModalProps } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { chairs, companionOf, hhmm, hostName, isAc, seatCount, seatOf, type Lugar } from "@/lib/util";

const LINE = "-".repeat(32);
const FOOT = "Desenvolvido por Xalima";

/** receipt-style summary of one table, or of one person on it (click a name); copied as plain text */
export function TicketModal({ m, mesaBy, idx, close }: ModalProps & { m: number }) {
  const toast = useToast();
  const [pick, setPick] = useState<number | null>(null);
  const mesa = mesaBy.get(m);
  if (!mesa) return null;

  const total = seatCount(mesa);
  const people = chairs(total).flatMap((c) => {
    const s = seatOf(idx, m, c);
    return s ? [s] : [];
  });
  const who = (s: Lugar) => {
    const host = hostName(idx, s);
    return isAc(s) ? `Acompanhante${host ? " de " + host : ""}` : "Convidado";
  };
  const status = (s: Lugar) => (s.entrada ? `Entrou ${hhmm(s.entradaHora)}`.trim() : "Por entrar");
  const row = (k: string, v: string) => `${(k + ":").padEnd(16)}${v}`;

  // person picked but since removed or moved: back to the table
  const p = pick != null ? seatOf(idx, m, pick) : undefined;

  let title: string, sub: string, rows: [string, string][], text: string, totalLabel: string, totalValue: string;
  if (p) {
    const comp = isAc(p) ? null : companionOf(idx, m, p.cadeira);
    const host = hostName(idx, p);
    rows = [
      ["Mesa", `${m} · ${mesa.nome}`],
      ["Cadeira", String(p.cadeira)],
      ["Tipo", isAc(p) ? "Acompanhante" : "Convidado"],
      ...(host ? ([["Acompanha", `${host} (cadeira ${p.de})`]] as [string, string][]) : []),
      ...(comp ? ([["Acompanhante", `${comp.nome} (cadeira ${comp.cadeira})`]] as [string, string][]) : []),
      ["Código", p.codigo ?? "—"],
    ];
    title = p.nome;
    sub = `Mesa ${m} · Cadeira ${p.cadeira}`;
    totalLabel = "ENTRADA";
    totalValue = status(p);
    text = [p.nome.toUpperCase(), sub, LINE, ...rows.map(([k, v]) => row(k, v)), LINE, row("Entrada", totalValue), LINE, FOOT].join("\n");
  } else {
    const inn = people.filter((s) => s.entrada).length;
    const conv = people.filter((s) => !isAc(s)).length;
    rows = [
      ["Lugares", String(total)],
      ["Ocupados", String(people.length)],
      ["Livres", String(total - people.length)],
      ["Convidados", String(conv)],
      ["Acompanhantes", String(people.length - conv)],
      ["Entraram", `${inn}/${people.length}`],
    ];
    title = `MESA ${m}`;
    sub = mesa.nome;
    totalLabel = "TOTAL ENTRARAM";
    totalValue = `${inn}/${people.length}`;
    text = [
      title,
      sub,
      LINE,
      ...rows.map(([k, v]) => row(k, v)),
      LINE,
      ...(people.length
        ? people.map((s) => `${s.cadeira}. ${s.nome} (${who(s)})${s.entrada ? " ✓ " + hhmm(s.entradaHora) : ""}`.trimEnd())
        : ["Sem convidados"]),
      LINE,
      FOOT,
    ].join("\n");
  }

  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast("Ticket copiado"))
      .catch(() => toast("Não foi possível copiar."));
  };

  return (
    <Modal onClose={close}>
      <div className="ticket">
        <div className="ticket-head">
          <div className="ticket-title">{title}</div>
          <div className="ticket-sub">{sub}</div>
        </div>
        <dl className="ticket-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}:</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {!p && (
          <ul className="ticket-people">
            {people.length ? (
              people.map((s) => (
                <li key={s.cadeira}>
                  <button type="button" onClick={() => setPick(s.cadeira)}>
                    <span>
                      {s.cadeira}. {s.nome}
                      <small>{who(s)}</small>
                    </span>
                    <b className={s.entrada ? "in" : undefined}>{status(s)}</b>
                  </button>
                </li>
              ))
            ) : (
              <li>Sem convidados</li>
            )}
          </ul>
        )}
        <div className={`ticket-total${p ? " solo" : ""}`}>
          <span>{totalLabel}</span>
          <b className={p && !p.entrada ? "out" : undefined}>{totalValue}</b>
        </div>
        <div className="ticket-foot">{FOOT}</div>
      </div>
      <div className="actions">
        {p && (
          <button type="button" className="btn" onClick={() => setPick(null)}>
            ← Mesa {m}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={close}>
          Fechar
        </button>
        <button type="button" className="btn primary" onClick={copy}>
          Copiar ticket
        </button>
      </div>
    </Modal>
  );
}
