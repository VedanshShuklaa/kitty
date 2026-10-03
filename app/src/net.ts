// fetch with a deadline. AbortSignal.timeout isn't in every React Native
// runtime, so the timer is wired by hand.
export async function timedFetch(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
