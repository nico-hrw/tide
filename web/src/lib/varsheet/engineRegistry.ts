import { tideEngine } from './tideEngine';
import type { VarSheetEngine, VarSheetLanguageId } from './types';

const DEFAULT_ENGINE_ID: VarSheetLanguageId = 'tide';

const engineMap = new Map<VarSheetLanguageId, VarSheetEngine>([
  [tideEngine.id, tideEngine],
]);

/**
 * Registers or replaces a VarSheet execution engine by its language ID.
 */
export function registerEngine(engine: VarSheetEngine): void {
  engineMap.set(engine.id, engine);
}

/**
 * Looks up a registered VarSheet engine by language ID.
 */
export function getEngine(id: VarSheetLanguageId): VarSheetEngine | undefined {
  return engineMap.get(id);
}

/**
 * Returns all currently registered VarSheet engines in registration order.
 */
export function listEngines(): VarSheetEngine[] {
  return Array.from(engineMap.values());
}

/**
 * Returns the default built-in VarSheet engine (`tide`).
 */
export function getDefaultEngine(): VarSheetEngine {
  return engineMap.get(DEFAULT_ENGINE_ID) ?? tideEngine;
}
