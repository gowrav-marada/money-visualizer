import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

export const signInWithGoogle = async () => {
  if (!supabase) {
    return;
  }

  const redirectTo = `${window.location.origin}${window.location.pathname}`;

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });
};

export const signOut = async () => {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
};

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!supabase || !hasSupabaseConfig) {
      setAuthLoading(false);
      setAuthError("Supabase config is missing.");
      return;
    }

    const client = supabase;

    const syncSession = async () => {
      const { data, error } = await client.auth.getSession();
      if (!active) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      } else {
        setAuthError(null);
      }

      setSession(data.session);
      setAuthLoading(false);
    };

    syncSession().catch((error) => {
      if (!active) {
        return;
      }
      setAuthError(error instanceof Error ? error.message : "Failed to restore auth session.");
      setAuthLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthError(null);
      setAuthLoading(false);
    });

    const onVisibilityOrFocus = () => {
      syncSession().catch(() => undefined);
    };

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    isAuthenticated: !!session?.user,
    authLoading,
    authError,
    hasSupabaseConfig
  };
};
