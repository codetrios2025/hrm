import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
dotenv.config({ path: path.join(backendDirectory, ".env") });

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  SUPER_JWT_SECRET: process.env.SUPER_JWT_SECRET,
  SUPER_JWT_EXPIRES_IN: process.env.SUPER_JWT_EXPIRES_IN || "8h",
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,
  SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || "Platform Super Admin",
  SUPER_ADMIN_NOTIFY_EMAIL: process.env.SUPER_ADMIN_NOTIFY_EMAIL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  TENANT_SIGNUP_MODE: process.env.TENANT_SIGNUP_MODE || "approval",
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT || 587,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  HRM_PROMAN_BASE_URL: process.env.HRM_PROMAN_BASE_URL,
  HRM_PROMAN_SECRET: process.env.HRM_PROMAN_SECRET,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  RAZORPAY_PLAN_ID_FREE: process.env.RAZORPAY_PLAN_ID_FREE,
  RAZORPAY_PLAN_ID_BASIC: process.env.RAZORPAY_PLAN_ID_BASIC,
  RAZORPAY_PLAN_ID_PRO: process.env.RAZORPAY_PLAN_ID_PRO,
  RAZORPAY_SUBSCRIPTION_TOTAL_COUNT:
    Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT) || 120,
};
