import { ENV } from "./env.js";

const CORE_MODULES = Object.freeze([
  "employeeManagement",
  "attendance",
  "leaveManagement",
  "holidays",
  "outdoorDuty",
]);
const PRO_MODULES = Object.freeze([
  ...CORE_MODULES,
  "taskTimeTracker",
  "exports",
]);

export const PLANS = Object.freeze({
  free: Object.freeze({
    label: "Free",
    employeeLimit: 10,
    modules: CORE_MODULES,
    razorpayPlanId: ENV.RAZORPAY_PLAN_ID_FREE,
  }),
  basic: Object.freeze({
    label: "Basic",
    employeeLimit: 50,
    modules: CORE_MODULES,
    razorpayPlanId: ENV.RAZORPAY_PLAN_ID_BASIC,
  }),
  pro: Object.freeze({
    label: "Pro",
    employeeLimit: 200,
    modules: PRO_MODULES,
    razorpayPlanId: ENV.RAZORPAY_PLAN_ID_PRO,
  }),
});

export const getPlanOptions = () =>
  Object.entries(PLANS).map(([id, plan]) => ({
    id,
    label: plan.label,
    employeeLimit: plan.employeeLimit,
    modules: [...plan.modules],
  }));

export const planHasFeature = (planId, feature) =>
  PLANS[planId]?.modules.includes(feature) ?? false;

export const getPlanByRazorpayId = (razorpayPlanId) =>
  razorpayPlanId
    ? Object.entries(PLANS).find(
        ([, plan]) => plan.razorpayPlanId === razorpayPlanId,
      )?.[0]
    : undefined;
