export interface LabelRect { x: number; y: number; width: number; height: number }

/** Place a city label near its projected anchor, or hide it when no nearby position is legible. */
export function placeIslandLabel(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  obstacles: readonly LabelRect[],
): LabelRect | null {
  const margin = 8, gap = 8;
  const { width, height } = size;
  if (![anchor.x, anchor.y, width, height, viewport.width, viewport.height].every(Number.isFinite)
    || width <= 0 || height <= 0 || viewport.width <= 0 || viewport.height <= 0
    || anchor.x < 0 || anchor.y < 0 || anchor.x > viewport.width || anchor.y > viewport.height) return null;
  if (obstacles.some(rect => ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.width < 0 || rect.height < 0)) return null;

  const overlaps = (candidate: LabelRect, other: LabelRect) => other.width > 0 && other.height > 0
    && candidate.x < other.x + other.width && candidate.x + width > other.x
    && candidate.y < other.y + other.height && candidate.y + height > other.y;
  // First try the four centered positions. Then only move along their edge, at most 18 px.
  const positions = [
    { x: anchor.x - width / 2, y: anchor.y - height - gap, horizontal: true },
    { x: anchor.x - width / 2, y: anchor.y + gap, horizontal: true },
    { x: anchor.x - width - gap, y: anchor.y - height / 2, horizontal: false },
    { x: anchor.x + gap, y: anchor.y - height / 2, horizontal: false },
  ];
  for (const shift of [0, -9, 9, -18, 18]) {
    for (const position of positions) {
      const rect = {
        x: position.x + (position.horizontal ? shift : 0),
        y: position.y + (position.horizontal ? 0 : shift), width, height,
      };
      if (rect.x >= margin && rect.y >= margin
        && rect.x + width <= viewport.width - margin && rect.y + height <= viewport.height - margin
        && !obstacles.some(obstacle => overlaps(rect, obstacle))) return rect;
    }
  }
  return null;
}
