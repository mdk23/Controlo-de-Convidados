import { body, mono } from "./fonts";

export type TicketData = {
  title: string;
  sub: string;
  rows: [string, string][];
  /** table ticket: one line per person (name, role underneath, status on the right) */
  people?: { name: string; role: string; status: string; ok: boolean }[];
  totalLabel: string;
  totalValue: string;
  totalOk: boolean;
};

const SCALE = 2,
  W = 420,
  PAD = 28;
const ink = "#2C4A6B",
  muted = "#6B5E4E",
  line = "#E6D3BA",
  ok = "#6B7F5B";

/** loads the logo fonts so the canvas can use them (they are only fetched once something on the page uses them) */
export async function loadTicketFonts() {
  try {
    await Promise.all([document.fonts.load('italic 28px "Agatha Italic"'), document.fonts.load('28px "RC"'), document.fonts.ready]);
  } catch {}
}

/** the ticket modal as a PNG-ready canvas, same layout as .ticket in globals.css, without the buttons */
export function drawTicket(t: TicketData) {
  const sans = body.style.fontFamily,
    code = mono.style.fontFamily;
  const people = t.people ?? [];
  // must follow the y steps below
  const H =
    PAD + 68 + // title, sub, dashed line
    22 + t.rows.length * 26 + // rows
    (t.people ? 18 + Math.max(people.length, 1) * 43 : 0) +
    38 + // total
    58 + PAD; // footer

  const cv = document.createElement("canvas");
  cv.width = W * SCALE;
  cv.height = H * SCALE;
  const x = cv.getContext("2d")!;
  x.scale(SCALE, SCALE);
  x.textBaseline = "alphabetic";

  x.fillStyle = "#FFFFFF";
  x.beginPath();
  x.roundRect(0.5, 0.5, W - 1, H - 1, 14);
  x.fill();
  x.strokeStyle = line;
  x.lineWidth = 1;
  x.stroke();

  const L = PAD,
    R = W - PAD;
  const fit = (s: string, max: number) => {
    if (x.measureText(s).width <= max) return s;
    while (s.length > 1 && x.measureText(s + "…").width > max) s = s.slice(0, -1);
    return s + "…";
  };
  const rule = (y: number, dashed: boolean, color = line) => {
    x.save();
    x.strokeStyle = color;
    x.setLineDash(dashed ? [4, 3] : []);
    x.beginPath();
    x.moveTo(L, y + 0.5);
    x.lineTo(R, y + 0.5);
    x.stroke();
    x.restore();
  };
  const spaced = (px: number) => {
    if ("letterSpacing" in x) (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  };

  // head
  let y = PAD + 22;
  x.textAlign = "center";
  x.fillStyle = ink;
  x.font = `800 22px ${sans}`;
  spaced(1.3);
  x.fillText(fit(t.title, R - L), W / 2, y);
  y += 24;
  x.fillStyle = muted;
  x.font = `600 12px ${sans}`;
  spaced(1.2);
  x.fillText(fit(t.sub.toUpperCase(), R - L), W / 2, y);
  spaced(0);
  y += 22;
  rule(y, true);

  // rows
  y += 8;
  for (const [k, v] of t.rows) {
    y += 26;
    x.textAlign = "left";
    x.fillStyle = muted;
    x.font = `400 13px ${sans}`;
    x.fillText(k + ":", L, y);
    const kw = x.measureText(k + ":").width;
    x.textAlign = "right";
    x.fillStyle = ink;
    x.font = `700 13px ${code}`;
    x.fillText(fit(v, R - L - kw - 12), R, y);
  }
  y += 14;

  // people
  if (t.people) {
    rule(y, true);
    y += 8;
    if (!people.length) {
      y += 30;
      x.textAlign = "left";
      x.fillStyle = muted;
      x.font = `400 13px ${sans}`;
      x.fillText("Sem convidados", L, y);
      y += 13;
    }
    for (const p of people) {
      x.font = `600 13px ${sans}`;
      const sw = x.measureText(p.status).width;
      x.textAlign = "right";
      x.fillStyle = p.ok ? ok : muted;
      x.fillText(p.status, R, y + 22);
      x.textAlign = "left";
      x.fillStyle = ink;
      x.font = `400 13px ${sans}`;
      x.fillText(fit(p.name, R - L - sw - 12), L, y + 22);
      x.fillStyle = muted;
      x.font = `400 11px ${sans}`;
      x.fillText(fit(p.role, R - L - sw - 12), L, y + 37);
      y += 43;
    }
    y += 10;
  }

  // total
  rule(y, false, ink);
  y += 38;
  x.textAlign = "left";
  x.fillStyle = ink;
  x.font = `800 13px ${sans}`;
  x.fillText(t.totalLabel, L, y);
  x.textAlign = "right";
  x.fillStyle = t.totalOk ? ok : muted;
  x.font = `600 20px ${code}`;
  x.fillText(t.totalValue, R, y);

  // footer: "Desenvolvido por" + Xalima mark (.powered-mark)
  y += 46;
  const lead = "Desenvolvido por ";
  x.font = `400 13px ${sans}`;
  const lw = x.measureText(lead).width;
  x.font = 'italic 28px "Agatha Italic", cursive';
  const xw = x.measureText("X").width;
  x.font = '28px "RC", sans-serif';
  const aw = x.measureText("alima").width;
  let fx = (W - (lw + 4 + xw + aw)) / 2;
  x.textAlign = "left";
  x.fillStyle = muted;
  x.font = `400 13px ${sans}`;
  x.fillText(lead, fx, y - 6);
  fx += lw + 4;
  x.fillStyle = "#FF7F50";
  x.font = 'italic 28px "Agatha Italic", cursive';
  x.fillText("X", fx, y);
  fx += xw;
  x.fillStyle = "#2563EB";
  x.font = '28px "RC", sans-serif';
  x.fillText("alima", fx, y);
  return cv;
}
