import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../src/stores/uiStore';

describe('uiStore World Guide modal', () => {
  beforeEach(() => {
    useUiStore.setState({ worldGuideModalSlug: null });
  });

  it('opens a qualified entry and closes it without route state', () => {
    useUiStore.getState().openWorldGuide('atlas:oracle_vessel');

    expect(useUiStore.getState().worldGuideModalSlug).toBe('atlas:oracle_vessel');

    useUiStore.getState().closeWorldGuide();

    expect(useUiStore.getState().worldGuideModalSlug).toBeNull();
  });
});
