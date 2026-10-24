"use client";

import { useMutation, useQuery } from "convex/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { IconCheck, IconSearch, IconTransfer } from "@/components/icons";
import type { ModalProps, ModalState } from "@/components/Modal";
import { TablePicker } from "@/components/TablePicker";
import { useToast } from "@/components/Toast";
import { ImportModal } from "@/components/modals/ImportModal";
import { QrModal } from "@/components/modals/QrModal";
import { SeatModal } from "@/components/modals/SeatModal";
import { TableModal } from "@/components/modals/TableModal";
import { TicketModal } from "@/components/modals/TicketModal";
import { TransferModal } from "@/components/modals/TransferModal";
import {
  chairs,
  seatCount,
  companionOf,
  hhmm,
  hostName,
  indexSeats,
  isAc,
  norm,
  seatOf,
  transferChair,
  type Lugar,
  type Mesa,
} from "@/lib/util";

type Filtro = "all" | "out" | "in";
type Vista = "list" | "tables";
const NO_MESAS: Mesa[] = [];
const NO_LUGARES: Lugar[] = [];

// Mesas view: cards are at least MIN_CARD wide, at most MAX_PER_PAGE per page (one row)
const MIN_CARD = 300;
const GRID_GAP = 16;
const MAX_PER_PAGE = 4;

function PoweredBy() {
  return (
    <div className="powered">
      <span className="powered-by">POWERED BY</span>
      <span className="powered-mark">
        <span className="x">X</span>
        <span className="alima">alima</span>
      </span>
    </div>
  );
}


export default function MesasApp() {
  const toast = useToast();
  const mesasQ = useQuery(api.mesas.list);
  const lugaresQ = useQuery(api.lugares.list);
  const toggle = useMutation(api.lugares.toggleEntrada).withOptimisticUpdate((store, { mesa, cadeira }) => {
    const cur = store.getQuery(api.lugares.list, {});
    if (!cur) return;
    store.setQuery(
      api.lugares.list,
      {},
      cur.map((s) =>
        s.mesa === mesa && s.cadeira === cadeira ? { ...s, entrada: !s.entrada, entradaHora: s.entrada ? null : Date.now() } : s,
      ),
    );
  });

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filtro>("all");
  // the app always opens in Mesas
  const [v, setV] = useState<Vista>("tables");
  const [selRaw, setSel] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  // the sidebar sticks just under the sticky bar, whose height changes with wrapping
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mesas view pages: one row of cards per page, as many as fit (max 4)
  const mainRef = useRef<HTMLElement>(null);
  const [mainW, setMainW] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setMainW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const perPage = mainW ? Math.max(1, Math.min(MAX_PER_PAGE, Math.floor((mainW + GRID_GAP) / (MIN_CARD + GRID_GAP)))) : MAX_PER_PAGE;

  // arrow keys turn the page (when not typing and no dialog is open)
  useEffect(() => {
    if (v !== "tables" || modal) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable) return;
      document.querySelector<HTMLButtonElement>(`[data-pager="${e.key === "ArrowLeft" ? "prev" : "next"}"]`)?.click();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [v, modal]);

  const ready = mesasQ !== undefined && lugaresQ !== undefined;
  const mesas = mesasQ ?? NO_MESAS;
  const lugares = lugaresQ ?? NO_LUGARES;
  const mesaBy = useMemo(() => new Map(mesas.map((m) => [m.numero, m])), [mesas]);
  const idx = useMemo(() => indexSeats(lugares), [lugares]);
  const sel = selRaw != null && mesaBy.has(selRaw) ? selRaw : null;

  // the page goes back to 1 whenever the search, filter or chosen table changes
  const pageKey = `${sel}|${q.trim()}|${f}`;
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const page = pageState.key === pageKey ? pageState.page : 0;
  const goPage = (p: number) => {
    setPageState({ key: pageKey, page: p });
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
  };

  // search is debounced like the artifact
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 120);
    return () => clearTimeout(t);
  }, [qInput]);

  // "#c-CODE" links from the QR codes
  useEffect(() => {
    const fromHash = () => {
      const h = (location.hash || "").match(/^#c-([A-Za-z0-9]{4,12})$/);
      if (!h) return;
      const code = h[1].toUpperCase();
      setQInput(code);
      setQ(code);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const open = useCallback((m: ModalState) => setModal(m), []);
  const close = useCallback(() => setModal(null), []);

  const choose = (n: number | null, clearQ = false) => {
    setSel(n);
    if (clearQ) {
      setQInput("");
      setQ("");
    }
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
  };

  const onToggle = async (s: Lugar) => {
    const on = !s.entrada;
    try {
      await toggle({ mesa: s.mesa, cadeira: s.cadeira });
      toast(on ? `${s.nome} entrou` : `Entrada de ${s.nome} desmarcada`);
    } catch {
      toast("Não foi possível guardar. Verifique a ligação e tente de novo.");
    }
  };

  /* ---------- filtering ---------- */
  const hasFilter = !!q.trim() || f !== "all";
  const showAll = () => {
    setF("all");
    setQInput("");
    setQ("");
  };
  const matches = (m: Mesa, s: Lugar | undefined) => {
    if (f === "in" && !s?.entrada) return false;
    if (f === "out" && (!s || s.entrada)) return false;
    if (!q) return true;
    const nq = norm(q);
    return (
      norm(m.nome).includes(nq) ||
      String(m.numero) === q.trim() ||
      (!!s && (norm(s.nome).includes(nq) || norm(hostName(idx, s)).includes(nq)))
    );
  };

  /* ---------- pieces ---------- */
  const chk = (s: Lugar | undefined) => {
    const on = !!s?.entrada;
    return (
      <button className="chk" aria-pressed={on} disabled={!s} title={on ? "Desmarcar entrada" : "Marcar entrada"} onClick={() => s && onToggle(s)}>
        <span className="box">{on && <IconCheck />}</span>
        <span className="lbl">{on ? "Entrou" : "Check-in"}</span>
      </button>
    );
  };
  const trBtn = (s: Lugar | undefined) =>
    s && (
      <button
        className="icbtn"
        title="Transferir para outra mesa"
        aria-label={`Transferir ${s.nome} para outra mesa`}
        onClick={() => open({ kind: "transfer", m: s.mesa, c: transferChair(idx, s) })}
      >
        <IconTransfer />
      </button>
    );
  const seatBtn = (m: number, c: number, children: ReactNode, className = "link") => (
    <button className={className} onClick={() => open({ kind: "seat", m, c })}>
      {children}
    </button>
  );

  /* ---------- stats ---------- */
  const acomp = lugares.filter(isAc).length,
    conv = lugares.length - acomp;
  const pessoas = lugares.length,
    dentro = lugares.filter((s) => s.entrada).length;
  const pct = pessoas ? Math.round((dentro / pessoas) * 100) : 0;

  /* ---------- views ---------- */
  const noResults = () =>
    !mesas.length ? (
      <div className="blank">
        <h2>Ainda não há mesas</h2>
        <p>Crie a primeira mesa (10 lugares numerados de 1 a 10) ou importe a lista de convidados.</p>
        <p>
          <button className="btn primary" onClick={() => open({ kind: "table", m: null })}>
            + Nova mesa
          </button>
        </p>
      </div>
    ) : (
      <div className="blank">
        <h2>Nenhum resultado</h2>
        <p>
          {f !== "all"
            ? `Com o filtro “${f === "out" ? "Por entrar" : "Entraram"}” só aparecem pessoas, não cadeiras livres.`
            : "Nenhum convidado corresponde à pesquisa ou ao filtro."}
        </p>
        <p>
          <button className="btn primary" onClick={showAll}>
            Mostrar todos os lugares
          </button>
        </p>
      </div>
    );

  const renderList = () => {
    const showEmpty = !hasFilter;
    const groups: ReactNode[] = [];
    for (const m of mesas) {
      if (sel != null && m.numero !== sel) continue;
      const rows: ReactNode[] = [];
      for (const c of chairs(seatCount(m))) {
        const s = seatOf(idx, m.numero, c);
        if (!s && !showEmpty) continue;
        if (!matches(m, s)) continue;
        const host = hostName(idx, s);
        rows.push(
          <tr key={c} className={s?.entrada ? "in" : ""}>
            <td className="num">{m.numero}</td>
            <td>{m.nome}</td>
            <td className="num">{c}</td>
            {!s ? (
              <td colSpan={2}>{seatBtn(m.numero, c, "Livre — adicionar pessoa", "link empty-seat")}</td>
            ) : isAc(s) ? (
              <>
                <td>
                  <span style={{ color: "var(--muted)" }}>—</span>
                </td>
                <td>
                  {seatBtn(m.numero, c, <strong>{s.nome}</strong>)}
                  {host && (
                    <div className="de">
                      acompanha {host} · cad. {s.de}
                    </div>
                  )}
                </td>
              </>
            ) : (
              <>
                <td>{seatBtn(m.numero, c, <strong>{s.nome}</strong>)}</td>
                <td>
                  <span style={{ color: "var(--muted)" }}>—</span>
                </td>
              </>
            )}
            <td>
              <div className="ent">
                {chk(s)}
                {s?.entrada && s.entradaHora && <span className="time">{hhmm(s.entradaHora)}</span>}
                <span className="spacer" />
                {trBtn(s)}
              </div>
            </td>
          </tr>,
        );
      }
      if (rows.length)
        groups.push(
          <Fragment key={m.numero}>
            <tr className="group">
              <td colSpan={6}>
                <button className="link" onClick={() => open({ kind: "table", m: m.numero })}>
                  Mesa {m.numero} · {m.nome}
                </button>
              </td>
            </tr>
            {rows}
          </Fragment>,
        );
    }
    if (!groups.length) return noResults();
    return (
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              <th>N.º mesa</th>
              <th>Nome da mesa</th>
              <th>N.º cadeira</th>
              <th>Convidado</th>
              <th>Acompanhante</th>
              <th>Entrada</th>
            </tr>
          </thead>
          <tbody>{groups}</tbody>
        </table>
      </div>
    );
  };

  const roundSvg = (m: Mesa) => {
    const n = seatCount(m);
    // the ring grows with the number of chairs so neighbours never overlap
    const R = Math.max(62, n > 1 ? 29 / (2 * Math.sin(Math.PI / n)) : 62),
      cx = R + 23,
      cy = R + 23,
      size = 2 * cx;
    return (
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: Math.min(260, size), height: "auto" }}
        role="img"
        aria-label={`Mesa ${m.numero}, lugares 1 a ${n}`}
      >
        <circle cx={cx} cy={cy} r={R - 22} fill="var(--sunk)" stroke="var(--line)" strokeWidth="1.5" />
        <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontFamily: "var(--display)" }} fontSize="24" fill="var(--accent)">
          {m.numero}
        </text>
        {chairs(n).map((c) => {
          const a = ((-90 + ((c - 1) * 360) / n) * Math.PI) / 180,
            x = (cx + R * Math.cos(a)).toFixed(1),
            y = cy + R * Math.sin(a);
          const s = seatOf(idx, m.numero, c);
          const fill = s?.entrada ? "var(--ok)" : isAc(s) ? "var(--muted)" : s ? "var(--ink)" : "var(--surface)";
          return (
            <g key={c}>
              <title>{`Cadeira ${c}${s ? " — " + s.nome + (isAc(s) ? " (acompanhante)" : " (convidado)") : " — livre"}`}</title>
              <circle cx={x} cy={y.toFixed(1)} r="13" fill={fill} stroke={s ? fill : "var(--line)"} strokeWidth="2" />
              <text
                x={x}
                y={(y + 4).toFixed(1)}
                textAnchor="middle"
                style={{ fontFamily: "var(--mono)" }}
                fontSize="11"
                fontWeight="600"
                fill={s ? "var(--surface)" : "var(--muted)"}
              >
                {c}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const renderTables = () => {
    const cards: ReactNode[] = [],
      nums: number[] = [];
    for (const m of mesas) {
      if (sel != null && m.numero !== sel) continue;
      let hit = !hasFilter,
        occ = 0,
        inn = 0;
      const list = chairs(seatCount(m)).map((c) => {
        const s = seatOf(idx, m.numero, c);
        if (s) {
          occ++;
          if (s.entrada) inn++;
        }
        if (hasFilter && matches(m, s)) hit = true;
        const host = hostName(idx, s);
        return (
          <div className="seat" key={c}>
            <span className="num" style={{ color: "var(--muted)" }}>
              {c}
            </span>
            {seatBtn(
              m.numero,
              c,
              s ? (
                <>
                  <div className="g">{s.nome}</div>
                  <div className="a">{isAc(s) ? `Acompanhante${host ? " de " + host : ""}` : "Convidado"}</div>
                </>
              ) : (
                <div className="empty-seat">Livre</div>
              ),
              "link who",
            )}
            <div className="ent">
              {chk(s)}
              {trBtn(s)}
            </div>
          </div>
        );
      });
      if (!hit) continue;
      nums.push(m.numero);
      cards.push(
        <article className="card" key={m.numero}>
          <div className="head">
            <div>
              <div className="tag">MESA {m.numero}</div>
              <h2>{m.nome}</h2>
              <div className="sub">
                {occ}/{seatCount(m)} ocupados · {inn} entraram
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => open({ kind: "ticket", m: m.numero })}>
                Ticket
              </button>
              <button className="btn" onClick={() => open({ kind: "table", m: m.numero })}>
                Editar
              </button>
            </div>
          </div>
          <div className="round">{roundSvg(m)}</div>
          <div className="seats">{list}</div>
        </article>,
      );
    }
    if (!cards.length) return noResults();

    const pages = Math.ceil(cards.length / perPage);
    const cur = Math.min(page, pages - 1);
    const from = cur * perPage,
      to = Math.min(from + perPage, cards.length);
    const grid = (
      <div className="grid" style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))` }}>
        {cards.slice(from, to)}
      </div>
    );
    if (pages === 1) return grid;

    const pager = (where: "top" | "bottom") => (
      <nav className="pager" aria-label="Páginas de mesas">
        <button className="btn" data-pager={where === "top" ? "prev" : undefined} disabled={cur === 0} onClick={() => goPage(cur - 1)}>
          ‹ Anterior
        </button>
        <div className="pager-mid">
          <span className="pager-info">
            {to - from === 1 ? `Mesa ${nums[from]}` : `Mesas ${nums[from]}–${nums[to - 1]}`}
            <span className="c">
              {" "}
              · {cur + 1}/{pages}
            </span>
          </span>
          {pages <= 15 && (
            <span className="pager-dots">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  aria-label={`Página ${i + 1}`}
                  aria-current={i === cur ? "page" : undefined}
                  onClick={() => goPage(i)}
                />
              ))}
            </span>
          )}
        </div>
        <button
          className="btn"
          data-pager={where === "top" ? "next" : undefined}
          disabled={cur === pages - 1}
          onClick={() => goPage(cur + 1)}
        >
          Seguinte ›
        </button>
      </nav>
    );
    return (
      <>
        {pager("top")}
        {grid}
        {pager("bottom")}
      </>
    );
  };

  const renderResults = () => {
    const nq = norm(q.trim());
    const hits = lugares
      .filter((s) => norm(s.nome).includes(nq) || norm(hostName(idx, s)).includes(nq) || (!!s.codigo && norm(s.codigo) === nq))
      .sort((a, b) => a.mesa - b.mesa || a.cadeira - b.cadeira)
      .slice(0, 30);
    if (!hits.length)
      return (
        <div className="results">
          <h2>Ninguém encontrado com “{q.trim()}”</h2>
          <p className="hint">Confirme a escrita do nome ou procure pelo apelido.</p>
        </div>
      );
    return (
      <div className="results">
        <h2>{hits.length === 1 ? "1 pessoa encontrada" : `${hits.length} pessoas encontradas`}</h2>
        {hits.map((s) => {
          const m = mesaBy.get(s.mesa),
            h = hostName(idx, s);
          const comp = isAc(s) ? null : companionOf(idx, s.mesa, s.cadeira);
          const rel = isAc(s)
            ? "Acompanhante" + (h ? " de " + h : "")
            : "Convidado" + (comp ? ` · com ${comp.nome} (cad. ${comp.cadeira})` : "");
          return (
            <div key={s._id} className={`hit ${s.entrada ? "in" : ""}`}>
              <div className="mesa">
                <div className="l">Mesa</div>
                <div className="n">{s.mesa}</div>
              </div>
              <div className="who">
                <div className="g">{s.nome}</div>
                <div className="d">
                  {m?.nome ?? ""} · Cadeira {s.cadeira} · {rel}
                  {s.entrada && s.entradaHora ? " · entrou às " + hhmm(s.entradaHora) : ""}
                </div>
              </div>
              <div className="go">
                {chk(s)}
                <button className="btn" onClick={() => open({ kind: "transfer", m: s.mesa, c: transferChair(idx, s) })}>
                  <IconTransfer /> Transferir
                </button>
                <button className="btn" onClick={() => choose(s.mesa, true)}>
                  Ver mesa
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const main = !ready ? (
    <div className="blank">
      <p>A carregar a lista…</p>
    </div>
  ) : q.trim() ? (
    renderResults()
  ) : v === "list" ? (
    renderList()
  ) : (
    renderTables()
  );

  const mp: ModalProps = { mesas, mesaBy, idx, open, close };

  return (
    <>
      <header className="wrap top">
        <div className="stats">
          <div className="stat">
            <div className="n">{mesas.length}</div>
            <div className="l">Mesas · {mesas.reduce((t, m) => t + seatCount(m), 0)} lugares</div>
          </div>
          <div className="stat">
            <div className="n">
              {conv}
              <span style={{ color: "var(--muted)", fontSize: ".6em" }}> + {acomp}</span>
            </div>
            <div className="l">Convidados + acompanhantes (1 por cadeira)</div>
          </div>
          <div className="stat">
            <div className="n">
              {dentro}/{pessoas}
            </div>
            <div className="l">Pessoas já entraram</div>
            <div className="meter">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="eyebrow">Controlo de convidados</div>
      </header>

      <div className="bar" ref={barRef}>
        <div className="wrap">
          <div className="search">
            <IconSearch />
            <input
              type="search"
              placeholder="Escreva o nome para saber a mesa"
              aria-label="Procurar"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <div className="seg" role="group" aria-label="Filtro">
            {(
              [
                ["all", "Todos"],
                ["out", "Por entrar"],
                ["in", "Entraram"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Vista">
            {(
              [
                ["tables", "Mesas"],
                ["list", "Lista"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} aria-pressed={v === k} onClick={() => setV(k)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => open({ kind: "import" })}>
            Importar
          </button>
          <button className="btn primary" onClick={() => open({ kind: "table", m: null })}>
            + Nova mesa
          </button>
        </div>
        <div className="wrap">
          <TablePicker variant="bar" mesas={mesas} idx={idx} sel={sel} onChoose={(n) => choose(n)} />
        </div>
      </div>

      <div className={`wrap layout${mesas.length ? " has-side" : ""}`}>
        {mesas.length > 0 && (
          <aside className="side" aria-label="Mesas">
            <TablePicker variant="side" mesas={mesas} idx={idx} sel={sel} onChoose={(n) => choose(n)} />
            <PoweredBy />
          </aside>
        )}
        <main ref={mainRef}>{main}</main>
      </div>
      {/* without the sidebar (narrow screens, or no tables yet) it sits at the end of the page */}
      <footer className={`wrap powered-foot${mesas.length ? " has-side" : ""}`}>
        <PoweredBy />
      </footer>

      {modal && ready && (
        <Fragment key={JSON.stringify(modal)}>
          {modal.kind === "seat" && <SeatModal {...mp} m={modal.m} c={modal.c} />}
          {modal.kind === "table" && <TableModal {...mp} m={modal.m} />}
          {modal.kind === "transfer" && <TransferModal {...mp} m={modal.m} c={modal.c} />}
          {modal.kind === "import" && <ImportModal {...mp} />}
          {modal.kind === "ticket" && <TicketModal {...mp} m={modal.m} />}
          {modal.kind === "qr" && <QrModal {...mp} m={modal.m} c={modal.c} nextC={modal.nextC} />}
        </Fragment>
      )}
    </>
  );
}
