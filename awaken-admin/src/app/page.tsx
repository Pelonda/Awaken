"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      router.replace("/login");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return null;
}

<div className="card stack">
  <h2 style={{ margin: 0 }}>Quick Actions</h2>

  <div className="row">
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