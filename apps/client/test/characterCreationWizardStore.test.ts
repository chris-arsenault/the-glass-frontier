import { describe, expect, it } from 'vitest';

import { migrateCharacterCreationState } from '../src/stores/characterCreationWizardStore';

describe('characterCreationWizardStore persistence', () => {
  it('clears origin ids saved before the Encyclopedia cutover', () => {
    const migrated = migrateCharacterCreationState();

    expect(migrated.origin).toEqual({
      allegianceId: '',
      allegianceStance: 'member',
      cultureReferenceId: '',
      homelandId: '',
      speciesReferenceId: '',
    });
  });
});
