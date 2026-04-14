"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { socket } from "@/lib/socket";

type Announcement = {
  id: string;
  siteId: string;
  title: string;
  message: string;
  level: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isActive: boolean;
};

type AnnouncementListResponse = {
  ok: true;
  announcements: Announcement[];
};

type Device = {
  id: string;
  name: string;
  hostname: string;
};

type DevicesResponse = {
  ok: true;
  devices: Device[];
};

export default function AnnouncementsPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState("INFO");
  const [targetType, setTargetType] = useState("SITE");
  const [targetId, setTargetId] = useState("");
  const [expiresMinutes, setExpiresMinutes] = useState("30");

  async function loadAnnouncements() {
    const data = await apiFetch<AnnouncementListResponse>(
      `/api/site-admin/sites/${siteId}/announcements`
    );
    setAnnouncements(data.announcements);
  }

  async function loadDevices() {
    const data = await apiFetch<DevicesResponse>(
      `/api/site-admin/sites/${siteId}/devices`
    );
    setDevices(data.devices);
  }

  async function loadAll() {
    setError("");
    await Promise.all([loadAnnouncements(), loadDevices()]);
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }

    loadAll()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load announcements");
      })
      .finally(() => setLoading(false));
  }, [router, siteId]);

  // 🔥 REAL-TIME
  useEffect(() => {
    socket.on("announcement:new", () => {
      loadAnnouncements();
    });

    socket.on("announcement:update", () => {
      loadAnnouncements();
    });

    return () => {
      socket.off("announcement:new");
      socket.off("announcement:update");
    };
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusyId("create");

    try {
      await apiFetch(`/api/site-admin/sites/${siteId}/announcements`, {
        method: "POST",
        body: JSON.stringify({
          title,
          message,
          level,
          targetType,
          targetId: targetType === "DEVICE" ? targetId : undefined,
          expiresMinutes: expiresMinutes
            ? Number(expiresMinutes)
            : undefined,
        }),
      });

      setTitle("");
      setMessage("");
      setLevel("INFO");
      setTargetType("SITE");
      setTargetId("");
      setExpiresMinutes("30");

      await loadAnnouncements();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create announcement"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deactivateAnnouncement(announcementId: string) {
    setError("");
    setBusyId(announcementId);

    try {
      await apiFetch(`/api/announcements/${announcementId}/deactivate`, {
        method: "POST",
      });

      await loadAnnouncements();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to deactivate announcement"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      siteId={siteId}
      title="Announcements"
      subtitle="Create and manage site announcements"
    >
      {error ? <div className="card error">{error}</div> : null}

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Create Announcement</h2>

        <form onSubmit={handleCreate} className="stack">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Message</label>
            <textarea
              className="input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              required
            />
          </div>

          <div className="grid grid-3">
            <div>
              <label className="label">Level</label>
              <select
                className="input"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            <div>
              <label className="label">Target Type</label>
              <select
                className="input"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
              >
                <option value="SITE">SITE</option>
                <option value="DEVICE">DEVICE</option>
              </select>
            </div>

            <div>
              <label className="label">Expires in Minutes</label>
              <input
                className="input"
                type="number"
                min="1"
                max="10080"
                value={expiresMinutes}
                onChange={(e) => setExpiresMinutes(e.target.value)}
              />
            </div>
          </div>

          {targetType === "DEVICE" ? (
            <div>
              <label className="label">Target Device</label>
              <select
                className="input"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                required
              >
                <option value="">Select a device</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.hostname})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button className="button" type="submit" disabled={busyId === "create"}>
            {busyId === "create" ? "Creating..." : "Create Announcement"}
          </button>
        </form>
      </div>

      <div className="row-between">
        <div className="small">Existing announcements</div>
        <button
          className="button secondary"
          onClick={() => {
            setLoading(true);
            loadAll().finally(() => setLoading(false));
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? <div className="card">Loading...</div> : null}

      {!loading && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Level</th>
                <th>Target</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="small">{a.message}</div>
                  </td>

                  <td>
                    <span className={`badge-status level-${a.level}`}>
                      {a.level}
                    </span>
                  </td>

                  <td>
                    {a.targetType}
                    {a.targetId ? ` (${a.targetId})` : ""}
                  </td>

                  <td>
                    <span
                      className={`badge-status ${
                        a.isActive ? "status-ONLINE" : "status-LOCKED"
                      }`}
                    >
                      {a.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>

                  <td>
                    {a.expiresAt
                      ? new Date(a.expiresAt).toLocaleString()
                      : "-"}
                  </td>

                  <td>
                    {a.isActive ? (
                      <button
                        className="button secondary"
                        disabled={busyId === a.id}
                        onClick={() => deactivateAnnouncement(a.id)}
                      >
                        {busyId === a.id ? "Working..." : "Deactivate"}
                      </button>
                    ) : (
                      <span className="small">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}

              {!announcements.length && (
                <tr>
                  <td colSpan={6} className="small">
                    No announcements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}