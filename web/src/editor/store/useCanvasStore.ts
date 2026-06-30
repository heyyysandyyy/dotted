import { create } from 'zustand'
import { createProjectSlice } from './projectSlice'
import { createViewSlice } from './viewSlice'
import { createObjectsSlice } from './objectsSlice'
import type { CanvasState } from './storeTypes'

// Public store types keep their original import path (../store/useCanvasStore).
export type {
  CanvasState,
  ShapeKind,
  SnapMode,
  GridStyle,
  PainterMode,
  GridSettings,
  ViewMode,
} from './storeTypes'

/**
 * The editor store, composed from three slices (project, view, objects). The
 * slices share one set/get, so an action in any slice can read/write the whole
 * state via get() — they're split only for cohesion and smaller files (REFACTOR-001).
 */
export const useCanvasStore = create<CanvasState>((...a) => ({
  ...createProjectSlice(...a),
  ...createViewSlice(...a),
  ...createObjectsSlice(...a),
}))
