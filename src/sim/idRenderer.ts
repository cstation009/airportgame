import { formatShortDate } from './generator';
import type { BoardingPass, IdentityDocument, PassengerAppearance } from './types';

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  app: PassengerAppearance,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Official passport/DMV neutral studio gradient backdrop
  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, '#cfd8e3');
  bg.addColorStop(1, '#aebcc9');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  const cx = x + w * 0.5;
  const cy = y + h * 0.44;

  // Shoulders & jacket
  ctx.fillStyle = app.jacketColor;
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 1.05, w * 0.52, h * 0.36, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Inner shirt V-collar
  ctx.fillStyle = app.shirtColor;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.14, y + h * 0.73);
  ctx.lineTo(cx + w * 0.14, y + h * 0.73);
  ctx.lineTo(cx, y + h * 0.96);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillStyle = app.skinTone;
  ctx.fillRect(cx - w * 0.11, cy + h * 0.16, w * 0.22, h * 0.2);

  // Neck shadow
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.22, w * 0.11, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Long hair behind head
  if (app.hairStyle === 'long') {
    ctx.fillStyle = app.hairColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.09, w * 0.3, h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ears
  ctx.fillStyle = app.skinTone;
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.23, cy + h * 0.02, w * 0.045, h * 0.075, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.23, cy + h * 0.02, w * 0.045, h * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head oval with subtle lighting
  ctx.fillStyle = app.skinTone;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.23, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  const faceShade = ctx.createRadialGradient(cx - w * 0.06, cy - h * 0.06, 2, cx, cy, w * 0.32);
  faceShade.addColorStop(0, 'rgba(255,255,255,0.14)');
  faceShade.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = faceShade;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.23, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Facial hair
  if (app.facialHair === 'beard') {
    ctx.fillStyle = app.hairColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.13, w * 0.21, h * 0.125, 0, 0, Math.PI);
    ctx.fill();
  } else if (app.facialHair === 'stubble') {
    ctx.fillStyle = 'rgba(25, 22, 20, 0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.12, w * 0.2, h * 0.115, 0, 0, Math.PI);
    ctx.fill();
  }
  if (app.facialHair === 'mustache' || app.facialHair === 'beard') {
    ctx.fillStyle = app.hairColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.095, w * 0.085, h * 0.024, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes & eyebrows
  const eyeY = cy - h * 0.02;
  const eyeDx = w * 0.085;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx - eyeDx, eyeY, w * 0.04, h * 0.022, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + eyeDx, eyeY, w * 0.04, h * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = app.eyeColor;
  ctx.beginPath();
  ctx.arc(cx - eyeDx, eyeY, w * 0.02, 0, Math.PI * 2);
  ctx.arc(cx + eyeDx, eyeY, w * 0.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = app.hairColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - eyeDx - w * 0.045, eyeY - h * 0.045);
  ctx.lineTo(cx - eyeDx + w * 0.04, eyeY - h * 0.05);
  ctx.moveTo(cx + eyeDx - w * 0.04, eyeY - h * 0.05);
  ctx.lineTo(cx + eyeDx + w * 0.045, eyeY - h * 0.045);
  ctx.stroke();

  // Nose & mouth
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + h * 0.01);
  ctx.lineTo(cx - w * 0.015, cy + h * 0.065);
  ctx.lineTo(cx + w * 0.02, cy + h * 0.068);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(110, 46, 46, 0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.055, cy + h * 0.125);
  ctx.quadraticCurveTo(cx, cy + h * 0.145, cx + w * 0.055, cy + h * 0.125);
  ctx.stroke();

  // Glasses
  if (app.glasses !== 'none') {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    const isAviator = app.glasses === 'aviator';
    ctx.fillStyle = isAviator ? 'rgba(15, 23, 42, 0.62)' : 'rgba(200, 230, 255, 0.22)';
    if (app.glasses === 'round') {
      ctx.beginPath();
      ctx.arc(cx - eyeDx, eyeY, w * 0.062, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + eyeDx, eyeY, w * 0.062, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(cx - eyeDx - w * 0.065, eyeY - h * 0.042, w * 0.13, h * 0.082);
      ctx.strokeRect(cx - eyeDx - w * 0.065, eyeY - h * 0.042, w * 0.13, h * 0.082);
      ctx.fillRect(cx + eyeDx - w * 0.065, eyeY - h * 0.042, w * 0.13, h * 0.082);
      ctx.strokeRect(cx + eyeDx - w * 0.065, eyeY - h * 0.042, w * 0.13, h * 0.082);
    }
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.02, eyeY);
    ctx.lineTo(cx + w * 0.02, eyeY);
    ctx.stroke();
  }

  // Hair / Headwear
  ctx.fillStyle = app.hairColor;
  if (app.hairStyle === 'short' || app.hairStyle === 'parted') {
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.15, w * 0.24, h * 0.13, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (app.hairStyle === 'parted') {
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.06, cy - h * 0.14, w * 0.18, h * 0.09, -0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (app.hairStyle === 'buzz') {
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.15, w * 0.22, h * 0.09, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (app.hairStyle === 'curly') {
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * w * 0.065, cy - h * 0.18 + Math.abs(i) * 3, w * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (app.hairStyle === 'long') {
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.16, w * 0.26, h * 0.13, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (app.hairStyle === 'beanie') {
    ctx.fillStyle = app.hatColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.16, w * 0.26, h * 0.16, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - w * 0.26, cy - h * 0.17, w * 0.52, h * 0.065);
  } else if (app.hairStyle === 'cap') {
    ctx.fillStyle = app.hatColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.17, w * 0.25, h * 0.14, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - w * 0.27, cy - h * 0.15, w * 0.54, h * 0.045);
  }

  // Subtle photo glossy vignette & frame border
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

export function renderIdentityDocument(
  ctx: CanvasRenderingContext2D,
  doc: IdentityDocument,
  uvActive: boolean,
  uvCursor: { x: number; y: number } | null,
  wideUv: boolean,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const isPassport = doc.type === 'PASSPORT';

  // 1. Card stock gradient & guilloche micro-security wave background
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(4, 4, width - 8, height - 8, 12);
  ctx.clip();

  const cardBg = ctx.createLinearGradient(0, 0, width, height);
  if (isPassport) {
    cardBg.addColorStop(0, '#eef3f9');
    cardBg.addColorStop(0.5, '#e2ebf4');
    cardBg.addColorStop(1, '#d5e1ee');
  } else {
    cardBg.addColorStop(0, '#f5f2e9');
    cardBg.addColorStop(0.5, '#ebe7da');
    cardBg.addColorStop(1, '#dfe5ec');
  }
  ctx.fillStyle = cardBg;
  ctx.fillRect(0, 0, width, height);

  // Fine guilloche security pattern
  ctx.strokeStyle = isPassport ? 'rgba(30, 64, 124, 0.08)' : 'rgba(120, 88, 38, 0.09)';
  ctx.lineWidth = 1;
  for (let row = 0; row < 12; row++) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const y = row * 24 + Math.sin(x * 0.035 + row * 0.7) * 9;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Top official header bar
  ctx.fillStyle = isPassport ? '#14294d' : '#1f3b5c';
  ctx.fillRect(0, 0, width, 42);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(0, 42, width, 3);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 13px "Inter", system-ui, sans-serif';
  ctx.fillText(isPassport ? 'PASSPORT • BIOMETRIC IDENTITY' : 'DRIVER LICENSE • REAL ID', 16, 20);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillText(doc.issuingAuthority, 16, 35);

  // Real ID gold star badge
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(width - 28, 22, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#14294d';
  ctx.font = '700 11px sans-serif';
  ctx.fillText('★', width - 33, 26);

  // Portrait photo
  drawPortrait(ctx, doc.photoAppearance, 18, 56, 108, 134);

  // Data fields
  const fx = 142;
  const drawField = (label: string, value: string, x: number, y: number, highlight = false) => {
    ctx.fillStyle = '#475569';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillText(label, x, y);
    ctx.fillStyle = highlight ? '#0f172a' : '#1e293b';
    ctx.font = highlight ? '700 15px "Inter", sans-serif' : '700 12px "JetBrains Mono", monospace';
    ctx.fillText(value, x, y + 15);
  };

  drawField('FULL NAME', doc.fullName, fx, 68, true);
  drawField('DOCUMENT NO.', doc.docNumber, fx, 102);
  drawField('NAT / SEX', `${doc.nationality} / ${doc.sex}`, fx + 152, 102);
  drawField('DATE OF BIRTH', formatShortDate(doc.dob), fx, 136);
  drawField('ISSUED', formatShortDate(doc.issueDate), fx + 135, 136);
  drawField('EXPIRES', formatShortDate(doc.expiryDate), fx, 170);

  // Machine-readable zone (MRZ) at bottom
  ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
  ctx.fillRect(14, height - 46, width - 28, 34);
  ctx.fillStyle = '#334155';
  ctx.font = '600 10.5px "JetBrains Mono", monospace';
  const cleanName = doc.fullName.replace(/\s+/g, '<<');
  ctx.fillText(`P<${doc.nationality}${cleanName}<<<<<<<<<<<<<<<<<<`.slice(0, 42), 20, height - 30);
  ctx.fillText(`${doc.docNumber}8${doc.nationality}${doc.dob.replace(/-/g, '').slice(2)}M${doc.expiryDate.replace(/-/g, '').slice(2)}<<<<<<<04`, 20, height - 16);

  // 2. Interactive UV Blacklight Inspection Layer
  if (uvActive) {
    // Darken ambient card slightly under UV lamp
    ctx.fillStyle = 'rgba(14, 8, 38, 0.56)';
    ctx.fillRect(0, 0, width, height);

    const ux = uvCursor?.x ?? width * 0.68;
    const uy = uvCursor?.y ?? height * 0.5;
    const radius = wideUv ? 150 : 96;

    // Soft violet UV flashlight cone
    const cone = ctx.createRadialGradient(ux, uy, 8, ux, uy, radius);
    cone.addColorStop(0, 'rgba(99, 102, 241, 0.34)');
    cone.addColorStop(0.6, 'rgba(79, 70, 229, 0.16)');
    cone.addColorStop(1, 'rgba(15, 10, 40, 0)');
    ctx.fillStyle = cone;
    ctx.fillRect(0, 0, width, height);

    // Clip hidden fluorescent security seal to the UV light beam!
    ctx.save();
    ctx.beginPath();
    ctx.arc(ux, uy, radius * 0.9, 0, Math.PI * 2);
    ctx.clip();

    if (doc.uvValid) {
      // Crisp glowing fluorescent security eagle/globe crest & UV serial
      const sx = width * 0.68;
      const sy = height * 0.52;
      ctx.strokeStyle = 'rgba(56, 250, 225, 0.92)';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(sx, sy, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 34, 0, Math.PI * 2);
      ctx.stroke();

      // Globe meridians & security shield chevron
      ctx.beginPath();
      ctx.ellipse(sx, sy, 18, 34, 0, 0, Math.PI * 2);
      ctx.moveTo(sx - 34, sy);
      ctx.lineTo(sx + 34, sy);
      ctx.stroke();

      ctx.fillStyle = 'rgba(103, 232, 249, 0.95)';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText('VERIFIED HOLOGRAM', sx - 52, sy + 58);
      ctx.fillText(doc.uvSealCode, sx - 26, sy + 4);

      // Micro fluorescent fibers
      ctx.strokeStyle = 'rgba(167, 243, 208, 0.7)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const fx2 = 40 + i * 62;
        const fy2 = 72 + ((i * 37) % 110);
        ctx.beginPath();
        ctx.moveTo(fx2, fy2);
        ctx.lineTo(fx2 + 12, fy2 - 6);
        ctx.stroke();
      }
    } else {
      // Forged ID: smudged/broken UV ink & missing crest!
      const sx = width * 0.68;
      const sy = height * 0.52;
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.65)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 42, 0.2, Math.PI * 1.4);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText('NO VALID UV SEAL', sx - 48, sy + 4);
      ctx.fillText('INK ANOMALY DETECTED', sx - 60, sy + 20);
    }

    ctx.restore();
  }

  ctx.restore();

  // Outer physical card bevel
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(4, 4, width - 8, height - 8, 12);
  ctx.stroke();
}

export function renderBoardingPass(ctx: CanvasRenderingContext2D, pass: BoardingPass): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(4, 4, width - 8, height - 8, 10);
  ctx.clip();

  // Warm off-white thermal boarding pass stock
  ctx.fillStyle = '#faf8f2';
  ctx.fillRect(0, 0, width, height);

  // Airline top header band
  ctx.fillStyle = '#0f2942';
  ctx.fillRect(0, 0, width, 34);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 34, width, 3);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px "Inter", sans-serif';
  ctx.fillText(pass.airline, 16, 22);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillText(`FLIGHT ${pass.flightNumber}`, width - 122, 22);

  // Route big IATA codes
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 28px "Inter", sans-serif';
  ctx.fillText(pass.origin, 16, 72);
  ctx.fillStyle = '#64748b';
  ctx.font = '700 18px sans-serif';
  ctx.fillText('✈', 84, 69);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 28px "Inter", sans-serif';
  ctx.fillText(pass.destination, 114, 72);

  ctx.fillStyle = '#475569';
  ctx.font = '600 9.5px "JetBrains Mono", monospace';
  ctx.fillText(pass.destinationCity, 114, 86);

  // Passenger Name & Flight Info
  const field = (lbl: string, val: string, x: number, y: number) => {
    ctx.fillStyle = '#64748b';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.fillText(lbl, x, y);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillText(val, x, y + 14);
  };

  field('PASSENGER', pass.passengerName, 16, 106);
  field('FLIGHT DATE', formatShortDate(pass.flightDate), 16, 138);
  field('GATE', pass.gate, 150, 138);
  field('SEAT', pass.seat, 206, 138);
  field('GROUP', pass.boardingGroup, 260, 138);

  if (pass.tsaPre) {
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(230, 48, 72, 20);
    ctx.fillStyle = '#15803d';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillText('TSA PRE✓', 238, 62);
  }

  // Perforated stub line + vertical barcode on right side
  const stubX = width - 92;
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(stubX, 38);
  ctx.lineTo(stubX, height - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crisp thermal barcode bars
  let seed = 0;
  for (let i = 0; i < pass.flightNumber.length + pass.passengerName.length; i++) {
    seed += (pass.passengerName.charCodeAt(i % pass.passengerName.length) || 65) * (i + 3);
  }
  ctx.fillStyle = '#0f172a';
  for (let row = 0; row < 28; row++) {
    const hBar = ((seed + row * 37) % 3) + 1.5;
    if ((seed + row * 19) % 5 !== 0) {
      ctx.fillRect(stubX + 14, 48 + row * 4, 62, hBar);
    }
  }
  ctx.fillStyle = '#475569';
  ctx.font = '600 8.5px "JetBrains Mono", monospace';
  ctx.fillText(`SEQ ${pass.sequenceNo}`, stubX + 16, height - 12);

  ctx.restore();

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(4, 4, width - 8, height - 8, 10);
  ctx.stroke();
}
