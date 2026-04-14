"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { socket } from "@/lib/socket";

type Device = {
  id: string;
  name: string;
  hostname: string;
  enrollmentCode: string;
  mode: string;
  status: string;
  isRegistered: boolean;
  lastSeenAt: string | null;
  clientVersion: string | null;
  createdAt: string;
};

type DevicesResponse = {
  ok: true;
  devices: Device[];
};

export default function DevicesPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);

  async function loadDevices() {
    const data = await apiFetch<DevicesResponse>(
      `/api/site-admin/sites/${siteId}/devices`
    );
    setDevices(data.devices);
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }

    loadDevices()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load devices");
      })
      .finally(() => setLoading(false));
  }, [router, siteId]);

  // 🔥 REAL-TIME UPDATE
  useEffect(() => {
    socket.on("device:update", () => {
      loadDevices();
    });

    return () => {
      socket.off("device:update");
    };
  }, []);

  async function runDeviceAction(
    deviceId: string,
    action: "lock" | "maintenance-start" | "maintenance-stop"
  ) {
    setBusyDeviceId(deviceId);
    setError("");

    try {
      let path = "";

      if (action === "lock") {
        path = `/api/site-admin/sites/${siteId}/devices/${deviceId}/lock`;
      } else if (action === "maintenance-start") {
        path = `/api/site-admin/sites/${siteId}/devices/${deviceId}/maintenance/start`;
      } else {
        path = `/api/site-admin/sites/${siteId}/devices/${deviceId}/maintenance/stop`;
      }

      await apiFetch(path, { method: "POST" });

      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyDeviceId(null);
    }
  }

  return (
    <AppShell
      siteId={siteId}
      title="Devices"
      subtitle="View and manage site devices"
    >
      <div className="row-between">
        <div className="small">
          Manage device state and maintenance mode.{" "}
          <Link href={`/sites/${siteId}/sessions`}>View sessions</Link>
        </div>

        <button
          className="button secondary"
          onClick={() => {
            setLoading(true);
            loadDevices()
              .catch((err) => {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to refresh devices"
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
                <th>Name</th>
                <th>Hostname</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Version</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {devices.map((device) => {
                const isBusy = busyDeviceId === device.id;

                return (
                  <tr key={device.id}>
                    <td>{device.name}</td>
                    <td>{device.hostname}</td>

                    <td>
                      <span className={`badge-status status-${device.status}`}>
                        {device.status}
                      </span>
                    </td>

                    <td>{device.mode}</td>

                    <td>{device.clientVersion || "-"}</td>

                    <td className="small">
                      {device.lastSeenAt
                        ? new Date(device.lastSeenAt).toLocaleTimeString()
                        : "-"}
                    </td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          className="button secondary"
                          disabled={isBusy}
                          onClick={() =>
                            runDeviceAction(device.id, "lock")
                          }
                        >
                          {isBusy ? "Working..." : "Lock"}
                        </button>

                        {device.status !== "MAINTENANCE" ? (
                          <button
                            className="button secondary"
                            disabled={isBusy}
                            onClick={() =>
                              runDeviceAction(
                                device.id,
                                "maintenance-start"
                              )
                            }
                          >
                            {isBusy ? "Working..." : "Start Maintenance"}
                          </button>
                        ) : (
                          <button
                            className="button secondary"
                            disabled={isBusy}
                            onClick={() =>
                              runDeviceAction(
                                device.id,
                                "maintenance-stop"
                              )
                            }
                          >
                            {isBusy ? "Working..." : "Stop Maintenance"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!devices.length ? (
                <tr>
                  <td colSpan={7} className="small">
                    No devices found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppShell>
  );
}