import type { ItemTemplate } from '../sim/types';

/**
 * Realistic multi-layer X-ray item silhouettes.
 * Coordinates are centered around (0, 0) in item-local pixels.
 * Materials map to authentic TSA dual-energy attenuation:
 *   organic = orange (clothes, food, liquids, explosives, polymer grips)
 *   mixed   = green  (electronics, glass, aluminum, battery cells)
 *   metal   = blue   (steel blades, gun barrels, brass, dense alloys)
 *   dense   = dark/black (lead shielding, ultra-dense cores)
 */
export const LEGAL_ITEMS: ItemTemplate[] = [
  {
    id: 'laptop',
    name: 'Laptop Computer',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 126,
    height: 86,
    hint: 'Authorized electronics — PCB, battery array, aluminum chassis.',
    shapes: [
      { kind: 'roundRect', material: 'mixed', density: 0.42, x: -60, y: -40, w: 120, h: 80, r: 6 },
      { kind: 'rect', material: 'metal', density: 0.65, x: -52, y: 14, w: 104, h: 20 }, // battery cells
      { kind: 'rect', material: 'mixed', density: 0.55, x: -48, y: -32, w: 66, h: 40 }, // motherboard
      { kind: 'circle', material: 'metal', density: 0.72, x: 34, y: -14, r: 13 }, // cooling fan
      { kind: 'line', material: 'metal', density: 0.78, points: [[-56, -38], [56, -38]], lineWidth: 4 }, // hinge
    ],
  },
  {
    id: 'folded_clothes',
    name: 'Folded Garments',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 112,
    height: 78,
    hint: 'Low-density organic fabric.',
    shapes: [
      { kind: 'roundRect', material: 'organic', density: 0.26, x: -54, y: -36, w: 108, h: 72, r: 12 },
      { kind: 'roundRect', material: 'organic', density: 0.2, x: -42, y: -24, w: 84, h: 48, r: 8 },
      { kind: 'line', material: 'metal', density: 0.55, points: [[-38, -28], [38, -28]], lineWidth: 2 }, // zipper
    ],
  },
  {
    id: 'sneaker',
    name: 'Running Shoe',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 108,
    height: 48,
    hint: 'Foam sole and fabric upper.',
    shapes: [
      {
        kind: 'polygon',
        material: 'organic',
        density: 0.36,
        points: [[-50, 14], [48, 14], [52, 4], [28, -6], [6, -20], [-36, -22], [-48, -6]],
      },
      { kind: 'roundRect', material: 'organic', density: 0.48, x: -50, y: 8, w: 100, h: 10, r: 4 },
      { kind: 'circle', material: 'metal', density: 0.5, x: -10, y: -12, r: 2.2 },
      { kind: 'circle', material: 'metal', density: 0.5, x: -2, y: -10, r: 2.2 },
      { kind: 'circle', material: 'metal', density: 0.5, x: 6, y: -8, r: 2.2 },
    ],
  },
  {
    id: 'headphones',
    name: 'Over-Ear Headphones',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 78,
    height: 74,
    hint: 'Authorized audio gear — magnets inside earcups.',
    shapes: [
      {
        kind: 'polygon',
        material: 'organic',
        density: 0.35,
        points: [[-28, 6], [-32, -16], [-18, -32], [18, -32], [32, -16], [28, 6], [22, 6], [24, -14], [12, -25], [-12, -25], [-24, -14], [-22, 6]],
      },
      { kind: 'ellipse', material: 'mixed', density: 0.55, x: -24, y: 14, rx: 12, ry: 17 },
      { kind: 'ellipse', material: 'mixed', density: 0.55, x: 24, y: 14, rx: 12, ry: 17 },
      { kind: 'circle', material: 'metal', density: 0.72, x: -24, y: 14, r: 6 },
      { kind: 'circle', material: 'metal', density: 0.72, x: 24, y: 14, r: 6 },
    ],
  },
  {
    id: 'camera',
    name: 'DSLR Camera',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 76,
    height: 60,
    hint: 'Camera body with glass optical lens.',
    shapes: [
      { kind: 'roundRect', material: 'mixed', density: 0.58, x: -34, y: -18, w: 68, h: 42, r: 6 },
      { kind: 'rect', material: 'mixed', density: 0.52, x: -16, y: -27, w: 28, h: 12 },
      { kind: 'circle', material: 'metal', density: 0.76, x: 2, y: 4, r: 16 },
      { kind: 'circle', material: 'mixed', density: 0.5, x: 2, y: 4, r: 10 },
    ],
  },
  {
    id: 'charger_cable',
    name: 'Power Adapter & Cable',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 82,
    height: 52,
    hint: 'Standard phone/laptop charger.',
    shapes: [
      { kind: 'roundRect', material: 'mixed', density: 0.54, x: -36, y: -14, w: 28, h: 28, r: 5 },
      { kind: 'rect', material: 'metal', density: 0.78, x: -44, y: -8, w: 9, h: 4 },
      { kind: 'rect', material: 'metal', density: 0.78, x: -44, y: 4, w: 9, h: 4 },
      {
        kind: 'line',
        material: 'metal',
        density: 0.45,
        points: [[-8, 0], [10, -14], [28, -10], [34, 6], [18, 16], [4, 8], [16, -2], [38, 14]],
        lineWidth: 2.5,
      },
    ],
  },
  {
    id: 'book',
    name: 'Hardcover Book',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 76,
    height: 98,
    hint: 'Uniform organic paper block.',
    shapes: [
      { kind: 'rect', material: 'organic', density: 0.44, x: -35, y: -46, w: 70, h: 92 },
      { kind: 'line', material: 'organic', density: 0.58, points: [[-33, -46], [-33, 46]], lineWidth: 4 },
    ],
  },
  {
    id: 'toiletries_mini',
    name: 'Travel Toiletry Pouch (≤100ml)',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 72,
    height: 46,
    hint: 'TSA-compliant mini travel tubes.',
    shapes: [
      { kind: 'roundRect', material: 'organic', density: 0.22, x: -34, y: -20, w: 68, h: 40, r: 8 },
      { kind: 'roundRect', material: 'organic', density: 0.46, x: -26, y: -12, w: 16, h: 24, r: 4 },
      { kind: 'roundRect', material: 'organic', density: 0.42, x: -4, y: -10, w: 14, h: 22, r: 4 },
      { kind: 'rect', material: 'organic', density: 0.35, x: 14, y: -14, w: 12, h: 26 }, // toothbrush
    ],
  },
  {
    id: 'umbrella',
    name: 'Compact Umbrella',
    category: 'legal',
    contraband: false,
    minLevel: 2,
    width: 118,
    height: 24,
    hint: 'Collapsible umbrella ribs (legal in carry-on).',
    shapes: [
      { kind: 'roundRect', material: 'organic', density: 0.34, x: -44, y: -9, w: 82, h: 18, r: 8 },
      { kind: 'line', material: 'metal', density: 0.68, points: [[-52, 0], [42, 0]], lineWidth: 3 },
      { kind: 'line', material: 'metal', density: 0.5, points: [[-40, -5], [34, -4]], lineWidth: 1.5 },
      { kind: 'line', material: 'metal', density: 0.5, points: [[-40, 5], [34, 4]], lineWidth: 1.5 },
      { kind: 'roundRect', material: 'organic', density: 0.45, x: 40, y: -6, w: 14, h: 12, r: 4 },
    ],
  },
  {
    id: 'keys_glasses',
    name: 'Eyeglasses & Keyring',
    category: 'legal',
    contraband: false,
    minLevel: 1,
    width: 68,
    height: 44,
    hint: 'Personal eyewear case and house keys.',
    shapes: [
      { kind: 'roundRect', material: 'organic', density: 0.32, x: -32, y: -18, w: 64, h: 24, r: 10 },
      { kind: 'circle', material: 'metal', density: 0.72, x: -14, y: 12, r: 6 },
      { kind: 'rect', material: 'metal', density: 0.78, x: -6, y: 10, w: 18, h: 4 },
      { kind: 'rect', material: 'metal', density: 0.78, x: -4, y: 16, w: 15, h: 3.5 },
    ],
  },
];

export const CONTRABAND_ITEMS: ItemTemplate[] = [
  {
    id: 'handgun',
    name: 'Concealed 9mm Handgun',
    category: 'weapon',
    contraband: true,
    minLevel: 1,
    width: 96,
    height: 64,
    hint: 'PROHIBITED FIREARM — dense steel slide, barrel, trigger guard & magazine.',
    shapes: [
      // Dense steel slide & barrel
      { kind: 'rect', material: 'metal', density: 0.96, x: -42, y: -26, w: 84, h: 17 },
      { kind: 'rect', material: 'dense', density: 1.15, x: -38, y: -22, w: 72, h: 7 }, // bore/barrel core
      // Receiver & trigger guard
      { kind: 'rect', material: 'metal', density: 0.85, x: -24, y: -9, w: 58, h: 9 },
      {
        kind: 'polygon',
        material: 'metal',
        density: 0.72,
        points: [[-2, 0], [18, 0], [16, 13], [-4, 13]],
      },
      // Angled grip with metallic magazine inside
      {
        kind: 'polygon',
        material: 'organic',
        density: 0.56,
        points: [[-34, -9], [-10, -9], [-20, 30], [-42, 26]],
      },
      {
        kind: 'polygon',
        material: 'metal',
        density: 0.92,
        points: [[-30, -6], [-15, -6], [-23, 27], [-37, 24]],
      },
    ],
  },
  {
    id: 'combat_knife',
    name: 'Tactical Combat Knife',
    category: 'weapon',
    contraband: true,
    minLevel: 1,
    width: 112,
    height: 28,
    hint: 'PROHIBITED BLADE — fixed high-carbon steel blade with crossguard.',
    shapes: [
      // Sharp steel blade
      {
        kind: 'polygon',
        material: 'metal',
        density: 0.95,
        points: [[-8, -7], [38, -7], [54, 1], [38, 7], [-8, 6]],
      },
      { kind: 'line', material: 'dense', density: 1.1, points: [[-6, -4], [44, -1]], lineWidth: 2.5 },
      // Crossguard
      { kind: 'rect', material: 'metal', density: 0.96, x: -13, y: -13, w: 6, h: 26 },
      // Tang inside organic handle
      { kind: 'roundRect', material: 'organic', density: 0.52, x: -52, y: -7, w: 39, h: 14, r: 4 },
      { kind: 'rect', material: 'metal', density: 0.85, x: -50, y: -3, w: 37, h: 6 },
    ],
  },
  {
    id: 'oversized_liquid',
    name: 'Oversized Liquid Bottle (1.5L)',
    category: 'liquid',
    contraband: true,
    minLevel: 1,
    width: 52,
    height: 114,
    hint: 'PROHIBITED LIQUID (>100ml) — large uniform organic fluid volume.',
    shapes: [
      // Bottle shell
      { kind: 'roundRect', material: 'organic', density: 0.62, x: -22, y: -34, w: 44, h: 86, r: 10 },
      // Dense liquid body
      { kind: 'roundRect', material: 'organic', density: 0.72, x: -19, y: -22, w: 38, h: 71, r: 6 },
      // Neck & cap
      { kind: 'rect', material: 'organic', density: 0.45, x: -9, y: -49, w: 18, h: 16 },
      { kind: 'rect', material: 'mixed', density: 0.64, x: -10, y: -55, w: 20, h: 8 },
    ],
  },
  {
    id: 'ied_package',
    name: 'Improvised Explosive (IED)',
    category: 'explosive',
    contraband: true,
    minLevel: 2,
    width: 96,
    height: 68,
    hint: 'CRITICAL THREAT — dense organic explosive brick wired to timer PCB & detonator.',
    shapes: [
      // Plastic explosive brick (high-density organic!)
      { kind: 'roundRect', material: 'organic', density: 0.88, x: -44, y: -26, w: 54, h: 52, r: 5 },
      // Detonator cylinder embedded in organic mass
      { kind: 'rect', material: 'dense', density: 1.15, x: -10, y: -6, w: 22, h: 12 },
      // Timer circuit board + battery pack
      { kind: 'rect', material: 'mixed', density: 0.68, x: 16, y: -22, w: 28, h: 24 },
      { kind: 'rect', material: 'metal', density: 0.85, x: 18, y: 6, w: 24, h: 18 },
      // Detonator wiring
      { kind: 'line', material: 'metal', density: 0.88, points: [[12, -2], [18, -10], [28, 6]], lineWidth: 2.5 },
      { kind: 'line', material: 'metal', density: 0.88, points: [[12, 3], [22, 14]], lineWidth: 2.5 },
    ],
  },
  {
    id: 'brass_knuckles',
    name: 'Steel Brass Knuckles',
    category: 'blunt',
    contraband: true,
    minLevel: 2,
    width: 78,
    height: 48,
    hint: 'PROHIBITED BLUNT WEAPON — dense four-ring metal frame.',
    shapes: [
      { kind: 'roundRect', material: 'metal', density: 0.94, x: -34, y: 4, w: 68, h: 14, r: 7 },
      { kind: 'circle', material: 'metal', density: 0.96, x: -24, y: -6, r: 10 },
      { kind: 'circle', material: 'metal', density: 0.96, x: -8, y: -9, r: 10 },
      { kind: 'circle', material: 'metal', density: 0.96, x: 8, y: -9, r: 10 },
      { kind: 'circle', material: 'metal', density: 0.96, x: 24, y: -6, r: 10 },
      // Cutout feel via lower-density inner centers (rendered as subtle hollow illusion via dense rims)
      { kind: 'rect', material: 'dense', density: 1.05, x: -32, y: 8, w: 64, h: 6 },
    ],
  },
  {
    id: 'chemical_canister',
    name: 'Pressurized Chemical Canister',
    category: 'chemical',
    contraband: true,
    minLevel: 2,
    width: 44,
    height: 98,
    hint: 'PROHIBITED HAZMAT — pressurized metal aerosol / pepper canister with dip tube.',
    shapes: [
      { kind: 'roundRect', material: 'metal', density: 0.86, x: -18, y: -32, w: 36, h: 78, r: 8 },
      { kind: 'rect', material: 'organic', density: 0.72, x: -14, y: -16, w: 28, h: 58 },
      { kind: 'line', material: 'metal', density: 0.9, points: [[0, -38], [0, 38]], lineWidth: 2.5 }, // dip tube
      { kind: 'rect', material: 'metal', density: 0.92, x: -8, y: -44, w: 16, h: 12 },
      { kind: 'rect', material: 'mixed', density: 0.65, x: -5, y: -49, w: 12, h: 6 }, // spray nozzle
    ],
  },
  {
    id: 'grenade',
    name: 'Fragmentation Grenade',
    category: 'explosive',
    contraband: true,
    minLevel: 3,
    width: 58,
    height: 76,
    hint: 'CRITICAL THREAT — dense ribbed metal casing with pin & spoon lever.',
    shapes: [
      { kind: 'ellipse', material: 'dense', density: 1.15, x: -2, y: 8, rx: 21, ry: 26 },
      { kind: 'ellipse', material: 'organic', density: 0.8, x: -2, y: 8, rx: 13, ry: 18 },
      { kind: 'rect', material: 'metal', density: 0.96, x: -9, y: -28, w: 14, h: 14 },
      { kind: 'circle', material: 'metal', density: 0.92, x: -18, y: -22, r: 7 }, // pull ring
      {
        kind: 'polygon',
        material: 'metal',
        density: 0.92,
        points: [[4, -27], [17, -20], [23, 12], [17, 14], [11, -15], [4, -19]], // spoon
      },
    ],
  },
  {
    id: 'switchblade',
    name: 'Concealed Stiletto Switchblade',
    category: 'weapon',
    contraband: true,
    minLevel: 3,
    width: 96,
    height: 20,
    hint: 'PROHIBITED WEAPON — spring-loaded metallic blade mechanism.',
    shapes: [
      { kind: 'roundRect', material: 'metal', density: 0.9, x: -46, y: -7, w: 48, h: 14, r: 4 },
      { kind: 'line', material: 'dense', density: 1.1, points: [[-40, 0], [0, 0]], lineWidth: 3 },
      {
        kind: 'polygon',
        material: 'metal',
        density: 0.96,
        points: [[2, -5], [38, -3], [48, 0], [38, 3], [2, 5]],
      },
    ],
  },
];
