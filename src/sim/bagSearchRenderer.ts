import type { BagData, BagItemInstance, ItemTemplate } from './types';

export interface BagSearchRenderOptions {
  selectedItemId: string | null;
  hoveredItemId: string | null;
  draggingItemId: string | null;
}

export function getSearchBagRect(
  canvasWidth: number,
  canvasHeight: number,
  bag: BagData,
): { ox: number; oy: number; scale: number } {
  const padX = 56;
  const padY = 40;
  const scale = Math.min(
    (canvasWidth - padX * 2) / bag.width,
    (canvasHeight - padY * 2) / bag.height,
    1.18,
  );
  const ox = (canvasWidth - bag.width * scale) * 0.5;
  const oy = (canvasHeight - bag.height * scale) * 0.5;
  return { ox, oy, scale };
}

/**
 * Draw realistic full-color physical illustration of each carry-on item inside the open suitcase.
 */
function drawRealisticItem(ctx: CanvasRenderingContext2D, item: BagItemInstance): void {
  const id = item.template.id;

  // Soft physical drop shadow onto the suitcase liner / items below
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;

  switch (id) {
    case 'laptop': {
      // Brushed silver aluminum ultrabook shell
      const grad = ctx.createLinearGradient(-60, -40, 60, 40);
      grad.addColorStop(0, '#cfd6df');
      grad.addColorStop(0.5, '#aeb7c4');
      grad.addColorStop(1, '#8c96a4');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-60, -40, 120, 80, 6);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Subtle center logo emblem + rear hinge strip
      ctx.fillStyle = '#475569';
      ctx.fillRect(-52, -39, 104, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'folded_clothes': {
      // Folded cotton sweater/jacket with stitched seam & collar fold
      ctx.fillStyle = '#475a73';
      ctx.beginPath();
      ctx.roundRect(-54, -36, 108, 72, 12);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // Fabric crease folds
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-44, -12);
      ctx.quadraticCurveTo(0, -18, 44, -10);
      ctx.moveTo(-42, 14);
      ctx.quadraticCurveTo(0, 8, 42, 16);
      ctx.stroke();
      // Folded shirt collar detail
      ctx.fillStyle = '#334357';
      ctx.beginPath();
      ctx.moveTo(-18, -36);
      ctx.lineTo(18, -36);
      ctx.lineTo(0, -20);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'sneaker': {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(-50, 14);
      ctx.lineTo(48, 14);
      ctx.lineTo(52, 4);
      ctx.lineTo(28, -6);
      ctx.lineTo(6, -20);
      ctx.lineTo(-36, -22);
      ctx.lineTo(-48, -6);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // Accent running stripe & rubber outsole
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(-26, -8, 38, 9);
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(-50, 9, 100, 9, 4);
      ctx.fill();
      // Laces
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      for (const lx of [-10, -2, 6]) {
        ctx.beginPath();
        ctx.moveTo(lx, -15);
        ctx.lineTo(lx + 4, -8);
        ctx.stroke();
      }
      break;
    }

    case 'headphones': {
      // Matte black studio headband + padded leather earcups
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 4, 28, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      for (const ex of [-24, 24]) {
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.ellipse(ex, 14, 12, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      break;
    }

    case 'camera': {
      ctx.fillStyle = '#1f242c';
      ctx.beginPath();
      ctx.roundRect(-34, -18, 68, 42, 6);
      ctx.fill();
      ctx.fillRect(-16, -27, 28, 12);
      ctx.shadowColor = 'transparent';
      // Glass optical barrel
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(2, 4, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();
      const lensGrad = ctx.createRadialGradient(-2, 0, 2, 2, 4, 11);
      lensGrad.addColorStop(0, '#38bdf8');
      lensGrad.addColorStop(0.5, '#1e3a5f');
      lensGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = lensGrad;
      ctx.beginPath();
      ctx.arc(2, 4, 11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'charger_cable': {
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.roundRect(-36, -14, 28, 28, 5);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-44, -8, 9, 4);
      ctx.fillRect(-44, 4, 9, 4);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.bezierCurveTo(10, -18, 34, -12, 32, 6);
      ctx.bezierCurveTo(28, 20, 4, 14, 16, -2);
      ctx.lineTo(38, 14);
      ctx.stroke();
      break;
    }

    case 'book': {
      ctx.fillStyle = '#7c2d12';
      ctx.beginPath();
      ctx.roundRect(-35, -46, 70, 92, 4);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#f5f0e1';
      ctx.fillRect(30, -43, 4, 86);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-24, -28, 44, 5);
      ctx.fillRect(-20, -16, 36, 3);
      break;
    }

    case 'toiletries_mini': {
      // Clear TSA quart-size zip bag with <=100ml travel tubes
      ctx.fillStyle = 'rgba(203, 213, 225, 0.35)';
      ctx.beginPath();
      ctx.roundRect(-34, -20, 68, 40, 8);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.roundRect(-26, -12, 16, 24, 4);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.roundRect(-4, -10, 14, 22, 4);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(16, -14, 7, 26);
      break;
    }

    case 'umbrella': {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-44, -9, 82, 18, 8);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-52, -2, 10, 4);
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(38, -6, 16, 12, 4);
      ctx.fill();
      break;
    }

    case 'keys_glasses': {
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(-32, -18, 64, 24, 10);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-14, 12, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-6, 10, 18, 4);
      ctx.fillRect(-4, 16, 15, 3.5);
      break;
    }

    // ==================== PROHIBITED CONTRABAND ====================
    case 'handgun': {
      // Matte blued-steel semi-automatic pistol
      ctx.fillStyle = '#272c35';
      ctx.fillRect(-42, -26, 84, 17); // slide
      ctx.fillStyle = '#181c22';
      ctx.fillRect(-24, -9, 58, 9); // frame
      // Trigger guard
      ctx.strokeStyle = '#272c35';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(-2, -1, 18, 13);
      // Textured polymer grip
      ctx.fillStyle = '#111318';
      ctx.beginPath();
      ctx.moveTo(-34, -9);
      ctx.lineTo(-10, -9);
      ctx.lineTo(-20, 30);
      ctx.lineTo(-42, 26);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // Ejection port & slide serrations
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, -23, 18, 6);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      for (let sx = -36; sx <= -20; sx += 4) {
        ctx.beginPath();
        ctx.moveTo(sx, -24);
        ctx.lineTo(sx, -11);
        ctx.stroke();
      }
      break;
    }

    case 'combat_knife': {
      // High-carbon steel blade with metallic sheen
      const bladeGrad = ctx.createLinearGradient(-8, -8, 54, 8);
      bladeGrad.addColorStop(0, '#94a3b8');
      bladeGrad.addColorStop(0.5, '#e2e8f0');
      bladeGrad.addColorStop(1, '#64748b');
      ctx.fillStyle = bladeGrad;
      ctx.beginPath();
      ctx.moveTo(-8, -7);
      ctx.lineTo(38, -7);
      ctx.lineTo(54, 1);
      ctx.lineTo(38, 7);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // Crossguard & ribbed tactical grip
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-13, -13, 6, 26);
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.roundRect(-52, -7, 39, 14, 4);
      ctx.fill();
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 2;
      for (let gx = -46; gx <= -20; gx += 6) {
        ctx.beginPath();
        ctx.moveTo(gx, -6);
        ctx.lineTo(gx, 6);
        ctx.stroke();
      }
      break;
    }

    case 'oversized_liquid': {
      // Large 1.5L prohibited bottle with bold label
      ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.beginPath();
      ctx.roundRect(-22, -34, 44, 86, 10);
      ctx.fill();
      ctx.fillRect(-9, -49, 18, 16);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(-10, -55, 20, 8); // cap
      // Label band showing "1.5L"
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-21, -8, 42, 28);
      ctx.fillStyle = '#dc2626';
      ctx.font = '800 11px "JetBrains Mono", monospace';
      ctx.fillText('1.5L', -15, 10);
      break;
    }

    case 'ied_package': {
      // Putty-tan explosive brick wired to green PCB timer & red LED
      ctx.fillStyle = '#d6c39c';
      ctx.beginPath();
      ctx.roundRect(-44, -26, 54, 52, 5);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // Tape straps
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-30, -26, 8, 52);
      ctx.fillRect(-8, -26, 8, 52);
      // Green timer PCB & battery
      ctx.fillStyle = '#15803d';
      ctx.fillRect(16, -22, 28, 24);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(18, 6, 24, 18);
      // Red/yellow detonator wires
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(18, -10);
      ctx.lineTo(28, 6);
      ctx.stroke();
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(8, 4);
      ctx.lineTo(22, 14);
      ctx.stroke();
      // Armed red LED dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(30, -10, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'brass_knuckles': {
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.roundRect(-34, 4, 68, 14, 7);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 5;
      for (const kx of [-24, -8, 8, 24]) {
        ctx.beginPath();
        ctx.arc(kx, -8, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case 'chemical_canister': {
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.roundRect(-18, -32, 36, 78, 8);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-16, -8, 32, 26);
      ctx.fillStyle = '#111827';
      ctx.font = '800 9px "JetBrains Mono", monospace';
      ctx.fillText('HAZMAT', -15, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-8, -44, 16, 12);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-5, -49, 12, 6);
      break;
    }

    case 'grenade': {
      ctx.fillStyle = '#3f5236';
      ctx.beginPath();
      ctx.ellipse(-2, 8, 21, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#273522';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-21, 2);
      ctx.lineTo(17, 2);
      ctx.moveTo(-21, 14);
      ctx.lineTo(17, 14);
      ctx.stroke();
      // Fuse head, lever & silver pull ring
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-9, -28, 14, 14);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-18, -22, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(4, -27);
      ctx.lineTo(17, -20);
      ctx.lineTo(23, 12);
      ctx.lineTo(17, 14);
      ctx.lineTo(11, -15);
      ctx.lineTo(4, -19);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'switchblade': {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-46, -7, 48, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(2, -5);
      ctx.lineTo(38, -3);
      ctx.lineTo(48, 0);
      ctx.lineTo(38, 3);
      ctx.lineTo(2, 5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(-12, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    default: {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-25, -18, 50, 36);
      break;
    }
  }

  ctx.restore();
}

export function hitTestSearchBagItem(
  canvasWidth: number,
  canvasHeight: number,
  bag: BagData,
  px: number,
  py: number,
): BagItemInstance | null {
  // If a lead-lined false bottom hasn't been peeled open yet, items underneath can't be grabbed
  if (bag.hasLeadLining && !bag.falseBottomOpened) {
    return null;
  }

  const { ox, oy, scale } = getSearchBagRect(canvasWidth, canvasHeight, bag);
  const bx = (px - ox) / scale;
  const by = (py - oy) / scale;

  // Check from top-most rendered item downward (ignoring already seized items)
  for (let i = bag.items.length - 1; i >= 0; i--) {
    const item = bag.items[i];
    if (item.seized) continue;
    const dx = bx - item.x;
    const dy = by - item.y;
    const cos = Math.cos(-item.rotation);
    const sin = Math.sin(-item.rotation);
    const rx = (dx * cos - dy * sin) / item.scale;
    const ry = (dx * sin + dy * cos) / item.scale;
    if (Math.abs(rx) <= item.template.width * 0.54 && Math.abs(ry) <= item.template.height * 0.54) {
      return item;
    }
  }
  return null;
}

export function renderBagSearchTable(
  ctx: CanvasRenderingContext2D,
  bag: BagData | null,
  opts: BagSearchRenderOptions,
): void {
  const { width, height } = ctx.canvas;

  // 1. Brushed stainless steel secondary inspection table surface
  const tableGrad = ctx.createLinearGradient(0, 0, width, height);
  tableGrad.addColorStop(0, '#2a333e');
  tableGrad.addColorStop(0.5, '#343f4c');
  tableGrad.addColorStop(1, '#252d37');
  ctx.fillStyle = tableGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle metallic brush lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let y = 4; y < height; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!bag) return;

  const { ox, oy, scale } = getSearchBagRect(width, height, bag);
  const bw = bag.width * scale;
  const bh = bag.height * scale;

  ctx.save();

  // 2. Outer open suitcase shell & shadow on steel table
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = bag.color;
  ctx.beginPath();
  ctx.roundRect(ox - 14, oy - 14, bw + 28, bh + 28, 22);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Open metallic zipper track around rim
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(ox - 6, oy - 6, bw + 12, bh + 12, 16);
  ctx.stroke();
  ctx.setLineDash([]);

  // Quilted fabric interior lining
  const linerGrad = ctx.createLinearGradient(ox, oy, ox, oy + bh);
  linerGrad.addColorStop(0, '#1e2630');
  linerGrad.addColorStop(1, '#141a22');
  ctx.fillStyle = linerGrad;
  ctx.beginPath();
  ctx.roundRect(ox, oy, bw, bh, 12);
  ctx.fill();

  // Interior luggage compression straps
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(ox + bw * 0.25, oy + 6);
  ctx.lineTo(ox + bw * 0.25, oy + bh - 6);
  ctx.moveTo(ox + bw * 0.75, oy + 6);
  ctx.lineTo(ox + bw * 0.75, oy + bh - 6);
  ctx.stroke();

  // 3. Render physical items inside the open bag
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // Clip nicely to bag interior with slight overhang allowance while dragging
  for (const item of bag.items) {
    if (item.seized) continue;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);
    ctx.scale(
      item.scale * (item.instanceId === opts.draggingItemId ? 1.06 : 1),
      item.scale * (item.instanceId === opts.draggingItemId ? 1.06 : 1),
    );
    drawRealisticItem(ctx, item);

    // Selection / hover highlight outline
    const isSelected = item.instanceId === opts.selectedItemId;
    const isHovered = item.instanceId === opts.hoveredItemId;
    if (isSelected || isHovered) {
      const hw = item.template.width * 0.54;
      const hh = item.template.height * 0.54;
      ctx.strokeStyle = isSelected
        ? item.template.contraband
          ? '#ef4444'
          : '#38bdf8'
        : 'rgba(248, 250, 252, 0.55)';
      ctx.lineWidth = isSelected ? 2.4 : 1.5;
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    }

    ctx.restore();
  }

  ctx.restore();

  // 4. Optional Lead-Lined False-Bottom Liner Flap (must be clicked to peel open!)
  if (bag.hasLeadLining && !bag.falseBottomOpened) {
    ctx.fillStyle = 'rgba(20, 26, 36, 0.96)';
    ctx.beginPath();
    ctx.roundRect(ox + 12, oy + 12, bw - 24, bh - 24, 10);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fde68a';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DENSE FALSE-BOTTOM LINER DETECTED', ox + bw / 2, oy + bh / 2 - 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 11px "Inter", sans-serif';
    ctx.fillText('Click to unfasten & peel back shielded compartment', ox + bw / 2, oy + bh / 2 + 14);
    ctx.textAlign = 'left';
  }

  // Table corner calibration label
  ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.fillText(`SECONDARY SEARCH TABLE  •  ${bag.id} (${bag.type.toUpperCase()})`, 14, 18);
  ctx.fillText('DRAG ITEMS TO RUMMAGE • CLICK TO INSPECT', width - 275, 18);

  ctx.restore();
}

export function renderPhysicalItemThumbnail(
  ctx: CanvasRenderingContext2D,
  template: ItemTemplate,
): void {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = '#18202c';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min((width - 18) / template.width, (height - 16) / template.height, 0.95);
  ctx.translate(width * 0.5, height * 0.5);
  ctx.scale(scale, scale);

  drawRealisticItem(ctx, {
    instanceId: 'preview',
    template,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    flagged: false,
  });

  ctx.restore();
}
