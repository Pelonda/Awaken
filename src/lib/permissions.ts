export type SitePermission =
  | "site.read"
  | "site.manage"
  | "team.read"
  | "team.manage"
  | "devices.read"
  | "devices.manage"
  | "sessions.read"
  | "sessions.manage"
  | "announcements.read"
  | "announcements.manage"
  | "pins.read"
  | "pins.manage";

const rolePermissions: Record<string, SitePermission[]> = {
  OWNER: [
    "site.read",
    "site.manage",
    "team.read",
    "team.manage",
    "devices.read",
    "devices.manage",
    "sessions.read",
    "sessions.manage",
    "announcements.read",
    "announcements.manage",
    "pins.read",
    "pins.manage",
  ],

  ADMIN: [
    "site.read",
    "team.read",
    "team.manage", // ADDED HERE Member
    "devices.read",
    "devices.manage",
    "sessions.read",
    "sessions.manage",
    "announcements.read",
    "announcements.manage",
    "pins.read",
    "pins.manage",
  ],

  OPERATOR: [
    "site.read",
    "devices.read",
    "sessions.read",
    "sessions.manage",
    "announcements.read",
    "pins.read",
    "pins.manage",
  ],

  VIEWER: [
    "site.read",
    "devices.read",
    "sessions.read",
    "announcements.read",
    "pins.read",
  ],
};

export function hasPermission(role: string, permission: SitePermission) {
  return rolePermissions[role]?.includes(permission) ?? false;
}