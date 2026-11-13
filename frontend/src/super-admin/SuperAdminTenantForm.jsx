import { useState } from "react";
import { ArrowLeft, Building2, UserPlus } from "lucide-react";
import { superAdminApi } from "../api/client";
import { ErrorBanner } from "./SuperAdminDashboard";
import usePlans from "../hooks/usePlans";

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function SuperAdminTenantForm({ navigate }) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adminName: "",
    adminEmail: "",
    status: "active",
    plan: "free",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { plans, loadingPlans, plansError } = usePlans(superAdminApi);

  const update = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugEdited ? { slug: slugify(value) } : {}),
    }));
    if (field === "slug") setSlugEdited(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await superAdminApi.post("/super/tenants", {
        ...form,
      });
      navigate(`/super-admin/tenants/${encodeURIComponent(response.data.tenant.id)}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5">
      <button
        onClick={() => navigate("/super-admin/tenants")}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#64723b]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tenants
      </button>
      <div>
        <p className="text-sm font-semibold text-[#64723b]">Provisioning</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Create tenant
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a company workspace and its first HR Administrator account.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
              <Building2 className="h-4 w-4 text-[#64723b]" />
              Company details
            </div>
            <Field label="Company name">
              <input
                required
                minLength={2}
                maxLength={100}
                value={form.name}
                onChange={update("name")}
                placeholder="Acme Company"
                className={inputClass}
              />
            </Field>
            <Field
              label="Company slug"
              help="Used as the company code at sign-in. Use lowercase letters, numbers, and hyphens."
            >
              <input
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={form.slug}
                onChange={update("slug")}
                placeholder="acme-company"
                className={inputClass}
              />
            </Field>
            <Field label="Plan">
              <select
                value={form.plan}
                onChange={update("plan")}
                className={inputClass}
                disabled={loadingPlans || Boolean(plansError)}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label} · up to {plan.employeeLimit} employees
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account status">
              <select
                value={form.status}
                onChange={update("status")}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
              </select>
            </Field>
            {plansError && <ErrorBanner message={plansError} />}
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
              <UserPlus className="h-4 w-4 text-[#64723b]" />
              First HR Administrator
            </div>
            <Field label="Administrator name">
              <input
                required
                minLength={2}
                maxLength={60}
                value={form.adminName}
                onChange={update("adminName")}
                placeholder="Taylor Morgan"
                className={inputClass}
              />
            </Field>
            <Field label="Administrator email">
              <input
                required
                type="email"
                value={form.adminEmail}
                onChange={update("adminEmail")}
                placeholder="taylor@acme.com"
                className={inputClass}
              />
            </Field>
            <div className="rounded-lg border border-[#e1e6d6] bg-[#f7f8f2] p-4 text-sm leading-6 text-slate-600">
              {form.status === "trial"
                ? "The tenant starts with a 14-day trial. A temporary password and company sign-in code will be sent to the administrator’s email."
                : "The tenant starts active on the selected plan. A temporary password and company sign-in code will be sent to the administrator’s email."}
            </div>
          </div>
        </div>
        {error && <div className="px-5 sm:px-7"><ErrorBanner message={error} /></div>}
        <div className="mt-5 flex flex-col-reverse justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:px-7">
          <button
            type="button"
            onClick={() => navigate("/super-admin/tenants")}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            disabled={submitting}
            className="rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#53612f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating tenant..." : "Create tenant"}
          </button>
        </div>
      </form>
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10";

function Field({ label, help, children }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
      {help && <span className="block text-xs font-normal leading-5 text-slate-500">{help}</span>}
    </label>
  );
}
