import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser || "no-reply@awaken.local";

export const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: smtpUser && smtpPass
    ? {
        user: smtpUser,
        pass: smtpPass,
      }
    : undefined,
});

export async function sendPinEmail(params: {
  to: string;
  siteName: string;
  pin: string;
  expiresAt: Date;
  deviceName?: string | null;
}) {
  const { to, siteName, pin, expiresAt, deviceName } = params;

  const subject = `Your AWAKEN access PIN for ${siteName}`;
  const deviceLine = deviceName ? `Device: ${deviceName}` : "Device: Assigned at site";
  const expiryLine = expiresAt.toISOString();

  const text = [
    "Hello,",
    "",
    `Your access PIN for ${siteName} is: ${pin}`,
    deviceLine,
    `Valid until: ${expiryLine}`,
    "",
    "Please do not share this PIN.",
    "",
    "- AWAKEN",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>AWAKEN Access PIN</h2>
      <p>Your access PIN for <strong>${siteName}</strong> is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${pin}</p>
      <p><strong>${deviceLine}</strong></p>
      <p><strong>Valid until:</strong> ${expiryLine}</p>
      <p>Please do not share this PIN.</p>
      <p>- AWAKEN</p>
    </div>
  `;

  return transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  });
}