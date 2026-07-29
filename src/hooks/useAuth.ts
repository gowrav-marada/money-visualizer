import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

export const signInWithGoogle = async () => {
  if (!supabase) {
    return;
  }

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin
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

  useEffect(() => {
    let active = true;

    if (!supabase || !hasSupabaseConfig) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    isAuthenticated: !!session?.user,
    authLoading,
    hasSupabaseConfig
  };
};
