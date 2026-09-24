import type { UUID } from '../types/domain';

/**
 * crypto.randomUUID is available in Node 20+, all modern browsers over
 * HTTPS, and the Capacitor Android WebView (which serves over https://).
 */
export function newId(): UUID {
  return crypto.randomUUID();
}
