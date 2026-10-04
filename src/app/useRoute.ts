import { useEffect, useState } from 'react';
import { parseRoute, routeHref, type Route } from './routes';

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

/** Changes screen. `replace` swaps the history entry, so Back skips the old one. */
export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const href = routeHref(route);
  if (opts.replace) window.location.replace(href);
  else window.location.hash = href;
}
