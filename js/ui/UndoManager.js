import { TubeModel } from '../tube/TubeModel.js';
import { ConnectorModel } from '../tube/ConnectorModel.js';

/**
 * Snapshot-based undo/redo manager.
 * Captures full tube + connector state before each mutation.
 * Restores by rebuilding from serialized JSON.
 */
export class UndoManager {
  constructor(tubeManager, connectorManager) {
    this.tubeManager = tubeManager;
    this.connectorManager = connectorManager;
    this.undoStack = [];
    this.redoStack = [];
    this.maxSteps = 50;
    this._restoring = false;
  }

  /**
   * Capture current state as an undo checkpoint.
   * Call BEFORE any mutation.
   */
  capture() {
    if (this._restoring) return;
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo()) return false;
    this.redoStack.push(this._snapshot());
    this._restore(this.undoStack.pop());
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.undoStack.push(this._snapshot());
    this._restore(this.redoStack.pop());
    return true;
  }

  /**
   * Clear all history (e.g., on project load).
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  _snapshot() {
    return {
      tubes: this.tubeManager.tubes.map(t => t.toJSON()),
      connectors: this.connectorManager.toJSON(),
      selectedTubeId: this.tubeManager.selectedTube?.id ?? null,
    };
  }

  _restore(snapshot) {
    this._restoring = true;
    try {
      // Silently dispose all tube meshes
      for (const tube of this.tubeManager.tubes) {
        this.tubeManager._disposeTubeMesh(tube);
      }
      this.tubeManager.tubes = [];
      this.tubeManager.selectedTube = null;
      this.tubeManager.selectedTubeIds.clear();

      // Clear connectors
      this.connectorManager.clearAll();

      // Restore tubes
      let maxId = 0;
      let maxGroupId = 0;
      for (const tubeData of (snapshot.tubes || [])) {
        const tube = TubeModel.fromJSON(tubeData);
        if (tube.id > maxId) maxId = tube.id;
        if (tube.groupId && tube.groupId >= maxGroupId) maxGroupId = tube.groupId;
        this.tubeManager.tubes.push(tube);
        this.tubeManager._buildTubeMesh(tube);
      }
      TubeModel.resetIdCounter(maxId);
      this.tubeManager.nextGroupId = maxGroupId + 1;

      // Restore connectors
      if (snapshot.connectors && snapshot.connectors.length > 0) {
        this.connectorManager.loadFromJSON(snapshot.connectors);
      }

      // Restore selection (without firing callbacks — UIManager will refresh)
      const selectedId = snapshot.selectedTubeId;
      if (selectedId != null) {
        const tube = this.tubeManager.getTubeById(selectedId);
        if (tube) {
          this.tubeManager.selectedTube = tube;
          tube.selected = true;
          this.tubeManager.selectedTubeIds.add(tube.id);
        }
      }
    } finally {
      this._restoring = false;
    }
  }
}
