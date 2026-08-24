import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../src/stores/uiStore';

describe('uiStore Atlas modal', () => {
  beforeEach(() => {
    useUiStore.setState({ atlasModalSlug: null });
  });

  it('opens an Atlas entry by slug and closes it without route state', () => {
    useUiStore.getState().openAtlasModal('oracle_vessel');

    expect(useUiStore.getState().atlasModalSlug).toBe('oracle_vessel');

    useUiStore.getState().closeAtlasModal();

    expect(useUiStore.getState().atlasModalSlug).toBeNull();
  });
});
