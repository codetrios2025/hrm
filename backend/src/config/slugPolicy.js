export const RESERVED_TENANT_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "login",
  "public",
  "signup",
  "static",
  "super",
  "super-admin",
  "uploads",
  "www",
]);

export const isValidTenantSlug = (slug) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
  !RESERVED_TENANT_SLUGS.has(slug);
