"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { socket } from "@/lib/socket";

type Session = {
  id: string;
  siteId: string;
  deviceId: string | null;
  userId: string | null;
  pinId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type SessionsResponse = {
  ok: true;
  sessions: Session[];
};

function formatTime(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

export default function SessionsPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  async function loadSessions() {
    const data = await apiFetch<SessionsResponse>(
      `/api/site-admin/sites/${siteId}/sessions`
    );
    setSessions(data.sessions);
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }

    loadSessions()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      })
      .finally(() => setLoading(false));
  }, [router, siteId]);

  // 🔥 REAL-TIME UPDATES
  useEffect(() => {
    socket.on("session:update", () => {
      loadSessions();
    });

    return () => {
      socket.off("session:update");
    };
  }, []);

  async function endSession(sessionId: string) {
    setBusySessionId(sessionId);
    setError("");

    try {
      await apiFetch(
        `/api/site-admin/sites/${siteId}/sessions/${sessionId}/end`,
        {
          method: "POST",
        }
      );

      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    } finally {
      setBusySessionId(null);
    }
  }

  return (
    <AppShell
      siteId={siteId}
      title="Sessions"
      subtitle="View and manage site sessions"
    >
      <div className="row-between">
        <div className="small">
          Active and historical sessions for this site.
        </div>

        <button
          className="button secondary"
          onClick={() => {
            setLoading(true);
            loadSessions()
              .catch((err) => {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to refresh sessions"
                );
              })
              .finally(() => setLoading(false));
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? <div className="card">Loading...</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      {!loading && !error ? (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Session ID</th>
                <th>Device</th>
                <th>User</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sessions.map((session) => {
                const isBusy = busySessionId === session.id;

                return (
                  <tr key={session.id}>
                    <td>
                      <span className={`badge-status status-${session.status}`}>
                        {session.status}
                      </span>
                    </td>

                    <td className="small">{session.id}</td>

                    <td>{session.deviceId || "-"}</td>

                    <td>{session.userId || "-"}</td>

                    <td>{formatTime(session.startedAt)}</td>

                    <td>{formatTime(session.endedAt)}</td>

                    <td>
                      {session.status === "ACTIVE" ? (
                        <button
                          className="button secondary"
                          disabled={isBusy}
                          onClick={() => endSession(session.id)}
                        >
                          {isBusy ? "Ending..." : "End Session"}
                        </button>
                      ) : (
                        <span className="small">No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!sessions.length && (
                <tr>
                  <td colSpan={7} className="small">
                    No sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppShell>
  );
}