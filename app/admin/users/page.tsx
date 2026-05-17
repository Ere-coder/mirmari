/**
 * Admin — Users: /admin/users
 *
 * Lists all user profiles with their subscription status.
 * Admin can change subscription status directly from this page.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import type { SubscriptionStatus } from '@/lib/types-v2';
import UserList from './UserList';

export const dynamic = 'force-dynamic';

export interface UserWithSub {
  id: string;
  display_name: string | null;
  phone: string;
  delivery_zone: string | null;
  size_preference: string | null;
  is_admin: boolean;
  created_at: string;
  subscription: {
    id: string;
    status: SubscriptionStatus;
    started_at: string;
    billing_anchor_day: number | null;
    notes: string | null;
  } | null;
}

const STATUS_ORDER: SubscriptionStatus[] = ['active', 'waitlisted', 'paused', 'cancelled'];

export default async function UsersPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (!await isAdminUser(user.id)) redirect('/wardrobe');

  // Fetch all profiles with their subscription (left join via nested select)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select(`
      id, display_name, phone, delivery_zone, size_preference, is_admin, created_at,
      subscriptions ( id, status, started_at, billing_anchor_day, notes )
    `)
    .order('created_at', { ascending: false });

  // Normalize: subscriptions returns as array (Supabase 1:many even for 1:1)
  const users: UserWithSub[] = (profilesData ?? []).map(p => ({
    id:               p.id,
    display_name:     p.display_name,
    phone:            p.phone,
    delivery_zone:    p.delivery_zone,
    size_preference:  p.size_preference,
    is_admin:         p.is_admin,
    created_at:       p.created_at,
    subscription:     Array.isArray(p.subscriptions) && p.subscriptions.length > 0
                        ? (p.subscriptions[0] as UserWithSub['subscription'])
                        : null,
  }));

  // ── Stats ──────────────────────────────────────────────────────────────────
  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = users.filter(u => u.subscription?.status === s).length;
    return acc;
  }, {});
  const noSub = users.filter(u => !u.subscription).length;

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <Link href="/admin" className="text-[12px] text-brand-dark/40 mb-0.5 block">← Admin</Link>
        <div className="flex items-baseline justify-between">
          <h1 className="text-[20px] font-bold text-brand-dark">Users</h1>
          <span className="text-[13px] text-brand-dark/40">{users.length} total</span>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 flex flex-col gap-5"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >

          {/* ── Status summary ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Active',     value: counts.active,     color: 'text-green-600'  },
              { label: 'Waitlisted', value: counts.waitlisted, color: 'text-yellow-600' },
              { label: 'Paused',     value: counts.paused,     color: 'text-brand-dark/50' },
              { label: 'No sub',     value: noSub,             color: 'text-brand-dark/30' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl bg-white border border-brand-dark/[0.06] p-3">
                <p className={`text-[22px] font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-brand-dark/40 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── User list ───────────────────────────────────────────────── */}
          {users.length === 0 ? (
            <div className="rounded-2xl bg-brand-surface px-5 py-8 text-center">
              <p className="text-[13px] text-brand-dark/40">No users yet.</p>
            </div>
          ) : (
            <UserList users={users} />
          )}

        </div>
      </div>
    </main>
  );
}
