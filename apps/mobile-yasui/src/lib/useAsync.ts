import { useCallback, useEffect, useState } from 'react';
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); setError(null); fn().then(setData).catch((e) => setError(String(e.message ?? e))).finally(() => setLoading(false)); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}
