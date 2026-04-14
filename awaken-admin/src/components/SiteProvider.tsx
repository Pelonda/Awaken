"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { apiFetch } from "@/lib/api";

type SiteOverview = {
  id: string;
  name: string;
  slug: string;
  siteCode: string;
  defaultMode: string;
  isActive: boolean;
  createdAt: string;
};

type SiteStats = {
  deviceCount: number;
  activeSessions: number;
  bookingCount: number;
  activeAnnouncements: number;
};

type SiteOverviewResponse = {
  ok: true;
  site: SiteOverview;
  stats: SiteStats;
};

type SiteContextValue = {
  site: SiteOverview | null;
  stats: SiteStats | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({
  siteId,
  children,
}: {
  siteId: string;
  children: React.ReactNode;
}) {
  const [site, setSite] = useState<SiteOverview | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiFetch<SiteOverviewResponse>(
        `/api/site-admin/sites/${siteId}/overview`
      );

      setSite(data.site);
      setStats(data.stats);
    } catch (err) {
      setSite(null);
      setStats(null);
      setError(err instanceof Error ? err.message : "Failed to load site");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    setSite(null);
    setStats(null);
    setError("");
    setLoading(true);

    refresh().catch(() => {
      // error already handled inside refresh
    });
  }, [refresh]);

  return (
    <SiteContext.Provider
      value={{
        site,
        stats,
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const ctx = useContext(SiteContext);

  if (!ctx) {
    throw new Error("useSite must be used inside SiteProvider");
  }

  return ctx;
}