/**
 * Admin — Experiences: /admin/experiences
 * Upload and manage outfit experience photos per user.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/server/admin';
import ExperienceUploadForm from './ExperienceUploadForm';
import { deleteExperience } from './actions';

export const dynamic = 'force-dynamic';

export default async function ExperiencesPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (!await isAdminUser(user.id)) redirect('/wardrobe');

  const [
    { data: subsData },
    { data: setsData },
    { data: experiencesData },
  ] = await Promise.all([
    // Users with subscriptions
    supabase
      .from('subscriptions')
      .select('user_id, profiles ( delivery_zone, district )')
      .in('status', ['active', 'waitlisted', 'paused']),

    // Active sets in active season
    supabase
      .from('outfit_sets')
      .select('id, code, season_id, seasons!inner(status)')
      .eq('seasons.status', 'active')
      .eq('status', 'active')
      .order('code'),

    // All experiences
    supabase
      .from('outfit_experiences')
      .select(`
        id, image_url, caption, created_at,
        outfit_sets ( code ),
        profiles ( delivery_zone, district )
      `)
      .order('created_at', { ascending: false }),
  ]);

  type SubRow = {
    user_id: string;
    profiles: { delivery_zone: string | null; district: string | null } | null;
  };
  type SetRow  = { id: string; code: string };
  type ExpRow  = {
    id: string; image_url: string; caption: string | null; created_at: string;
    outfit_sets: { code: string } | null;
    profiles: { delivery_zone: string | null; district: string | null } | null;
  };

  const subs        = (subsData        ?? []) as unknown as SubRow[];
  const sets        = (setsData        ?? []) as unknown as SetRow[];
  const experiences = (experiencesData ?? []) as unknown as ExpRow[];

  const users = subs.map(s => ({
    id:    s.user_id,
    label: s.profiles?.delivery_zone ?? s.profiles?.district ?? s.user_id.slice(0, 8),
  }));

  function userName(exp: ExpRow) {
    return exp.profiles?.delivery_zone ?? exp.profiles?.district ?? '—';
  }

  return (
    <main
      className="fixed inset-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-brand-bg flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 bg-brand-bg border-b border-brand-dark/[0.06]"
        style={{ paddingTop: 'calc(1rem + var(--sat, 0px))', paddingBottom: '1rem' }}
      >
        <Link href="/admin" className="text-[12px] text-brand-dark/40 mb-0.5 block">← Admin</Link>
        <h1 className="text-[20px] font-bold text-brand-dark">Experiences</h1>
        <p className="text-[11px] text-brand-dark/35">Upload outfit photos for users</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          className="px-4 py-5 flex flex-col gap-6"
          style={{ paddingBottom: 'calc(2rem + var(--sab, 0px))' }}
        >

          {/* Upload form */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
              New experience
            </p>
            <ExperienceUploadForm
              users={users}
              sets={sets.map(s => ({ id: s.id, code: s.code }))}
            />
          </section>

          {/* Existing experiences */}
          {experiences.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-dark/35 mb-3">
                All experiences · {experiences.length}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {experiences.map(exp => (
                  <div key={exp.id} className="rounded-2xl overflow-hidden bg-brand-surface relative">
                    <div className="aspect-square">
                      <img
                        src={exp.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-[12px] font-semibold text-brand-dark truncate">
                        {userName(exp)}
                      </p>
                      {exp.outfit_sets?.code && (
                        <p className="text-[11px] text-brand-dark/40">Set {exp.outfit_sets.code}</p>
                      )}
                      {exp.caption && (
                        <p className="text-[11px] text-brand-dark/40 truncate mt-0.5">{exp.caption}</p>
                      )}
                    </div>
                    {/* Delete */}
                    <form action={deleteExperience.bind(null, exp.id)}>
                      <button
                        type="submit"
                        className="
                          absolute top-2 right-2
                          w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm
                          flex items-center justify-center
                          active:bg-red-500 transition-colors
                        "
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                          stroke="white" strokeWidth="3" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </main>
  );
}
