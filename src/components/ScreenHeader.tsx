import type { ReactNode } from 'react';
import { routeHref, type Route } from '../app/routes';

export default function ScreenHeader({ title, back, action }: { title: string; back?: Route; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <a href={routeHref(back)} aria-label="Back" className="-ml-3 grid size-12 shrink-0 place-items-center text-3xl">
          ‹
        </a>
      )}
      <h1 className="flex-1 truncate text-2xl font-semibold">{title}</h1>
      {action}
    </header>
  );
}
