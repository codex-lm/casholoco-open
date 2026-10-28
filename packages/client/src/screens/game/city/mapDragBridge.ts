/** Pointer capture stays on the activity button; a canvas resolves the current screen position synchronously. */
export interface MapDragHit {
  clientX: number;
  clientY: number;
  activityKey: string;
  cellId: string | null;
}
export const MAP_DRAG_HIT = 'casholoco:map-drag-hit';
export const MAP_DRAG_END = 'casholoco:map-drag-end';
