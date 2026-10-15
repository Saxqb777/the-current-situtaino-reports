/** Chart symbols drawn on canvas, so the map needs no external sprite sheet. */

const PR = 2;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w * PR;
  c.height = h * PR;
  const ctx = c.getContext("2d")!;
  ctx.scale(PR, PR);
  return { c, ctx };
}

const image = (c: HTMLCanvasElement) => {
  const ctx = c.getContext("2d")!;
  return ctx.getImageData(0, 0, c.width, c.height);
};

/** Narrow hull pointing north; the map rotates it to the ship's course. */
export function shipIcon(fill: string, outline: string, hollow = false): ImageData {
  const { c, ctx } = canvas(12, 22);
  ctx.beginPath();
  ctx.moveTo(6, 1);
  ctx.lineTo(10.5, 16);
  ctx.lineTo(9, 21);
  ctx.lineTo(3, 21);
  ctx.lineTo(1.5, 16);
  ctx.closePath();
  if (hollow) {
    ctx.setLineDash([2.2, 1.6]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = fill;
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
  return image(c);
}

/** The anchor that marks a port on Admiralty charts. */
export function anchorIcon(ink: string, paper: string): ImageData {
  const { c, ctx } = canvas(20, 20);
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.arc(10, 10, 9.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(10, 4.6, 1.6, 0, Math.PI * 2); // ring
  ctx.moveTo(10, 6.2);
  ctx.lineTo(10, 16); // shank
  ctx.moveTo(6.6, 8.6);
  ctx.lineTo(13.4, 8.6); // stock
  ctx.moveTo(4.6, 12.2);
  ctx.quadraticCurveTo(5.4, 16.2, 10, 16.4);
  ctx.quadraticCurveTo(14.6, 16.2, 15.4, 12.2); // arms
  ctx.stroke();
  return image(c);
}

/** Incident mark: a filled disc in the severity colour; high and critical get a danger ring. */
export function incidentIcon(color: string, paper: string, ring: "none" | "single" | "double"): ImageData {
  const { c, ctx } = canvas(30, 30);
  if (ring !== "none") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([2.5, 2]);
    ctx.beginPath();
    ctx.arc(15, 15, ring === "double" ? 13.5 : 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.arc(15, 15, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(15, 15, 6, 0, Math.PI * 2);
  ctx.fill();
  if (ring === "double") {
    ctx.strokeStyle = paper;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(12, 12); ctx.lineTo(18, 18);
    ctx.moveTo(18, 12); ctx.lineTo(12, 18);
    ctx.stroke();
  }
  return image(c);
}

export const ICON_PIXEL_RATIO = PR;
