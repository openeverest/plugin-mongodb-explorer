// Recessed area for JSON output. Mode-aware because action.hover is a translucent
// overlay; the host doesn't publish its surface tokens to plugins.
export const CODE_BLOCK_SX = {
  bgcolor: 'action.hover',
  borderRadius: 1,
  p: 1.5,
  m: 0,
  overflow: 'auto',
  fontFamily: 'monospace',
  fontSize: '0.8125rem',
} as const;

export const MONOSPACE_SX = { fontFamily: 'monospace' } as const;
