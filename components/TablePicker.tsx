"use client";

import { useState } from "react";
import { chairs, norm, seatCount, seatOf, type Mesa, type Seats } from "@/lib/util";

function counts(idx: Seats, n: number, total: number) {
  let occ = 0,
    inn = 0;
  for (const c of chairs(total)) {
    const s = seatOf(idx, n, c);
    if (s) {
      occ++;
      if (s.entrada) inn++;
    }
  }
  return { occ, inn };
}

/**
 * "bar": one compact line (Todas · selected table · picker button) that opens a grid of numbered tiles.
 * "side": the same grid, always open, for the left sidebar on wide screens.
 */
export function TablePicker({
  mesas,
  idx,
  sel,
  onChoose,
  variant,
}: {
  mesas: Mesa[];
  idx: Seats;
  sel: number | null;
  onChoose: (n: number | null) => void;
  variant: "bar" | "side";
}) {
  const side = variant === "side";
  const [isOpen, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const open = side || isOpen;
  if (!mesas.length) return null;

  const pick = (n: number | null) => {
    onChoose(n);
    if (!side) {
      setOpen(false);
      setFind("");
    }
  };
  const pos = sel == null ? -1 : mesas.findIndex((m) => m.numero === sel);
  const cur = pos >= 0 ? mesas[pos] : null;
  const curCount = cur ? counts(idx, cur.numero, seatCount(cur)) : null;

  const fq = norm(find.trim());
  const shown = fq ? mesas.filter((m) => String(m.numero).startsWith(fq) || norm(m.nome).includes(fq)) : mesas;

  return (
    <div className={`tpick tpick-${variant}`}>
      <div className="tpick-row">
        <button className="chip" aria-pressed={sel == null} onClick={() => pick(null)}>
          Todas
        </button>
        {cur && curCount && (
          <div className="tpick-cur">
            <button
              className="tpick-step"
              aria-label="Mesa anterior"
              disabled={pos <= 0}
              onClick={() => pick(mesas[pos - 1].numero)}
            >
              ‹
            </button>
            <span className="tpick-label" title={cur.nome}>
              <b>Mesa {cur.numero}</b>
              <span className="tpick-name">{cur.nome}</span>
              <span className="c">
                {curCount.inn}/{curCount.occ}
              </span>
            </span>
            <button
              className="tpick-step"
              aria-label="Mesa seguinte"
              disabled={pos >= mesas.length - 1}
              onClick={() => pick(mesas[pos + 1].numero)}
            >
              ›
            </button>
            <button className="tpick-step" aria-label="Ver todas as mesas" onClick={() => pick(null)}>
              ✕
            </button>
          </div>
        )}
        <span className="spacer" />
        {!side && (
        <button className="btn tpick-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          Escolher mesa <span className="c">{mesas.length}</span>
          <span className="tpick-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        )}
      </div>

      {open && (
        <div
          className="tpick-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !side) setOpen(false);
            if (e.key === "Enter" && shown.length === 1) pick(shown[0].numero);
          }}
        >
          <div className="tpick-head">
            <input
              type="search"
              autoFocus={!side}
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="N.º ou nome da mesa"
              aria-label="Procurar mesa"
            />
            <span className="tpick-legend">
              <span>
                <i className="sw occ" /> ocupados
              </span>
              <span>
                <i className="sw inn" /> entraram
              </span>
            </span>
          </div>
          <div className="tpick-grid" role="group" aria-label="Escolher mesa">
            {shown.map((m) => {
              const total = seatCount(m);
              const { occ, inn } = counts(idx, m.numero, total);
              return (
                <button
                  key={m.numero}
                  className={`tnum${occ === total ? " full" : ""}`}
                  aria-pressed={sel === m.numero}
                  title={`Mesa ${m.numero} · ${m.nome} — ${occ}/${total} ocupados · ${inn} entraram`}
                  onClick={() => pick(m.numero)}
                >
                  <span className="n">{m.numero}</span>
                  <span className="fill" aria-hidden="true">
                    <i className="occ" style={{ width: `${(occ / total) * 100}%` }} />
                    <i className="inn" style={{ width: `${(inn / total) * 100}%` }} />
                  </span>
                </button>
              );
            })}
            {!shown.length && <p className="hint tpick-none">Nenhuma mesa com “{find.trim()}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
