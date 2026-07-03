export const DEFAULT_MAX_PAGES = 1;
export const DEFAULT_MAX_DEPTH = 0;

export const SCROLL_SETTINGS = {
  /** Pixels to scroll per step */
  SCROLL_STEP_PX: 400,
  /** Milliseconds to wait between scroll steps */
  SCROLL_DELAY_MS: 300,
  /** Extra milliseconds to wait when new content is detected */
  LAZY_LOAD_WAIT_MS: 1500,
  /** Hard time limit in milliseconds to prevent infinite loops */
  MAX_SCROLL_TIME_MS: 15000,
} as const;
