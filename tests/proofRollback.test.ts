import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESS, type ErrandProgress } from '../src/services/missionProgress';
import { proofRollbackMessage, undoHandover, undoSectionReceipt } from '../src/services/proofRollback';

/**
 * A photo the step showed as saved did not make it to the server. The tick
 * comes back off, or the errand would claim evidence nobody holds.
 */

const ticked: ErrandProgress = {
  ...DEFAULT_PROGRESS,
  currentStatus: 'Traveling',
  completedSubtasks: { 0: true, 1: true },
  departedStoreIds: [11, 12],
  storeArrivalTimestamp: null,
};

describe("a store's receipt that did not save", () => {
  it('reopens that section only, and puts the rider back at that store', () => {
    const patch = undoSectionReceipt(ticked, 1, 12, 5000);
    expect(patch.completedSubtasks).toEqual({ 0: true });
    expect(patch.departedStoreIds).toEqual([11]);
    expect(patch.currentStatus).toBe('At Store');
    expect(patch.storeArrivalTimestamp).toBe(5000);
  });

  it('brings a rider sent on to the customer back to the store', () => {
    const patch = undoSectionReceipt({ ...ticked, currentStatus: 'Delivering' }, 0, 11);
    expect(patch.currentStatus).toBe('At Store');
  });

  it('leaves a delivered errand delivered: the server already has that', () => {
    const patch = undoSectionReceipt({ ...ticked, currentStatus: 'Delivered' }, 0, 11);
    expect(patch.currentStatus).toBeUndefined();
    expect(patch.completedSubtasks).toEqual({ 1: true });
  });
});

describe('a handover photo that did not upload', () => {
  it('makes "Delivered" wait for a new one', () => {
    expect(undoHandover({ ...ticked, currentStatus: 'Delivering', handoverCaptured: true })).toEqual({
      handoverCaptured: false,
    });
  });

  it('changes nothing once delivered', () => {
    expect(undoHandover({ ...ticked, currentStatus: 'Delivered', handoverCaptured: true })).toEqual({});
  });
});

describe('what the rider is told', () => {
  it('names the store and says what to do', () => {
    expect(proofRollbackMessage('receipt', 'Gaisano', new Error('The connection dropped'))).toBe(
      'The receipt for Gaisano did not save. The connection dropped. Photograph it again.'
    );
  });

  it('does not say "again" twice when the reason already does', () => {
    expect(
      proofRollbackMessage('receipt', 'Gaisano', new Error('That photo was not saved in time. Please take it again.'))
    ).toBe('The receipt for Gaisano did not save. That photo was not saved in time. Please take it again.');
  });

  it('covers the handover', () => {
    expect(proofRollbackMessage('handover', null, undefined)).toBe(
      'The handover photo did not upload. The connection dropped. Take it again.'
    );
  });
});
