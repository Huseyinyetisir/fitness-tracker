import { routeHref, type Route, type Tab } from '../app/routes';

const TABS: { tab: Tab; label: string; route: Route }[] = [
  { tab: 'today', label: 'Today', route: { name: 'today' } },
  { tab: 'plan', label: 'Plan', route: { name: 'plan' } },
  { tab: 'progress', label: 'Progress', route: { name: 'progress' } },
  { tab: 'log', label: 'Log', route: { name: 'log' } },
  { tab: 'settings', label: 'Settings', route: { name: 'settings' } },
];

export default function TabBar({ active }: { active: Tab }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[var(--inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => (
          <li key={t.tab}>
            <a
              href={routeHref(t.route)}
              aria-current={active === t.tab ? 'page' : undefined}
              className={`flex min-h-14 items-center justify-center text-sm ${active === t.tab ? 'font-semibold text-accent' : 'text-muted'}`}
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
