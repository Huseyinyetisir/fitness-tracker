import { routeHref, type Route } from '../app/routes';

export default function NotFound({ what, back }: { what: string; back: Route }) {
  return (
    <div className="py-8 text-center">
      <p className="mb-4 text-muted">This {what} no longer exists — it may have been deleted on another device.</p>
      <a href={routeHref(back)} className="text-accent">
        Go back
      </a>
    </div>
  );
}
