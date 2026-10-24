import qrcode from "qrcode-generator";
import { body, display, mono } from "./fonts";
import { isAc, qrLink, type Lugar } from "./util";

/** 640×900 PNG card: "A SUA MESA", table number, table name + chair, QR, name, role and code */
export function drawCard(p: Lugar & { codigo: string }, mesaNome: string | undefined) {
  const W = 640,
    H = 900,
    cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d")!;
  const serif = display.style.fontFamily,
    sans = body.style.fontFamily,
    code = mono.style.fontFamily;
  const ink = "#17202E",
    muted = "#5B6676",
    gold = "#94661C";
  x.fillStyle = "#FFFFFF";
  x.fillRect(0, 0, W, H);
  x.strokeStyle = gold;
  x.lineWidth = 3;
  x.strokeRect(24, 24, W - 48, H - 48);
  x.textAlign = "center";
  x.fillStyle = gold;
  x.font = `700 18px ${sans}`;
  x.fillText("A SUA MESA", W / 2, 86);
  x.fillStyle = ink;
  x.font = `400 120px ${serif}`;
  x.fillText(String(p.mesa), W / 2, 205);
  x.fillStyle = muted;
  x.font = `600 24px ${sans}`;
  x.fillText(`${mesaNome ? mesaNome + " · " : ""}Cadeira ${p.cadeira}`, W / 2, 250);

  const qr = qrcode(0, "M");
  qr.addData(qrLink(p.codigo));
  qr.make();
  const n = qr.getModuleCount(),
    size = 360,
    cell = Math.floor(size / n),
    real = cell * n,
    ox = (W - real) / 2,
    oy = 290;
  x.fillStyle = ink;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) x.fillRect(ox + c * cell, oy + r * cell, cell, cell);

  // name, shrunk to fit
  let fs = 44;
  x.font = `400 ${fs}px ${serif}`;
  while (x.measureText(p.nome).width > W - 110 && fs > 22) {
    fs -= 2;
    x.font = `400 ${fs}px ${serif}`;
  }
  x.fillStyle = ink;
  x.fillText(p.nome, W / 2, oy + real + 75);
  x.fillStyle = muted;
  x.font = `500 22px ${sans}`;
  x.fillText(isAc(p) ? "Acompanhante" : "Convidado", W / 2, oy + real + 112);
  x.fillStyle = gold;
  x.font = `600 26px ${code}`;
  x.fillText(p.codigo, W / 2, H - 96);
  x.fillStyle = muted;
  x.font = `500 18px ${sans}`;
  x.fillText("Apresente este código à entrada", W / 2, H - 62);
  return cv;
}
