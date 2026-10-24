"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Modal, type ModalProps } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { drawCard } from "@/lib/qrCard";
import { seatOf } from "@/lib/util";

const toBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((r, j) => cv.toBlob((b) => (b ? r(b) : j()), "image/png"));

/** QR card: save, copy image, copy message, WhatsApp */
export function QrModal({ m, c, nextC, mesaBy, idx, open, close }: ModalProps & { m: number; c: number; nextC?: number | null }) {
  const toast = useToast();
  const ensureCodigo = useMutation(api.lugares.ensureCodigo);
  const p = seatOf(idx, m, c);
  const mesa = mesaBy.get(m);
  const [url, setUrl] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const codigo = p?.codigo,
    nome = p?.nome,
    tipo = p?.tipo,
    mesaNome = mesa?.nome;
  useEffect(() => {
    if (!p) return;
    if (!codigo) {
      ensureCodigo({ mesa: m, cadeira: c }).catch(() => toast("Esta pessoa ainda não tem código."));
      return;
    }
    let off = false;
    (async () => {
      try {
        await document.fonts.ready;
      } catch {}
      if (off) return;
      const cv = drawCard({ ...p, codigo }, mesaNome);
      canvas.current = cv;
      setUrl(cv.toDataURL("image/png"));
    })();
    return () => {
      off = true;
    };
    // redraw only when what is printed on the card changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, c, codigo, nome, tipo, mesaNome]);

  if (!p) return null;
  const msg = `Olá ${p.nome}! A sua mesa é a ${m}${mesa ? " (" + mesa.nome + ")" : ""}, cadeira ${c}. Apresente o QR code em anexo à entrada. Código: ${p.codigo ?? ""}`;
  const nx = nextC ? seatOf(idx, m, nextC) : undefined;
  const fname = `QR Mesa ${m} Cadeira ${c} - ${p.nome}.png`.replace(/[\\/:*?"<>|]/g, "");

  const saveImg = async () => {
    if (!canvas.current) return;
    try {
      const href = URL.createObjectURL(await toBlob(canvas.current));
      const a = document.createElement("a");
      a.href = href;
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast("Imagem guardada");
    } catch {
      toast("Não foi possível guardar. Use o toque longo na imagem.");
    }
  };
  const copyImg = async () => {
    try {
      const blob = await toBlob(canvas.current!);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Imagem copiada. Cole no WhatsApp.");
    } catch {
      toast("Este navegador não deixa copiar imagens. Use o toque longo na imagem.");
    }
  };
  const copyMsg = () => {
    navigator.clipboard
      ?.writeText(msg)
      .then(() => toast("Mensagem copiada"))
      .catch(() => toast("Não foi possível copiar."));
  };

  return (
    <Modal onClose={close}>
      <h3>QR code · {p.nome}</h3>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Cartão com QR code de ${p.nome}, mesa ${m}, cadeira ${c}`}
          style={{ width: "100%", maxWidth: 320, alignSelf: "center", border: "1px solid var(--line)", borderRadius: 10 }}
        />
      ) : (
        <p className="hint">A preparar o cartão…</p>
      )}
      <p className="hint">
        No telemóvel, mantenha o dedo na imagem para a guardar ou partilhar no WhatsApp. No computador, clique com o botão direito e
        escolha &quot;Copiar imagem&quot;.
      </p>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn primary" onClick={saveImg} disabled={!url}>
          Guardar imagem
        </button>
        <button type="button" className="btn" onClick={copyImg} disabled={!url}>
          Copiar imagem
        </button>
        <button type="button" className="btn" onClick={copyMsg}>
          Copiar mensagem
        </button>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">
          Abrir WhatsApp
        </a>
      </div>
      <p className="hint">&quot;Abrir WhatsApp&quot; leva só a mensagem. Anexe a imagem guardada ou copiada.</p>
      <div className="actions">
        {nx && (
          <button type="button" className="btn" onClick={() => open({ kind: "qr", m, c: nextC! })}>
            QR do acompanhante: {nx.nome} →
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={close}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
