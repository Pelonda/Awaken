"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type TeamUser = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
};

type TeamMember = {
  id: string;
  siteId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  invitedEmail: string | null;
  invitationToken: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: TeamUser;
};

type TeamListResponse = {
  ok: true;
  members: TeamMember[];
};

export default function TeamPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "OPERATOR" | "VIEWER">("VIEWER");

  async function loadMembers() {
    setError("");
    const data = await apiFetch<TeamListResponse>(`/api/team/sites/${siteId}/members`);
    setMembers(data.members);
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }

    loadMembers()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load team");
      })
      .finally(() => setLoading(false));
  }, [router, siteId]);

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusyId("invite");

    try {
      await apiFetch(`/api/team/sites/${siteId}/members/invite/hq`, {
        method: "POST",
        body: JSON.stringify({
          email,
          fullName: fullName || undefined,
          role,
        }),
      });

      setEmail("");
      setFullName("");
      setRole("VIEWER");

      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setBusyId(null);
    }
  }

  async function updateRole(memberId: string, newRole: TeamMember["role"]) {
    setError("");
    setBusyId(memberId);

    try {
      await apiFetch(`/api/team/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });

      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(memberId: string) {
    const confirmed = window.confirm("Remove this team member from the site?");
    if (!confirmed) return;

    setError("");
    setBusyId(memberId);

    try {
      await apiFetch(`/api/team/members/${memberId}`, {
        method: "DELETE",
      });

      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell siteId={siteId} title="Team" subtitle="Manage site admins and staff">
      {error ? <div className="card error">{error}</div> : null}

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Invite Team Member</h2>

        <form onSubmit={handleInvite} className="stack">
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
              <label className="label">Full Name</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as TeamMember["role"])}
              >
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="OPERATOR">OPERATOR</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </div>
          </div>

          <div>
            <button className="button" type="submit" disabled={busyId === "invite"}>
              {busyId === "invite" ? "Inviting..." : "Invite Member"}
            </button>
          </div>
        </form>
      </div>

      <div className="row-between">
        <div className="small">Current site team members.</div>
        <button
          className="button secondary"
          onClick={() => {
            setLoading(true);
            loadMembers()
              .catch((err) => {
                setError(err instanceof Error ? err.message : "Failed to refresh team");
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
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Accepted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.user.fullName || "-"}</td>
                  <td>{member.user.email}</td>
                  <td>
                    <select
                      className="input"
                      value={member.role}
                      disabled={busyId === member.id}
                      onChange={(e) =>
                        updateRole(member.id, e.target.value as TeamMember["role"])
                      }
                      style={{ minWidth: 140 }}
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="OPERATOR">OPERATOR</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </td>
                  <td>{member.acceptedAt ? "Yes" : "Pending"}</td>
                  <td>{member.user.isActive ? "Active" : "Inactive"}</td>
                  <td>
                    <button
                      className="button secondary"
                      disabled={busyId === member.id}
                      onClick={() => removeMember(member.id)}
                    >
                      {busyId === member.id ? "Working..." : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}

              {!members.length ? (
                <tr>
                  <td colSpan={6} className="small">
                    No team members found.
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