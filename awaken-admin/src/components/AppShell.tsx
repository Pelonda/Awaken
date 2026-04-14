"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearAccessToken } from "@/lib/auth";
import { SiteProvider, useSite } from "@/components/SiteProvider";
import { socket } from "@/lib/socket";

type AppShellProps = {
  siteId: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

function AppShellInner({
  siteId,
  title,
  subtitle,
  children,
}: AppShellProps) {
  const router = useRouter();
  const { site, loading, error } = useSite();

  function logout() {
    clearAccessToken();
    socket.disconnect(); // 🔥 important: clean socket
    router.push("/login");
  }

  // 🔥 REAL-TIME CONNECTION
  useEffect(() => {
    socket.connect();

    socket.emit("join-site", siteId);

    return () => {
      socket.disconnect();
    };
  }, [siteId]);

  return (
    <div className="page">
      <div className="nav">
        <div className="nav-inner">
          <div className="row" style={{ gap: 20 }}>
            <strong>AWAKEN</strong>
            <Link href={`/sites/${siteId}`}>Overview</Link>
            <Link href={`/sites/${siteId}/devices`}>Devices</Link>
            <Link href={`/sites/${siteId}/sessions`}>Sessions</Link>
            <Link href={`/sites/${siteId}/announcements`}>Announcements</Link>
            <Link href={`/sites/${siteId}/team`}>Team</Link>
            <Link href={`/sites/${siteId}/bookings`}>Bookings</Link>
          </div>

          <div className="row" style={{ gap: 12 }}>
            <span className="small">
              {loading
                ? "Loading site..."
                : error
                ? "Error loading site"
                : site
                ? `${site.name} (${site.defaultMode})`
                : "Unknown site"}
            </span>

            <button className="button secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="container stack">
        <div>
          <h1 className="title">{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>

        {children}
      </div>
    </div>
  );
}

export default function AppShell(props: AppShellProps) {
  return (
    <SiteProvider siteId={props.siteId}>
      <AppShellInner {...props} />
    </SiteProvider>
  );
}