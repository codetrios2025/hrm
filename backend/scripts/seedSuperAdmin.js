import mongoose from "mongoose";
import path from "path";
import { pathToFileURL } from "url";
import { connectDB } from "../src/config/db.js";
import SuperAdmin from "../src/models/SuperAdmin.js";
import { ENV } from "../src/config/env.js";

export const seedSuperAdmin = async ({
  email = ENV.SUPER_ADMIN_EMAIL,
  password = ENV.SUPER_ADMIN_PASSWORD,
  name = ENV.SUPER_ADMIN_NAME,
} = {}) => {
  if (!email?.trim() || !password) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required");
  }
  if (password.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const superAdmin = await SuperAdmin.findOne({ email: normalizedEmail }).select(
    "+password",
  );
  if (!superAdmin) {
    const createdAdmin = await SuperAdmin.create({
      name,
      email: normalizedEmail,
      password,
    });
    console.log(`[Super Admin Seed] Created account: ${normalizedEmail}`);
    return createdAdmin;
  }

  const passwordChanged = !(await superAdmin.isPasswordCorrect(password));
  const nameChanged = superAdmin.name !== name;
  if (passwordChanged) superAdmin.password = password;
  if (nameChanged) superAdmin.name = name;

  if (passwordChanged || nameChanged) {
    await superAdmin.save();
  }
  const action = passwordChanged
    ? "Updated password"
    : nameChanged
      ? "Updated account name"
      : "No changes";
  console.log(`[Super Admin Seed] ${action}: ${normalizedEmail}`);

  return superAdmin;
};

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await connectDB();
  try {
    await seedSuperAdmin();
  } finally {
    await mongoose.disconnect();
  }
}
