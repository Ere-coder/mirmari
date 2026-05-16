/**
 * Messages — route: /messages
 *
 * Admin ↔ user messaging. Users can contact MirMari about delivery,
 * sizing, or support. There is no user-to-user messaging.
 *
 * Phase 1: auth check + empty state shell.
 * Phase 7: conversation list and chat thread built here.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <>
      <main className="screen-full pb-24">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-10 pb-6">
          <p className="text-xs font-medium tracking-widest uppercase text-brand-dark/40 mb-1">
            MirMari
          </p>
          <h1 className="text-2xl font-semibold text-brand-dark">
            Messages
          </h1>
        </div>

        {/* ── Empty state ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center flex-1 px-6 gap-6 py-16">
          <div className="w-20 h-20 flex items-center justify-center text-brand-dark/10">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>

          <div className="text-center max-w-xs">
            <p className="text-base font-medium text-brand-dark mb-2">
              No conversations yet
            </p>
            <p className="text-sm text-brand-dark/50 leading-relaxed">
              Need help with delivery, sizing, or your subscription?
              Contact us here — our team responds within a few hours.
            </p>
          </div>
        </div>
      </main>

      <BottomNav />
    </>
  );
}
