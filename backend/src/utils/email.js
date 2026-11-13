import nodemailer from "nodemailer";
import { ENV } from "../config/env.js";

export const emailTransport = nodemailer.createTransport({
  host: ENV.EMAIL_HOST,
  port: Number(ENV.EMAIL_PORT),
  secure: Number(ENV.EMAIL_PORT) === 465,
  auth: {
    user: ENV.EMAIL_USER,
    pass: ENV.EMAIL_PASS,
  },
});

export const sendCredentialsEmail = async ({ name, email, password, role }) => {
  const loginUrl = `${ENV.FRONTEND_URL}/login`;

  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Welcome to the HR Portal</h2>
        </div>
        
        <div style="padding: 24px;">
          <p style="font-size: 14px;">Hello <strong>${name}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.5;">Your enterprise account has been created by the HR Administrator. You have been assigned the role of <strong>${role.toUpperCase()}</strong>.</p>
          
          <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px dashed #cbd5e1;">
            <p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Login Email:</strong> <span style="color: #4f46e5;">${email}</span></p>
            <p style="margin: 0; font-size: 13px;"><strong>Temporary Password:</strong> <code style="background: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-weight: bold;">${password}</code></p>
          </div>

          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${loginUrl}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Login to Your Account</a>
          </div>

          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 15px;">
            Or copy and paste this URL into your browser:<br/>
            <a href="${loginUrl}" style="color: #4f46e5;">${loginUrl}</a>
          </p>
        </div>

        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated message. Please do not reply directly to this email.
        </div>
      </div>
    </div>
  `;

  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Your Account Credentials - HR Attendance & Leave Portal",
    html,
  });
};

export const sendResetPasswordEmail = async ({
  name,
  email,
  resetToken,
  companySlug,
}) => {
  const resetUrl = `${ENV.FRONTEND_URL}/?resetToken=${resetToken}&companySlug=${encodeURIComponent(companySlug)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background-color: #dc2626; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Password Reset Request</h2>
        </div>
        <div style="padding: 24px;">
          <p>Hello <strong>${name}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to choose a new password. This link is valid for 15 minutes.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="font-size: 12px; color: #64748b;">If you did not request this, please ignore this email.</p>
        </div>
      </div>
    </div>
  `;

  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Password Reset Request - HR Attendance Portal",
    html,
  });
};

export const sendEmail = async ({ to, subject, html }) => {
  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

/** Admin reset password of any employee and email send to employee with random password */
export const sendEmailWithPassword = async ({
  name,
  email,
  randomPassword,
}) => {
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Password Reset Notification</h2>
        </div>
        <div style="padding: 24px;">
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your password has been reset by the HR Administrator.</p>
          <p> Your new password is: <strong>${randomPassword}</strong></p>
          <p>Please log in to your account and change your password immediately from your profile settings for security purposes.</p>
          <p>Thank you for using our services.</p>
        </div>
      </div>
    </div>
  `;
  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Password Reset Notification - HR Attendance Portal",
    html,
  });
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

export const sendTenantAdminWelcomeEmail = async ({
  name,
  email,
  password,
  companySlug,
}) => {
  const loginUrl = `${ENV.FRONTEND_URL.replace(/\/$/, "")}/?companySlug=${encodeURIComponent(companySlug)}`;
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safeSlug = escapeHtml(companySlug);
  const safeLoginUrl = escapeHtml(loginUrl);

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2>Welcome to the HR Portal</h2>
        <p>Hello <strong>${safeName}</strong>, your HR Administrator account is ready.</p>
        <p><strong>Company Code:</strong> ${safeSlug}</p>
        <p><strong>Login Email:</strong> ${safeEmail}</p>
        <p><strong>Temporary Password:</strong> <code>${safePassword}</code></p>
        <p><a href="${safeLoginUrl}">Log in to your company</a></p>
        <p>For security, change your password after signing in.</p>
      </div>
    </div>
  `;

  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Your HR Portal administrator account",
    html,
  });
};

export const sendEmailVerification = async ({
  name,
  email,
  companySlug,
  token,
}) => {
  const verificationUrl = `${ENV.FRONTEND_URL.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}&companySlug=${encodeURIComponent(companySlug)}`;
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2>Verify your oliveHRM email</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Your company workspace is ready. Verify this email address to secure your administrator account.</p>
        <p><a href="${safeUrl}">Verify email address</a></p>
        <p style="font-size: 12px; color: #64748b;">This link expires in 24 hours. If you did not sign up, ignore this message.</p>
      </div>
    </div>
  `;

  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Verify your oliveHRM email address",
    html,
  });
};

export const sendTenantRequestVerificationEmail = async ({
  contactName,
  email,
  token,
}) => {
  const verificationUrl = `${ENV.FRONTEND_URL.replace(/\/$/, "")}/signup-request/verify?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(contactName);
  const safeUrl = escapeHtml(verificationUrl);

  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Verify your oliveHRM tenant request",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2>Verify your email address</h2>
          <p>Hello <strong>${safeName}</strong>,</p>
          <p>Verify your email to submit your oliveHRM company request for review.</p>
          <p><a href="${safeUrl}">Verify email and submit request</a></p>
          <p style="font-size: 12px; color: #64748b;">This link expires in 24 hours. If you did not make this request, ignore this email.</p>
        </div>
      </div>
    `,
  });
};

export const sendTenantRequestReceivedEmail = async ({ contactName, email }) => {
  const safeName = escapeHtml(contactName);
  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "We received your oliveHRM request",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2>We received your request</h2>
          <p>Hello <strong>${safeName}</strong>,</p>
          <p>We received your request to create an oliveHRM workspace. Please verify your email using the separate verification message. We will contact you with next steps.</p>
        </div>
      </div>
    `,
  });
};

export const sendTenantRequestRejectedEmail = async ({
  contactName,
  email,
  rejectionReason,
}) => {
  const safeName = escapeHtml(contactName);
  const safeReason = escapeHtml(rejectionReason);
  return emailTransport.sendMail({
    from: ENV.EMAIL_FROM,
    to: email,
    subject: "Update on your oliveHRM workspace request",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2>Update on your workspace request</h2>
          <p>Hello <strong>${safeName}</strong>,</p>
          <p>We are unable to approve your oliveHRM workspace request at this time.</p>
          <p><strong>Reason:</strong> ${safeReason}</p>
        </div>
      </div>
    `,
  });
};
