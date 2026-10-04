import { useEffect } from 'react';
import SyncBadge from '../components/SyncBadge';
import TabBar from '../components/TabBar';
import Screen from './Screen';
import { routeHref, tabOf } from './routes';
import { useRoute } from './useRoute';

export default function AppShell() {
  const route = useRoute();
  const href = routeHref(route);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [href]);

  return (
    <div className="min-h-full pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-xl px-4 pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <div className="flex justify-end">
          <SyncBadge />
        </div>
        <Screen route={route} />
      </div>
      <TabBar active={tabOf(route)} />
    </div>
  );
}
