"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getAccessToken } from "@/lib/auth";
import { useSite } from "@/components/SiteProvider";

function SiteOverviewContent() {
  const { site, stats, loading, error } = useSite();

  if (loading) {
    return <div className="card">Loading...</div>;
  }

  if (error) {
    return <div className="card error">{error}</div>;
  }

  if (!site || !stats) {
    return <div className="card error">Site data not available.</div>;
  }

  return (
    <>
      {/* 🔥 QUICK ACTIONS (FIXED POSITION) */}
      <div className="card stack">
        <h2 style={{ margin: 0 }}>Quick Actions</h2>

        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <a href={`/sites/${site.id}/devices`} className="button">
            Manage Devices
          </a>

          <a href={`/sites/${site.id}/sessions`} className="button secondary">
            View Sessions
          </a>

          <a href={`/sites/${site.id}/bookings`} className="button secondary">
            Manage Bookings
          </a>

          <a href={`/sites/${site.id}/announcements`} className="button secondary">
            Send Announcement
          </a>
        </div>
      </div>

      {/* SITE INFO */}
      <div className="card stack">
        <div className="row-between">
          <div>
            <h2 style={{ margin: 0 }}>{site.name}</h2>
            <p className="small" style={{ marginTop: 8 }}>
              Slug: {site.slug}
            </p>
          </div>

          <span className="badge">{site.defaultMode}</span>
        </div>

        <div className="small">Site Code: {site.siteCode}</div>
        <div className="small">Active: {String(site.isActive)}</div>
        <div className="small">
          Created: {new Date(site.createdAt).toLocaleString()}
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-3">
        <div className="card">
          <div className="small">Devices</div>
          <h2>{stats.deviceCount}</h2>
        </div>

        <div className="card">
          <div className="small">Active Sessions</div>
          <h2>{stats.activeSessions}</h2>
        </div>

        <div className="card">
          <div className="small">Bookings</div>
          <h2>{stats.bookingCount}</h2>
        </div>
      </div>

      <div className="card">
        <div className="small">Active Announcements</div>
        <h2>{stats.activeAnnouncements}</h2>
      </div>
    </>
  );
}

export default function SiteOverviewPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <AppShell
      siteId={siteId}
      title="Site Overview"
      subtitle="Manage your AWAKEN site"
    >
      <SiteOverviewContent />
    </AppShell>
  );
}