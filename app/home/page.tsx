/**
 * /home — v2 redirect stub.
 *
 * v1 home was the SwipeBrowser browse feed. In v2 the equivalent entry point
 * is /wardrobe. This redirect keeps any bookmarked /home links working.
 * The middleware already redirects authenticated users from / to /wardrobe.
 * This file is removed in Phase 9 cleanup.
 */
import { redirect } from 'next/navigation';

export default function HomeRedirect() {
  redirect('/wardrobe');
}
