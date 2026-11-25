import type {
  BagData,
  BagItemInstance,
  XRayLayerShape,
  XRayMaterial,
  XRayMode,
} from './types';

export interface XRayRenderOptions {
  mode: XRayMode;
  /** Belt offset in pixels relative to center of screen (0 = centered inside scanner tunnel) */
  bagOffsetX: number;
  hoveredItemId: string | null;
  cursorX: number | null;
  cursorY: number | null;
  densityProbeEnabled: boolean;
  scanTime: number;
}

export interface MaterialProbeReading {
  material: XRayMaterial | 'air';
  zEff: string;
  densityPct: number;
  label: string;
}

/**
 * Dual-energy attenuation palette inspired by Smiths Detection HI-SCAN / Rapiscan TSA monitors.
 * Multiplied onto a clean radiograph white canvas so overlapping layers physically darken.
 */
function getAttenuationColor(
  material: XRayMaterial,
  density: number,
  mode: XRayMode,
): { r: number; g: number; b: number; alpha: number } {
  const d = Math.max(0.08, Math.min(1.35, density));

  if (mode === 'INV') {
    // High-contrast monochrome negative radiograph
    const strength = Math.min(0.95, 0.25 + d * 0.68);
    return { r: 220, g: 235, b: 245, alpha: strength };
  }

  let base: { r: number; g: number; b: number };
  let alpha = Math.min(0.94, 0.24 + d * 0.62);

  switch (material) {
    case 'organic':
      // Warm TSA amber-orange
      base = { r: 232, g: 132, b: 28 };
      if (mode === 'OS') {
        // Organic stripping: suppress orange fabrics so weapons underneath pop!
        base = { r: 215, g: 218, b: 222 };
        alpha *= 0.22;
      } else if (mode === 'MS') {
        alpha *= 0.6;
      }
      break;
    case 'mixed':
      // Emerald/teal green (PCB, glass, aluminum)
      base = { r: 44, g: 162, b: 92 };
      if (mode === 'OS') {
        base = { r: 30, g: 150, b: 108 };
        alpha = Math.min(0.95, alpha * 1.05);
      } else if (mode === 'MS') {
        alpha *= 0.78;
      }
      break;
    case 'metal':
      // Deep cobalt / sapphire blue (steel, firearms, blades)
      base = { r: 28, g: 68, b: 186 };
      if (mode === 'MS') {
        base = { r: 16, g: 48, b: 215 };
        alpha = Math.min(0.98, alpha * 1.2);
      } else if (mode === 'OS') {
        alpha = Math.min(0.98, alpha * 1.15);
      }
      break;
    case 'dense':
      // Ultra-dense opaque indigo-black (lead shielding, gun barrel bore, grenade core)
      base = { r: 14, g: 22, b: 56 };
      alpha = mode === 'MS' ? Math.min(0.88, alpha * 0.82) : Math.min(0.97, 0.48 + d * 0.45);
      break;
  }

  return { ...base, alpha };
}

function drawShape(ctx: CanvasRenderingContext2D, shape: XRayLayerShape): void {
  ctx.beginPath();
  switch (shape.kind) {
    case 'rect': {
      ctx.rect(shape.x ?? 0, shape.y ?? 0, shape.w ?? 10, shape.h ?? 10);
      ctx.fill();
      break;
    }
    case 'roundRect': {
      const x = shape.x ?? 0;
      const y = shape.y ?? 0;
      const w = shape.w ?? 10;
      const h = shape.h ?? 10;
      const r = Math.min(shape.r ?? 4, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'circle': {
      ctx.arc(shape.x ?? 0, shape.y ?? 0, shape.r ?? 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ellipse': {
      ctx.ellipse(shape.x ?? 0, shape.y ?? 0, shape.rx ?? 10, shape.ry ?? 6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'polygon': {
      const pts = shape.points ?? [];
      if (pts.length > 0) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'line': {
      const pts = shape.points ?? [];
      if (pts.length >= 2) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.lineWidth = shape.lineWidth ?? 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      break;
    }
  }
}

export function getBagScreenOrigin(
  canvasWidth: number,
  canvasHeight: number,
  bag: BagData,
  bagOffsetX: number,
): { ox: number; oy: number } {
  return {
    ox: (canvasWidth - bag.width) * 0.5 + bagOffsetX,
    oy: (canvasHeight - bag.height) * 0.5 + 4,
  };
}

export function hitTestBagItem(
  canvasWidth: number,
  canvasHeight: number,
  bag: BagData,
  bagOffsetX: number,
  px: number,
  py: number,
): BagItemInstance | null {
  const { ox, oy } = getBagScreenOrigin(canvasWidth, canvasHeight, bag, bagOffsetX);
  const localBagX = px - ox;
  const localBagY = py - oy;

  // Iterate in reverse (contraband & top-layer items prioritized)
  for (let i = bag.items.length - 1; i >= 0; i--) {
    const item = bag.items[i];
    const dx = localBagX - item.x;
    const dy = localBagY - item.y;
    const cos = Math.cos(-item.rotation);
    const sin = Math.sin(-item.rotation);
    const rx = (dx * cos - dy * sin) / item.scale;
    const ry = (dx * sin + dy * cos) / item.scale;
    const halfW = item.template.width * 0.54;
    const halfH = item.template.height * 0.54;
    if (Math.abs(rx) <= halfW && Math.abs(ry) <= halfH) {
      return item;
    }
  }
  return null;
}

export function sampleMaterialAtCursor(
  canvasWidth: number,
  canvasHeight: number,
  bag: BagData,
  bagOffsetX: number,
  px: number,
  py: number,
): MaterialProbeReading {
  const hit = hitTestBagItem(canvasWidth, canvasHeight, bag, bagOffsetX, px, py);
  if (!hit) {
    const { ox, oy } = getBagScreenOrigin(canvasWidth, canvasHeight, bag, bagOffsetX);
    if (px >= ox && px <= ox + bag.width && py >= oy && py <= oy + bag.height) {
      return {
        material: bag.hasLeadLining ? 'dense' : 'organic',
        zEff: bag.hasLeadLining ? 'Z ≈ 78 (SHIELDED)' : 'Z ≈ 6.8 (SHELL)',
        densityPct: bag.hasLeadLining ? 86 : 18,
        label: bag.hasLeadLining ? 'DENSE LINING DETECTED' : 'LUGGAGE SHELL',
      };
    }
    return { material: 'air', zEff: 'Z = 0.0', densityPct: 0, label: 'EMPTY BELT' };
  }

  // Pick dominant highest-Z material of the hit item
  const rank: Record<XRayMaterial, number> = { organic: 1, mixed: 2, metal: 3, dense: 4 };
  let maxMat: XRayMaterial = 'organic';
  let maxDensity = 0.25;
  for (const s of hit.template.shapes) {
    if (rank[s.material] > rank[maxMat]) maxMat = s.material;
    if (s.density > maxDensity) maxDensity = s.density;
  }

  const zMap: Record<XRayMaterial, string> = {
    organic: 'Z ≈ 7.4 (ORGANIC)',
    mixed: 'Z ≈ 13.8 (INORG/ALLOY)',
    metal: 'Z ≈ 26.2 (HIGH-Z METAL)',
    dense: 'Z ≈ 74+ (ULTRA-DENSE)',
  };

  return {
    material: maxMat,
    zEff: zMap[maxMat],
    densityPct: Math.min(99, Math.round(maxDensity * 82)),
    label: hit.template.contraband ? 'ANOMALOUS SIGNATURE' : 'STANDARD MATERIAL',
  };
}

export function renderXRayMonitor(
  ctx: CanvasRenderingContext2D,
  bag: BagData | null,
  opts: XRayRenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const isInv = opts.mode === 'INV';

  // 1. Clean X-ray radiograph background
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = isInv ? '#0d141c' : '#f4f6f0';
  ctx.fillRect(0, 0, width, height);

  // Subtle calibration grid ticks along top/bottom bezel edges
  ctx.strokeStyle = isInv ? 'rgba(130, 175, 210, 0.14)' : 'rgba(60, 78, 92, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 24; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 8);
    ctx.moveTo(x, height - 8);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Conveyor belt rollers faint horizontal guide rails
  ctx.fillStyle = isInv ? 'rgba(140, 180, 210, 0.08)' : 'rgba(120, 130, 125, 0.11)';
  ctx.fillRect(0, 18, width, 4);
  ctx.fillRect(0, height - 22, width, 4);

  if (bag) {
    const { ox, oy } = getBagScreenOrigin(width, height, bag, opts.bagOffsetX);
    ctx.save();
    ctx.translate(ox, oy);

    // Blend mode simulates physical Beer-Lambert X-ray absorption
    ctx.globalCompositeOperation = isInv ? 'screen' : 'multiply';

    // 2. Suitcase structural shell, zipper track, wheels & telescopic handle rails
    const shellColor = getAttenuationColor('organic', 0.24, opts.mode);
    ctx.fillStyle = `rgba(${shellColor.r}, ${shellColor.g}, ${shellColor.b}, ${shellColor.alpha})`;
    drawShape(ctx, {
      kind: 'roundRect',
      material: 'organic',
      density: 0.24,
      x: 0,
      y: 0,
      w: bag.width,
      h: bag.height,
      r: bag.type === 'hardshell' ? 18 : 26,
    });

    // Outer thick rim / zipper frame
    const rimColor = getAttenuationColor(
      bag.type === 'hardshell' || bag.type === 'briefcase' ? 'mixed' : 'organic',
      0.42,
      opts.mode,
    );
    ctx.strokeStyle = `rgba(${rimColor.r}, ${rimColor.g}, ${rimColor.b}, ${rimColor.alpha})`;
    ctx.lineWidth = bag.type === 'hardshell' ? 8 : 5;
    ctx.strokeRect(4, 4, bag.width - 8, bag.height - 8);

    // Twin metallic telescopic trolley tubes (iconic real airport X-ray look!)
    if (bag.type === 'hardshell') {
      const tubeColor = getAttenuationColor('metal', 0.62, opts.mode);
      ctx.fillStyle = `rgba(${tubeColor.r}, ${tubeColor.g}, ${tubeColor.b}, ${tubeColor.alpha * 0.72})`;
      ctx.fillRect(14, bag.height * 0.34, bag.width - 28, 7);
      ctx.fillRect(14, bag.height * 0.63, bag.width - 28, 7);
      // Corner spinner wheel bearings
      for (const wy of [22, bag.height - 22]) {
        drawShape(ctx, { kind: 'circle', material: 'metal', density: 0.7, x: 10, y: wy, r: 9 });
        drawShape(ctx, { kind: 'circle', material: 'metal', density: 0.7, x: bag.width - 10, y: wy, r: 9 });
      }
    }

    // Optional lead-lined smuggler shielding patch (Level 4+ challenge!)
    if (bag.hasLeadLining) {
      const shieldAlpha = opts.mode === 'MS' ? 0.32 : opts.mode === 'INV' ? 0.42 : 0.72;
      ctx.fillStyle = isInv
        ? `rgba(180, 210, 235, ${shieldAlpha})`
        : `rgba(16, 24, 52, ${shieldAlpha})`;
      ctx.fillRect(28, 22, bag.width - 56, bag.height - 44);
    }

    // 3. Render every item inside the bag
    for (const item of bag.items) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      ctx.scale(item.scale, item.scale);

      for (const shape of item.template.shapes) {
        const col = getAttenuationColor(shape.material, shape.density, opts.mode);
        const rgba = `rgba(${col.r}, ${col.g}, ${col.b}, ${col.alpha})`;
        ctx.fillStyle = rgba;
        ctx.strokeStyle = rgba;
        drawShape(ctx, shape);
      }
      ctx.restore();
    }

    // 4. Overlay tactical target boxes (source-over so crisp HUD stays bright)
    ctx.globalCompositeOperation = 'source-over';
    for (const item of bag.items) {
      const isHovered = item.instanceId === opts.hoveredItemId;
      if (!item.flagged && !isHovered) continue;

      const bw = item.template.width * item.scale * 0.56;
      const bh = item.template.height * item.scale * 0.56;
      ctx.save();
      ctx.translate(item.x, item.y);

      if (item.flagged) {
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.lineWidth = 2.2;
        ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
        ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);

        // Corner brackets & tag badge
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-bw, -bh - 16, 74, 15);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.fillText('FLAGGED', -bw + 6, -bh - 5);
      } else if (isHovered) {
        ctx.strokeStyle = isInv ? 'rgba(56, 189, 248, 0.85)' : 'rgba(15, 23, 42, 0.55)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // 5. Subtle moving vertical X-ray line-array scan sweep when active
  const sweepX = ((opts.scanTime * 115) % (width + 80)) - 40;
  const grad = ctx.createLinearGradient(sweepX - 24, 0, sweepX + 24, 0);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
  grad.addColorStop(0.5, isInv ? 'rgba(56, 189, 248, 0.14)' : 'rgba(14, 165, 233, 0.08)');
  grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(sweepX - 24, 0, 48, height);

  // 6. Real-time Dual-Energy Probe reticle if upgrade installed
  if (opts.densityProbeEnabled && opts.cursorX !== null && opts.cursorY !== null && bag) {
    const reading = sampleMaterialAtCursor(width, height, bag, opts.bagOffsetX, opts.cursorX, opts.cursorY);
    const cx = opts.cursorX;
    const cy = opts.cursorY;

    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.moveTo(cx, cy - 18);
    ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy + 18);
    ctx.stroke();

    const boxW = 166;
    const boxH = 40;
    const bx = Math.min(width - boxW - 8, cx + 18);
    const by = Math.max(8, cy - 44);
    ctx.fillStyle = 'rgba(10, 15, 24, 0.88)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = reading.label === 'ANOMALOUS SIGNATURE' ? '#ef4444' : '#38bdf8';
    ctx.strokeRect(bx, by, boxW, boxH);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillText(reading.zEff, bx + 7, by + 15);
    ctx.fillStyle = reading.label === 'ANOMALOUS SIGNATURE' ? '#f87171' : '#7dd3fc';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillText(`DENSITY ${reading.densityPct}% • ${reading.material.toUpperCase()}`, bx + 7, by + 30);
  }

  // 7. Authentic console HUD stamps (top-left scanner model, bottom-right legend)
  ctx.fillStyle = isInv ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.82)';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillText(`HI-SCAN 6040-2iS  •  MODE: ${opts.mode}`, 12, 16);

  if (bag) {
    ctx.fillText(`TRAY ${bag.id}`, width - 108, 16);
  }

  // Color key legend along bottom left
  if (!isInv) {
    const legend: Array<{ color: string; text: string }> = [
      { color: '#e8841c', text: 'ORG' },
      { color: '#2ca25c', text: 'MIX' },
      { color: '#1c44ba', text: 'MTL' },
      { color: '#0e1638', text: 'HI-Z' },
    ];
    let lx = 12;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    for (const item of legend) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, height - 15, 10, 9);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillText(item.text, lx + 14, height - 7);
      lx += 48;
    }
  }

  ctx.restore();
}
