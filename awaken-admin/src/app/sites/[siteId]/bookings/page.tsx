"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useSite } from "@/components/SiteProvider";

type Device = {
  id: string;
  name: string;
  hostname: string;
};

type DevicesResponse = {
  ok: true;
  devices: Device[];
};

type Booking = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  pinSentAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  device: {
    id: string;
    name: string;
    hostname: string;
  } | null;
  pins: {
    id: string;
    expiresAt: string | null;
    isActive: boolean;
    createdAt: string;
  }[];
};

type BookingsResponse = {
  ok: true;
  bookings: Booking[];
};

type CreateBookingResponse = {
  bookingId: string;
  pinId: string;
  email: string;
  expiresAt: string;
  emailSent: boolean;
  emailError: string | null;
  pin?: string;
  message: string;
};

function BookingsContent({ siteId }: { siteId: string }) {
  const { site } = useSite();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastCreatedPin, setLastCreatedPin] = useState<string>("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [validMinutes, setValidMinutes] = useState("120");
  const [sendEmail, setSendEmail] = useState(true);
  const [includePinInResponse, setIncludePinInResponse] = useState(false);

  async function loadBookings() {
    const data = await apiFetch<BookingsResponse>(
      `/api/site-admin/sites/${siteId}/bookings`
    );
    setBookings(data.bookings);
  }

  async function loadDevices() {
    const data = await apiFetch<DevicesResponse>(
      `/api/site-admin/sites/${siteId}/devices`
    );
    setDevices(data.devices);
  }

  async function loadAll() {
    setError("");
    await Promise.all([loadBookings(), loadDevices()]);
  }

  useEffect(() => {
    loadAll()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load bookings");
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusyId("create");
    setLastCreatedPin("");

    try {
      if (!site) {
        throw new Error("Site context not loaded");
      }

      const data = await apiFetch<CreateBookingResponse>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          siteCode: site.siteCode,
          email,
          name: name || undefined,
          deviceId: deviceId || undefined,
          source: "DIRECT",
          validMinutes: Number(validMinutes),
          sendEmail,
          includePinInResponse,
        }),
      });

      if (data.pin) {
        setLastCreatedPin(data.pin);
      }

      setEmail("");
      setName("");
      setDeviceId("");
      setValidMinutes("120");

      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setBusyId(null);
    }
  }

  async function regeneratePin(bookingId: string) {
    setError("");
    setBusyId(bookingId);
    setLastCreatedPin("");

    try {
      const data = await apiFetch<CreateBookingResponse>(
        `/api/bookings/${bookingId}/regenerate-pin`,
        {
          method: "POST",
          body: JSON.stringify({
            sendEmail: true,
            includePinInResponse,
          }),
        }
      );

      if (data.pin) {
        setLastCreatedPin(data.pin);
      }

      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate PIN");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? <div className="card error">{error}</div> : null}

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Create Booking</h2>
        <div className="small">Site Code: {site?.siteCode || "Loading..."}</div>

        <form onSubmit={handleCreate} className="stack">
          <div className="grid grid-3">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Device</label>
              <select
                className="input"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="">Any / none</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.hostname})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-3">
            <div>
              <label className="label">Valid Minutes</label>
              <input
                className="input"
                type="number"
                min="1"
                max="1440"
                value={validMinutes}
                onChange={(e) => setValidMinutes(e.target.value)}
              />
            </div>

            <div className="row" style={{ marginTop: 30 }}>
              <input
                id="sendEmail"
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              <label htmlFor="sendEmail">Send email</label>
            </div>

            <div className="row" style={{ marginTop: 30 }}>
              <input
                id="includePinInResponse"
                type="checkbox"
                checked={includePinInResponse}
                onChange={(e) => setIncludePinInResponse(e.target.checked)}
              />
              <label htmlFor="includePinInResponse">Show PIN for debugging</label>
            </div>
          </div>

          <div>
            <button className="button" type="submit" disabled={busyId === "create"}>
              {busyId === "create" ? "Creating..." : "Create Booking"}
            </button>
          </div>
        </form>

        {lastCreatedPin ? (
          <div className="card" style={{ background: "#eef2ff" }}>
            <strong>Debug PIN:</strong> {lastCreatedPin}
          </div>
        ) : null}
      </div>

      <div className="row-between">
        <div className="small">Recent bookings for this site.</div>
        <button
          className="button secondary"
          onClick={() => {
            setLoading(true);
            loadAll()
              .catch((err) => {
                setError(err instanceof Error ? err.message : "Failed to refresh bookings");
              })
              .finally(() => setLoading(false));
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? <div className="card">Loading...</div> : null}

      {!loading ? (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Device</th>
                <th>Status</th>
                <th>Valid To</th>
                <th>PIN Sent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.email}</td>
                  <td>{booking.name || "-"}</td>
                  <td>{booking.device ? booking.device.name : "-"}</td>
                  <td>{booking.status}</td>
                  <td>
                    {booking.validTo
                      ? new Date(booking.validTo).toLocaleString()
                      : "-"}
                  </td>
                  <td>{booking.pinSentAt ? "Yes" : "No"}</td>
                  <td>
                    <button
                      className="button secondary"
                      disabled={busyId === booking.id}
                      onClick={() => regeneratePin(booking.id)}
                    >
                      {busyId === booking.id ? "Working..." : "Regenerate PIN"}
                    </button>
                  </td>
                </tr>
              ))}

              {!bookings.length ? (
                <tr>
                  <td colSpan={7} className="small">
                    No bookings found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export default function BookingsPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <AppShell siteId={siteId} title="Bookings" subtitle="Create and manage site bookings">
      <BookingsContent siteId={siteId} />
    </AppShell>
  );
}