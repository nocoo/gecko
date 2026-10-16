"use client";

import { useEffect, useState } from "react";

export interface MeUser {
  id: string;
  email: string;
  name: string;
}

export function useMe(): { user: MeUser | null; loading: boolean } {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: MeUser } | null) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

export function accessLogout(): void {
  window.location.href = "/cdn-cgi/access/logout";
}
