import crypto from "crypto";
import { ENV } from "../config/env.js";
import { getPlanByRazorpayId, PLANS } from "../config/plans.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { runWithTenant } from "../utils/tenantContext.js";
import Tenant from "../models/Tenant.js";
import Payment from "../models/Payment.js";
import ProcessedWebhookEvent from "../models/ProcessedWebhookEvent.js";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog.js";

const webhookEvents = new Set([
  "subscription.activated",
  "subscription.updated",
  "subscription.charged",
  "subscription.halted",
  "subscription.cancelled",
]);

const toDateFromUnix = (value) => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000)
    : null;
};

const verifyWebhookSignature = (rawBody, signature) => {
  if (!Buffer.isBuffer(rawBody) || !signature || !ENV.RAZORPAY_WEBHOOK_SECRET) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", ENV.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest();
  let actual;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const extractEntities = (payload) => ({
  subscription: payload?.subscription?.entity,
  payment: payload?.payment?.entity,
});

const updateTenantBilling = async ({
  tenantId,
  eventName,
  eventDate,
  subscription,
}) =>
  runWithTenant(tenantId, async () => {
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant || tenant.status === "deleted") {
      return { ignored: "tenant-not-found" };
    }
    const lastProcessedAt = tenant.billing?.lastProcessedAt;
    if (lastProcessedAt && lastProcessedAt > eventDate) {
      return { ignored: "stale-event" };
    }

    const periodEnd = toDateFromUnix(subscription.current_end);
    const planRelevant = [
      "subscription.activated",
      "subscription.updated",
      "subscription.charged",
    ].includes(eventName);
    const plan = planRelevant
      ? getPlanByRazorpayId(subscription.plan_id)
      : undefined;
    const updates = {
      "billing.lastProcessedAt": eventDate,
    };

    if (
      ["subscription.activated", "subscription.updated", "subscription.charged"].includes(
        eventName,
      ) &&
      !plan
    ) {
      return { ignored: "unmapped-plan" };
    }

    if (eventName === "subscription.activated") {
      updates.plan = plan;
      updates.status = "active";
      updates["billing.status"] = "active";
      updates["billing.graceUntil"] = null;
      updates["billing.suspensionReason"] = null;
      if (periodEnd) updates["billing.currentPeriodEnd"] = periodEnd;
    } else if (eventName === "subscription.updated") {
      updates.plan = plan;
      if (periodEnd) updates["billing.currentPeriodEnd"] = periodEnd;
    } else if (eventName === "subscription.charged") {
      updates.plan = plan;
      updates["billing.status"] = "active";
      updates["billing.graceUntil"] = null;
      updates["billing.suspensionReason"] = null;
      if (periodEnd) updates["billing.currentPeriodEnd"] = periodEnd;
      if (
        tenant.status === "suspended" &&
        tenant.billing?.suspensionReason === "non-payment"
      ) {
        updates.status = "active";
      }
    } else if (eventName === "subscription.halted") {
      updates["billing.status"] = "halted";
      updates["billing.graceUntil"] = new Date(
        eventDate.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
    } else if (eventName === "subscription.cancelled") {
      updates["billing.status"] = "cancelled";
      if (periodEnd) updates["billing.currentPeriodEnd"] = periodEnd;
    }

    const changedPlan = planRelevant && plan !== tenant.plan;
    if (changedPlan) updates.employeeLimitOverride = null;

    const updatedTenant = await Tenant.findOneAndUpdate(
      {
        _id: tenantId,
        status: { $ne: "deleted" },
        $or: [
          { "billing.lastProcessedAt": { $exists: false } },
          { "billing.lastProcessedAt": null },
          { "billing.lastProcessedAt": { $lte: eventDate } },
        ],
      },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!updatedTenant) return { ignored: "stale-event" };

    return {
      tenant: updatedTenant,
      oldPlan: tenant.plan,
      newPlan: plan || tenant.plan,
      oldOverride: tenant.employeeLimitOverride ?? null,
      newOverride: changedPlan ? null : tenant.employeeLimitOverride ?? null,
    };
  });

const savePayment = async (tenantId, subscriptionId, payment) => {
  if (!payment?.id) {
    throw new ApiError(400, "Charged subscription event has no payment ID");
  }
  const amount = Number(payment.amount ?? payment.amount_paid);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Charged subscription event has an invalid amount");
  }
  if (!payment.currency || !payment.status) {
    throw new ApiError(400, "Charged subscription event has incomplete payment data");
  }
  await runWithTenant(tenantId, () =>
    Payment.updateOne(
      { tenantId, razorpayPaymentId: payment.id },
      {
        $setOnInsert: {
          tenantId,
          razorpayPaymentId: payment.id,
          razorpaySubscriptionId: subscriptionId,
          invoiceId: payment.invoice_id || null,
          amount,
          currency: payment.currency,
          status: payment.status,
          paidAt: toDateFromUnix(payment.created_at),
          periodStart: toDateFromUnix(payment.period_start),
          periodEnd: toDateFromUnix(payment.period_end),
        },
      },
      { upsert: true },
    ),
  );
};

export const subscribe = asyncHandler(async (req, res) => {
  const plan = req.body.plan;
  const planConfig = PLANS[plan];
  if (!planConfig) throw new ApiError(400, "Select a valid subscription plan");
  if (
    !ENV.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ||
    !ENV.RAZORPAY_KEY_SECRET ||
    !planConfig.razorpayPlanId
  ) {
    throw new ApiError(503, "Razorpay test-mode billing is not configured");
  }

  const tenant = await Tenant.findById(req.tenantId).select("name slug").lean();
  if (!tenant) throw new ApiError(404, "Tenant not found");
  const razorpayResponse = await fetch(
    "https://api.razorpay.com/v1/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${ENV.RAZORPAY_KEY_ID}:${ENV.RAZORPAY_KEY_SECRET}`,
        ).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: planConfig.razorpayPlanId,
        total_count: ENV.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT,
        quantity: 1,
        customer_notify: 1,
        notes: { tenantId: String(req.tenantId), plan },
      }),
    },
  );
  if (!razorpayResponse.ok) {
    console.error(
      `[Billing] Razorpay subscription creation failed with status ${razorpayResponse.status}`,
    );
    throw new ApiError(502, "Could not create a Razorpay subscription");
  }

  const subscription = await razorpayResponse.json();
  if (!subscription.id) {
    throw new ApiError(502, "Razorpay returned an invalid subscription response");
  }
  await runWithTenant(req.tenantId, () =>
    Tenant.updateOne(
      { _id: req.tenantId },
      {
        $set: {
          "billing.razorpaySubscriptionId": subscription.id,
          "billing.status": "pending",
        },
      },
    ),
  );

  return ApiResponse.send(
    res,
    201,
    {
      id: subscription.id,
      shortUrl: subscription.short_url || null,
      plan,
      planLabel: planConfig.label,
    },
    "Subscription created",
  );
});

export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const rawBody = req.body;
  const signature = req.headers["x-razorpay-signature"];
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError(400, "Invalid Razorpay webhook signature");
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid Razorpay webhook payload");
  }
  const eventId = req.headers["x-razorpay-event-id"];
  const eventDate = toDateFromUnix(body.created_at);
  if (typeof eventId !== "string" || !eventId || !eventDate || !body.event) {
    throw new ApiError(400, "Razorpay webhook event metadata is incomplete");
  }

  try {
    await ProcessedWebhookEvent.create({
      eventId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    throw error;
  }

  try {
    if (!webhookEvents.has(body.event)) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const { subscription, payment } = extractEntities(body.payload);
    if (!subscription?.id) {
      return res.status(200).json({ received: true, ignored: true });
    }
    const tenant = await Tenant.findOne({
      "billing.razorpaySubscriptionId": subscription.id,
    }).lean();
    if (!tenant) {
      return res.status(200).json({ received: true, ignored: true });
    }
    const notesTenantId = subscription.notes?.tenantId;
    if (notesTenantId && String(notesTenantId) !== String(tenant._id)) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const result = await updateTenantBilling({
      tenantId: tenant._id,
      eventName: body.event,
      eventDate,
      subscription,
    });
    if (result.ignored) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason: result.ignored,
      });
    }

    if (body.event === "subscription.charged") {
      await savePayment(tenant._id, subscription.id, payment);
    }
    await SuperAdminAuditLog.create({
      who: null,
      source: "razorpay-webhook",
      action: body.event,
      tenantId: tenant._id,
      time: eventDate,
      details: {
        oldPlan: result.oldPlan,
        newPlan: result.newPlan,
        oldEmployeeLimitOverride: result.oldOverride,
        newEmployeeLimitOverride: result.newOverride,
        subscriptionId: subscription.id,
      },
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    await ProcessedWebhookEvent.deleteOne({ eventId });
    throw error;
  }
});
