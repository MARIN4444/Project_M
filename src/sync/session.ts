import { getSupabase, isSyncConfigured } from './supabase';

/**
 * Signing in without asking anyone to sign up.
 *
 * Asking a table full of people to create an account before they can be given
 * points is the kind of friction that gets an app closed and never reopened.
 * So the first launch quietly creates an anonymous user, and that identity is
 * what group membership hangs off.
 *
 * It is a real account in every way that matters here: it holds a session, it
 * is what row level security checks, and it survives restarts because the
 * session is persisted. What it lacks is a way to prove it is yours from a
 * different phone -- which is the one thing an email address would add, and
 * can be attached later without disturbing anything already stored.
 */

let inFlight: Promise<string | undefined> | undefined;

/**
 * The current user id, creating an anonymous session on first use.
 * Resolves to undefined when the app was built without sync credentials, or
 * when there is no network to reach the server on this first launch.
 */
export async function ensureSession(): Promise<string | undefined> {
  if (!isSyncConfigured()) return undefined;

  // Several screens may ask at once on a cold start; they should share one
  // sign-in rather than race to create competing anonymous users.
  if (inFlight !== undefined) return inFlight;

  inFlight = (async () => {
    const supabase = getSupabase();
    if (supabase === undefined) return undefined;

    const { data: existing } = await supabase.auth.getSession();
    if (existing.session !== null) return existing.session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error !== null) {
      // Offline on a first launch is not a failure worth shouting about: the
      // app works locally regardless, and the next attempt will succeed.
      return undefined;
    }
    return data.user?.id;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}

export async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (supabase === undefined) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id;
}
