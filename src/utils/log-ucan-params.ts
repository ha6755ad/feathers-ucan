// Utility: UCAN diagnostics logger for use around ucanAuth/allUcanAuth
// Minimal helper to understand what values are present at verify time.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logUcanParams = (label: string, context: any): void => {
  const authConfig = context.app?.get?.('authentication') || {};
  const corePath = authConfig.core_path || 'core';
  const entityKey = authConfig.entity || 'login';
  const clientUcanPath = authConfig.client_ucan || 'core.client_ucan';
  const audPath = authConfig.ucan_aud || 'core.ucan_aud';

  const _get = (obj: any, path: string) =>
    String(path || '')
      .split('.')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((o: any, k: string) => (o ? o[k] : undefined), obj);

  const safePreview = (v: unknown) => {
    if (typeof v === 'string') return v.slice(0, 48) + (v.length > 48 ? '…' : '');
    if (v && typeof v === 'object') return `[object ${(v as any).constructor?.name || 'Object'}]`;
    try { return String(v); } catch { return '[unprintable]'; }
  };

  const token = _get(context.params, clientUcanPath);
  const audience = _get(context.params, audPath);
  const entityVal = context.params?.[entityKey];
  const core = context.params?.[corePath];

  const tokenType = typeof token;
  const dotCount = typeof token === 'string' ? (token.match(/\./g) || []).length : -1;
  let parsedOk: boolean | undefined = undefined;
  try {
    // optional dependency at runtime; only used for diagnostics
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseUcan } = require('symbol-ucan');
    const parsed = typeof token === 'string' ? parseUcan(token) : null;
    parsedOk = !!parsed && !!parsed?.payload;
  } catch {
    parsedOk = undefined;
  }

  // eslint-disable-next-line no-console
  console.log('[UCAN DIAG]', label, {
    clientUcanPath,
    audPath,
    tokenType,
    tokenPreview: safePreview(token),
    dotCount, // should be 2 for a compact JWS UCAN
    parsedOk, // true if parseUcan(token) yielded a payload
    audienceType: typeof audience,
    audiencePreview: safePreview(audience),
    entityKey,
    entityType: entityVal ? entityVal.constructor?.name || typeof entityVal : typeof entityVal,
    entityHasId: !!(entityVal && (entityVal._id || entityVal.id)),
    coreType: core ? core.constructor?.name || typeof core : typeof core,
    coreKeys: core && typeof core === 'object' ? Object.keys(core).slice(0, 10) : core,
  });
};

export default logUcanParams;
