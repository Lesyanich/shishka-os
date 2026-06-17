/* ─── Salad bar grid geometry ───────────────────────────────
 * The hole (1408 × 650 mm) is modelled as a 16-col × 12-row grid of
 * 88 × 54 mm cells. Every GN pan snaps to this grid:
 *   1/1 = 6×6 · 1/2 = 3×6 · 1/3 = 2×6 · 1/4 = 3×3 · 1/6 = 2×3 · 1/9 = 2×2
 * A pan is fully described by (grid_col 0-15, grid_row 0-11, gn_size).
 * Pure module — no React — imported by the hook and the editor.
 */

export const GRID_COLS = 16
export const GRID_ROWS = 12
export const CELL_W_MM = 88
export const CELL_H_MM = 54
export const HOLE_W_MM = GRID_COLS * CELL_W_MM // 1408
export const HOLE_H_MM = GRID_ROWS * CELL_H_MM // 648 ≈ 650

export type GnSize = '1/1' | '1/2' | '1/3' | '1/4' | '1/6' | '1/9'

/** Footprint of each pan in grid cells: w = columns, h = rows. */
export const GN_DIMS: Record<GnSize, { w: number; h: number }> = {
  '1/1': { w: 6, h: 6 },
  '1/2': { w: 3, h: 6 },
  '1/3': { w: 2, h: 6 },
  '1/4': { w: 3, h: 3 },
  '1/6': { w: 2, h: 3 },
  '1/9': { w: 2, h: 2 },
}

/** Palette order (largest → smallest). 1/2 & 1/4 (264mm) don't tile the grid → leave gaps. */
export const PAN_TYPES: GnSize[] = ['1/1', '1/2', '1/3', '1/4', '1/6', '1/9']

/** Real mm footprint, for tooltips. */
export const GN_MM: Record<GnSize, string> = {
  '1/1': '530×325',
  '1/2': '265×325',
  '1/3': '325×176',
  '1/4': '265×162',
  '1/6': '176×162',
  '1/9': '176×108',
}

export function dimsOf(gn: string): { w: number; h: number } {
  return GN_DIMS[(gn as GnSize)] ?? GN_DIMS['1/6']
}

/** Legacy back/front label, derived from grid_row (top half = back). */
export function rowLabel(gridRow: number): 'back' | 'front' {
  return gridRow < GRID_ROWS / 2 ? 'back' : 'front'
}

/** Minimal shape needed to compute occupancy. */
export interface GridPan {
  id: string
  gn_size: string
  grid_col: number
  grid_row: number
}

/** Build a 12×16 occupancy map (occ[row][col]); optionally ignore one pan (the one being dragged). */
export function buildOccupancy(pans: GridPan[], ignoreId?: string): boolean[][] {
  const occ: boolean[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => false),
  )
  for (const p of pans) {
    if (p.id === ignoreId) continue
    const { w, h } = dimsOf(p.gn_size)
    for (let r = p.grid_row; r < p.grid_row + h; r++) {
      for (let c = p.grid_col; c < p.grid_col + w; c++) {
        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) occ[r][c] = true
      }
    }
  }
  return occ
}

/** Can a w×h pan sit at (col,row) without overlap or going out of bounds? */
export function canPlace(occ: boolean[][], col: number, row: number, w: number, h: number): boolean {
  if (col < 0 || row < 0 || col + w > GRID_COLS || row + h > GRID_ROWS) return false
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      if (occ[r][c]) return false
    }
  }
  return true
}

/* ─── Factory default layout (mirror of migration 221, on the 16×12 grid) ─── */

export interface FactoryPan {
  s: GnSize
  c: number // grid_col
  r: number // grid_row
  n?: string // display_name
  p?: string // product_code (resolved to ingredient_id on reset, if found)
  g?: string // color_group
}

export const FACTORY_LAYOUT: Record<1 | 2, FactoryPan[]> = {
  1: [
    // back row — bases + bulky vegetables (1/3)
    { s: '1/3', c: 0, r: 0, n: 'Crispy Mix', p: 'PF-SALAD_BASE_CRISPY', g: 'base' },
    { s: '1/3', c: 2, r: 0, n: 'Superfood Mix', p: 'PF-SALAD_BASE_SUPERFOOD', g: 'base' },
    { s: '1/3', c: 4, r: 0, n: 'Cherry Tomato', p: 'RAW-CHERRY-TOMATO', g: 'vegetable' },
    { s: '1/3', c: 6, r: 0, n: 'Cucumber', p: 'RAW-CUCUMBER', g: 'vegetable' },
    { s: '1/3', c: 8, r: 0, n: 'Red Cabbage', p: 'RAW-RED_CABBAGE', g: 'vegetable' },
    { s: '1/3', c: 10, r: 0, n: 'Carrot', p: 'RAW-CARROT', g: 'vegetable' },
    { s: '1/6', c: 12, r: 0, n: 'Bell Pepper', p: 'RAW-BELL-PEPPER-RED', g: 'vegetable' },
    { s: '1/6', c: 12, r: 3, n: 'Sweet Corn', p: 'RAW-FROZEN-SWEET-CORN', g: 'vegetable' },
    { s: '1/6', c: 14, r: 0, n: 'Radish', p: 'RAW-RADISH', g: 'vegetable' },
    { s: '1/6', c: 14, r: 3 },
    // front row — herbs / toppings (1/6) + seeds (1/9)
    { s: '1/6', c: 0, r: 6, n: 'Red Onion', p: 'RAW-RED_ONION', g: 'vegetable' },
    { s: '1/6', c: 0, r: 9, n: 'Spring Onion & Dill', p: 'RAW-SPRING-ONION', g: 'vegetable' },
    { s: '1/6', c: 2, r: 6, n: 'Parsley', p: 'RAW-PARSLEY', g: 'vegetable' },
    { s: '1/6', c: 2, r: 9 },
    { s: '1/6', c: 4, r: 6 }, { s: '1/6', c: 4, r: 9 },
    { s: '1/6', c: 6, r: 6 }, { s: '1/6', c: 6, r: 9 },
    { s: '1/6', c: 8, r: 6 }, { s: '1/6', c: 8, r: 9 },
    { s: '1/6', c: 10, r: 6 }, { s: '1/6', c: 10, r: 9 },
    { s: '1/9', c: 12, r: 6 }, { s: '1/9', c: 12, r: 8 }, { s: '1/9', c: 12, r: 10 },
    { s: '1/9', c: 14, r: 6 }, { s: '1/9', c: 14, r: 8 }, { s: '1/9', c: 14, r: 10 },
  ],
  2: [
    // back row — proteins (1/3)
    { s: '1/3', c: 0, r: 0, n: 'Chicken', g: 'protein' },
    { s: '1/3', c: 2, r: 0, n: 'Smoked Trout', p: 'RAW-SMOKED_TROUT', g: 'protein' },
    { s: '1/3', c: 4, r: 0, n: 'Boiled Eggs', p: 'RAW-EGG', g: 'protein' },
    { s: '1/3', c: 6, r: 0, n: 'Quinoa', p: 'PF-COOKED_QUINOA', g: 'topping' },
    { s: '1/3', c: 8, r: 0, n: 'Beetroot', p: 'PF-BAKED_BEETROOT', g: 'vegetable' },
    { s: '1/3', c: 10, r: 0 },
    { s: '1/6', c: 12, r: 0, n: 'Red Beans', p: 'PF-RED_BEANS', g: 'protein' },
    { s: '1/6', c: 12, r: 3, n: 'Edamame', p: 'RAW-FROZEN-EDAMAME', g: 'protein' },
    { s: '1/6', c: 14, r: 0, n: 'Pomegranate', p: 'RAW-POMEGRANATE-SEEDS', g: 'accent' },
    { s: '1/6', c: 14, r: 3 },
    // front row — cheeses / nuts (1/6) + seeds (1/9)
    { s: '1/6', c: 0, r: 6, n: 'Feta', p: 'RAW-CHEESE-FETA', g: 'topping' },
    { s: '1/6', c: 0, r: 9, n: 'Parmesan', p: 'RAW-CHEESE-PARMESAN', g: 'topping' },
    { s: '1/6', c: 2, r: 6, n: 'Walnuts', p: 'RAW-WALNUTS', g: 'topping' },
    { s: '1/6', c: 2, r: 9 },
    { s: '1/6', c: 4, r: 6 }, { s: '1/6', c: 4, r: 9 },
    { s: '1/6', c: 6, r: 6 }, { s: '1/6', c: 6, r: 9 },
    { s: '1/6', c: 8, r: 6 }, { s: '1/6', c: 8, r: 9 },
    { s: '1/6', c: 10, r: 6 }, { s: '1/6', c: 10, r: 9 },
    { s: '1/9', c: 12, r: 6, n: 'Almond', p: 'RAW-ALMOND_SLICED', g: 'topping' },
    { s: '1/9', c: 12, r: 8, n: 'Cranberries', p: 'RAW-DRIED-CRANBERRIES', g: 'accent' },
    { s: '1/9', c: 12, r: 10, n: 'Pumpkin Seeds', p: 'RAW-PUMPKIN-SEEDS', g: 'topping' },
    { s: '1/9', c: 14, r: 6 }, { s: '1/9', c: 14, r: 8 }, { s: '1/9', c: 14, r: 10 },
  ],
}

export const EQUIPMENT_ID: Record<1 | 2, string> = {
  1: '1c5b1920-e911-4c0f-a0f9-18f58a552f49',
  2: 'd12b2832-07c2-49b6-acd2-9cce09dbd4b3',
}

/* ─── Free-form placement (real mm + rotation) ─────────────
 * Pans are positioned by their top-left (x_mm, y_mm) inside the 1408×650 hole
 * and may be rotated 90°. GN side lengths are incommensurable, so we don't snap
 * to a single cell grid — positions snap to a light 44×54 mm lattice (aligns the
 * common 176/265/530 widths and 162/108/325 depths within ~2 mm) and overlaps
 * are rejected. Gaps are allowed.
 */

export const SNAP_X_MM = 44
export const SNAP_Y_MM = 54

/** GN footprint in DEFAULT orientation (w = along the bar, h = depth), snapped to
 *  the 44×54 mm lattice so default-orientation pans tile with no 1mm gaps
 *  (real GN ~530/265/325; we use 528/264/324 = exact lattice multiples). */
export const GN_REAL: Record<GnSize, { w: number; h: number }> = {
  '1/1': { w: 528, h: 324 },
  '1/2': { w: 264, h: 324 },
  '1/3': { w: 176, h: 324 },
  '1/4': { w: 264, h: 162 },
  '1/6': { w: 176, h: 162 },
  '1/9': { w: 176, h: 108 },
}

/** Footprint in mm given rotation (0 or 90 swaps w/h). Falls back to 1/6. */
export function footprintMM(gn: string, rotation: number): { w: number; h: number } {
  const base = GN_REAL[(gn as GnSize)] ?? GN_REAL['1/6']
  return rotation === 90 ? { w: base.h, h: base.w } : { w: base.w, h: base.h }
}

export function snapX(x: number): number {
  return Math.round(x / SNAP_X_MM) * SNAP_X_MM
}
export function snapY(y: number): number {
  return Math.round(y / SNAP_Y_MM) * SNAP_Y_MM
}

export interface FreePan {
  id: string
  gn_size: string
  x_mm: number
  y_mm: number
  rotation: number
}

/** Axis-aligned overlap of two rectangles (touching edges is allowed). */
export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

/** Can a w×h pan sit at (x,y) inside the hole without overlapping others? */
export function canPlaceFree(
  pans: FreePan[],
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreId?: string,
): boolean {
  if (x < 0 || y < 0 || x + w > HOLE_W_MM || y + h > HOLE_H_MM) return false
  for (const p of pans) {
    if (p.id === ignoreId) continue
    const f = footprintMM(p.gn_size, p.rotation)
    if (rectsOverlap(x, y, w, h, p.x_mm, p.y_mm, f.w, f.h)) return false
  }
  return true
}
