import { useEffect, useState } from 'react';

/** Re-render every `ms` so live timers tick without refetching. */
export function useTick(ms = 1000): number {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return Date.now();
}
