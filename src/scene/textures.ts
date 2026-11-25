import * as THREE from 'three';

export interface MaterialTextureSet {
  map: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function createTerrazzoFloorTextures(): MaterialTextureSet {
  const [albedoC, a] = makeCanvas(512, 512);
  const [roughC, r] = makeCanvas(512, 512);

  // Polished warm-cool airport terrazzo tile base
  a.fillStyle = '#c9cdd0';
  a.fillRect(0, 0, 512, 512);

  r.fillStyle = '#404040'; // low roughness = glossy polished floor
  r.fillRect(0, 0, 512, 512);

  // Subtle tile-to-tile tonal variation (2x2 large terrazzo slabs)
  const tones = ['#cbd0d4', '#c4c9ce', '#cfd3d6', '#c6cbd0'];
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      a.fillStyle = tones[ty * 2 + tx];
      a.fillRect(tx * 256, ty * 256, 256, 256);
    }
  }

  // Granite / marble aggregate flecks
  const fleckColors = ['#8c959e', '#616a73', '#e2e6ea', '#a49b8e', '#434a52', '#d7dce0'];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 2400; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const sz = 1 + rand() * 4.2;
    a.fillStyle = fleckColors[Math.floor(rand() * fleckColors.length)];
    a.beginPath();
    a.moveTo(x, y);
    a.lineTo(x + sz, y + rand() * 2);
    a.lineTo(x + sz * 0.6, y + sz);
    a.closePath();
    a.fill();

    // Micro roughness variation on aggregate chips
    const g = Math.floor(48 + rand() * 42);
    r.fillStyle = `rgb(${g},${g},${g})`;
    r.fillRect(x, y, sz, sz);
  }

  // Crisp matte expansion grout lines
  a.strokeStyle = '#7e868f';
  a.lineWidth = 4;
  r.strokeStyle = '#d4d4d4';
  r.lineWidth = 5;
  for (const pos of [0, 256, 512]) {
    a.beginPath();
    a.moveTo(pos, 0);
    a.lineTo(pos, 512);
    a.moveTo(0, pos);
    a.lineTo(512, pos);
    a.stroke();

    r.beginPath();
    r.moveTo(pos, 0);
    r.lineTo(pos, 512);
    r.moveTo(0, pos);
    r.lineTo(512, pos);
    r.stroke();
  }

  const map = new THREE.CanvasTexture(albedoC);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(9, 9);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughC);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(9, 9);
  roughnessMap.anisotropy = 8;

  return { map, roughnessMap };
}

export function createBrushedSteelTextures(): MaterialTextureSet {
  const [albedoC, a] = makeCanvas(256, 256);
  const [bumpC, b] = makeCanvas(256, 256);

  a.fillStyle = '#aeb6bf';
  a.fillRect(0, 0, 256, 256);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, 256, 256);

  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 950; i++) {
    const y = rand() * 256;
    const bright = rand() > 0.5;
    a.fillStyle = bright ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,40,0.08)';
    a.fillRect(0, y, 256, 1 + rand() * 1.4);
    b.fillStyle = bright ? 'rgba(220,220,220,0.16)' : 'rgba(40,40,40,0.16)';
    b.fillRect(0, y, 256, 1);
  }

  const map = new THREE.CanvasTexture(albedoC);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

export function createConveyorBeltTextures(): MaterialTextureSet {
  const [albedoC, a] = makeCanvas(256, 256);
  const [bumpC, b] = makeCanvas(256, 256);

  a.fillStyle = '#1b1f24';
  a.fillRect(0, 0, 256, 256);
  b.fillStyle = '#606060';
  b.fillRect(0, 0, 256, 256);

  // Textured rubber belt ribs
  for (let x = 0; x < 256; x += 16) {
    a.fillStyle = '#252b32';
    a.fillRect(x, 0, 6, 256);
    b.fillStyle = '#c8c8c8';
    b.fillRect(x, 0, 5, 256);
  }

  // Subtle side wear rails
  a.fillStyle = '#111418';
  a.fillRect(0, 0, 256, 14);
  a.fillRect(0, 242, 256, 14);

  // Yellow safety edge stripe
  a.fillStyle = '#eab308';
  a.fillRect(0, 14, 256, 4);
  a.fillRect(0, 238, 256, 4);

  const map = new THREE.CanvasTexture(albedoC);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 1);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 1);

  return { map, bumpMap };
}

export function createTerminalSignTexture(
  topText: string,
  subText: string,
  accentColor = '#f59e0b',
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 220);

  ctx.fillStyle = '#0d1828';
  ctx.fillRect(0, 0, 1024, 220);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 22, 220);
  ctx.fillRect(0, 206, 1024, 14);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 62px "Inter", system-ui, sans-serif';
  ctx.fillText(topText, 56, 98);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 32px "JetBrains Mono", monospace';
  ctx.fillText(subText, 58, 162);

  // TSA / Gate badge icon on right
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.roundRect(830, 38, 152, 130, 14);
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.font = '800 58px "Inter", sans-serif';
  ctx.fillText('B12', 854, 124);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createXRayDecalTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  ctx.fillStyle = '#e5e9ee';
  ctx.fillRect(0, 0, 512, 256);

  // Industrial Smiths Detection style navy/amber stripe
  ctx.fillStyle = '#163150';
  ctx.fillRect(0, 0, 512, 68);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(0, 68, 512, 10);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Inter", sans-serif';
  ctx.fillText('HI-SCAN 6040-2iS', 26, 44);

  // Radiation trefoil warning block
  ctx.fillStyle = '#facc15';
  ctx.fillRect(26, 106, 195, 114);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4;
  ctx.strokeRect(26, 106, 195, 114);
  ctx.fillStyle = '#111827';
  ctx.font = '800 22px "Inter", sans-serif';
  ctx.fillText('CAUTION', 72, 140);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillText('X-RAY RADIATION', 40, 174);
  ctx.fillText('DO NOT REACH IN', 40, 200);

  ctx.fillStyle = '#334155';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillText('DUAL-ENERGY', 255, 138);
  ctx.fillText('AUTOMATED THREAT', 255, 166);
  ctx.fillText('SCREENING SYSTEM', 255, 194);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
