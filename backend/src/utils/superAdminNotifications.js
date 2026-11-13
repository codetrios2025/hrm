import { ENV } from "../config/env.js";
import Notification from "../models/Notification.js";
import { sendSuperAdminTenantRequestEmail } from "./email.js";

const requestPageUrl = (requestId) =>
  `${ENV.FRONTEND_URL.replace(/\/$/, "")}/super-admin/requests/${requestId}`;

const createNotification = async (data) => {
  try {
    await Notification.create(data);
  } catch (error) {
    console.error("[Super Admin notification] Persistence failed", error);
  }
};

const sendTelegramAlert = async (text) => {
  if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) return;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ENV.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error(
        `[Super Admin notification] Telegram delivery failed (HTTP ${response.status})`,
      );
    }
  } catch (error) {
    console.error("[Super Admin notification] Telegram delivery failed", error);
  }
};

export const notifyVerifiedTenantRequest = async (request) => {
  const link = requestPageUrl(request._id);
  await createNotification({
    type: "tenant_request",
    title: "New verified tenant request",
    message: `${request.companyName} (${request.slug}) requested an oliveHRM workspace.`,
    link,
  });

  if (!ENV.SUPER_ADMIN_NOTIFY_EMAIL) {
    console.error(
      "[Super Admin notification] SUPER_ADMIN_NOTIFY_EMAIL is not configured",
    );
  } else {
    try {
      await sendSuperAdminTenantRequestEmail({
        companyName: request.companyName,
        slug: request.slug,
        contactName: request.contactName,
        email: request.email,
        employeeCountEstimate: request.employeeCountEstimate,
        requestUrl: link,
      });
    } catch (error) {
      console.error("[Super Admin notification] Email delivery failed", error);
    }
  }

  await sendTelegramAlert(
    `New verified tenant request: ${request.companyName} (${request.slug})\n${link}`,
  );
};

export const notifyAutomaticTenantSignup = async (request, tenant) => {
  await createNotification({
    type: "tenant_signup",
    title: "Tenant created from signup",
    message: `${tenant.name} (${tenant.slug}) was created after email verification.`,
    link: requestPageUrl(request._id),
  });
};
