import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CircleCheck,
  Clock3,
  Save,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import Pagination from "../components/Pagination";
import { superAdminApi } from "../api/client";
import { ErrorBanner } from "./SuperAdminDashboard";
import usePlans from "../hooks/usePlans";

const statusClasses = {
  trial: "bg-amber-50 text-amber-800 ring-amber-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  suspended: "bg-rose-50 text-rose-800 ring-rose-200",
  deleted: "bg-slate-100 text-slate-600 ring-slate-200",
};

const formatDate = (value, includeTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(date);
};

export default function SuperAdminTenantDetails({ tenantId, navigate }) {
  const [tenant, setTenant] = useState(null);
  const [usage, setUsage] = useState(null);
  const [plan, setPlan] = useState("free");
  const [overrideDraft, setOverrideDraft] = useState("");
  const [auditResult, setAuditResult] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const { plans, loadingPlans, plansError } = usePlans(superAdminApi);

  useEffect(() => {
    let active = true;
    const detailRequest = superAdminApi.get(
      `/super/tenants/${encodeURIComponent(tenantId)}`,
    );
    const auditRequest = superAdminApi.get(
      `/super/tenants/${encodeURIComponent(tenantId)}/audit`,
      {
        params: { page, limit: 10 },
      },
    );
    Promise.allSettled([detailRequest, auditRequest]).then(
      ([detailResult, auditResult]) => {
        if (!active) return;
        if (detailResult.status === "fulfilled") {
          setTenant(detailResult.value.data.tenant);
          setUsage(detailResult.value.data.usage);
          setPlan(detailResult.value.data.tenant.plan);
          setOverrideDraft(
            detailResult.value.data.usage.employeeLimitOverride ?? "",
          );
        } else {
          setError(detailResult.reason.message);
        }
        if (auditResult.status === "fulfilled") {
          setAuditResult(auditResult.value.data);
          setAuditError("");
        } else {
          setAuditError(auditResult.reason.message);
        }
        if (active) setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [page, tenantId]);

  const updateStatus = async () => {
    const nextStatus = tenant.status === "suspended" ? "active" : "suspended";
    setSavingStatus(true);
    setError("");
    setActionMessage("");
    try {
      const response = await superAdminApi.patch(
        `/super/tenants/${encodeURIComponent(tenantId)}/status`,
        { status: nextStatus },
      );
      setTenant(response.data);
      setActionMessage(`Tenant ${nextStatus === "active" ? "activated" : "suspended"}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const updatePlan = async (event) => {
    event.preventDefault();
    setSavingPlan(true);
    setError("");
    setActionMessage("");
    try {
      const response = await superAdminApi.patch(
        `/super/tenants/${encodeURIComponent(tenantId)}`,
        {
          plan,
          employeeLimitOverride:
            overrideDraft === "" ? null : Number(overrideDraft),
        },
      );
      setTenant(response.data);
      setUsage((current) => ({
        ...current,
        planEmployeeLimit: response.data.planEmployeeLimit,
        employeeLimitOverride: response.data.employeeLimitOverride,
        effectiveEmployeeLimit: response.data.effectiveEmployeeLimit,
      }));
      setOverrideDraft(response.data.employeeLimitOverride ?? "");
      setActionMessage(
        plan !== tenant.plan
          ? "Tenant plan updated."
          : response.data.employeeLimitOverride == null
            ? "Custom employee limit removed."
            : "Tenant plan and employee limit saved.",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const removeEmployeeLimitOverride = async () => {
    setSavingPlan(true);
    setError("");
    setActionMessage("");
    try {
      const response = await superAdminApi.patch(
        `/super/tenants/${encodeURIComponent(tenantId)}`,
        { employeeLimitOverride: null },
      );
      setTenant(response.data);
      setUsage((current) => ({
        ...current,
        planEmployeeLimit: response.data.planEmployeeLimit,
        employeeLimitOverride: response.data.employeeLimitOverride,
        effectiveEmployeeLimit: response.data.effectiveEmployeeLimit,
      }));
      setOverrideDraft(response.data.employeeLimitOverride ?? "");
      setActionMessage(
        "Custom employee limit removed.",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const changePage = (nextPage) => {
    setLoading(true);
    setError("");
    setAuditError("");
    setPage(nextPage);
  };

  if (loading && !tenant) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-14 text-center text-sm text-slate-500">
        Loading tenant details...
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <button
        onClick={() => navigate("/super-admin/tenants")}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#64723b]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tenants
      </button>

      {error && <ErrorBanner message={error} />}
      {actionMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionMessage}
        </div>
      )}
      {!tenant && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Tenant unavailable</h1>
          <p className="mt-1 text-sm text-slate-500">
            {error || "This tenant could not be found."}
          </p>
        </div>
      )}

      {tenant && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f1f4e9] text-[#64723b]">
                  <Building2 className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                      {tenant.name}
                    </h1>
                    <StatusBadge status={tenant.status} />
                  </div>
                  <p className="mt-1 break-all text-sm text-slate-500">{tenant.slug}</p>
                </div>
              </div>
              {tenant.status !== "deleted" && (
                <button
                  onClick={updateStatus}
                  disabled={savingStatus}
                  className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    tenant.status === "suspended"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  }`}
                >
                  {tenant.status === "suspended" ? (
                    <CircleCheck className="h-4 w-4" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )}
                  {savingStatus
                    ? "Saving..."
                    : tenant.status === "suspended"
                      ? "Activate tenant"
                      : "Suspend tenant"}
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
              <InfoItem label="Company code" value={tenant.slug} />
              <InfoItem label="Plan" value={tenant.plan} capitalize />
              <InfoItem
                label="Plan limit"
                value={Number(
                  usage?.planEmployeeLimit || tenant.planEmployeeLimit || 0,
                ).toLocaleString()}
              />
              <InfoItem label="Created" value={formatDate(tenant.createdAt)} />
              <InfoItem label="Trial ends" value={formatDate(tenant.trialEndsAt)} />
              <InfoItem label="Deleted" value={formatDate(tenant.deletedAt)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <UsageCard
              icon={UsersRound}
              label="Employees"
              value={`${Number(usage?.employeeCount || 0).toLocaleString()} / ${Number(usage?.effectiveEmployeeLimit || tenant.effectiveEmployeeLimit || 0).toLocaleString()}`}
            />
            <UsageCard
              icon={Clock3}
              label="Last user login"
              value={formatDate(usage?.lastLoginAt, true)}
            />
            <UsageCard
              icon={CalendarDays}
              label="Tenant created"
              value={formatDate(usage?.createdAt)}
            />
          </div>

          {tenant.status !== "deleted" && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <form
                onSubmit={updatePlan}
                className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
              >
                <div className="max-w-md flex-1">
                  <label className="block text-sm font-semibold text-slate-800" htmlFor="tenant-plan">
                    Change plan
                  </label>
                  <p className="mb-2 mt-1 text-xs text-slate-500">
                    A plan change resets the custom employee limit unless you set a new override below.
                  </p>
                  <select
                    id="tenant-plan"
                    value={plan}
                    onChange={(event) => {
                      setPlan(event.target.value);
                      if (event.target.value !== tenant.plan) {
                        setOverrideDraft("");
                      }
                    }}
                    disabled={loadingPlans || Boolean(plansError)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#64723b] sm:max-w-xs"
                  >
                    {plans.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · plan limit {item.employeeLimit}
                      </option>
                    ))}
                  </select>
                  {plansError && <p className="mt-2 text-sm text-rose-700">{plansError}</p>}
                </div>
                <div className="grid gap-3 sm:max-w-sm sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                    Plan limit
                    <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                      {Number(usage?.planEmployeeLimit || 0).toLocaleString()}
                    </p>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                    Custom limit override
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={overrideDraft}
                      onChange={(event) => setOverrideDraft(event.target.value)}
                      placeholder="No override"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#64723b]"
                    />
                  </label>
                  {usage?.employeeLimitOverride != null && (
                    <p className="text-xs font-medium text-amber-700 sm:col-span-2">
                      Custom limit: {usage.employeeLimitOverride} (overrides plan)
                    </p>
                  )}
                  {usage?.employeeLimitOverride != null && (
                    <button
                      type="button"
                      onClick={removeEmployeeLimitOverride}
                      disabled={savingPlan}
                      className="w-fit rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:col-span-2"
                    >
                      Remove override
                    </button>
                  )}
                </div>
                <button
                  disabled={
                    savingPlan ||
                    loadingPlans ||
                    Boolean(plansError) ||
                    (plan === tenant.plan &&
                      String(overrideDraft) ===
                        String(usage?.employeeLimitOverride ?? ""))
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#53612f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {savingPlan ? "Saving..." : "Save plan"}
                </button>
              </form>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-slate-900">Audit history</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Recent platform actions associated with this tenant.
                </p>
              </div>
              {auditResult?.pagination?.total > 0 && (
                <span className="text-xs text-slate-500">
                  {auditResult.pagination.total} events
                </span>
              )}
            </div>
            {auditError && <div className="p-4"><ErrorBanner message={auditError} /></div>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Time</th>
                    <th className="px-5 py-3 font-semibold">Actor</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditResult?.auditHistory?.length ? (
                    auditResult.auditHistory.map((entry) => (
                      <tr key={entry._id}>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                          {formatDate(entry.time, true)}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-800">
                            {entry.who?.name || "Super Admin"}
                          </p>
                          {entry.who?.email && (
                            <p className="text-xs text-slate-500">{entry.who.email}</p>
                          )}
                        </td>
                        <td className="max-w-[440px] px-5 py-3.5 text-slate-700">
                          <span className="break-all">{entry.action}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="px-5 py-10 text-center text-sm text-slate-500">
                        {loading ? "Loading audit history..." : "No audit events for this tenant yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {auditResult?.pagination && (
              <Pagination
                pagination={auditResult.pagination}
                onPageChange={changePage}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
        statusClasses[status] || statusClasses.deleted
      }`}
    >
      {status}
    </span>
  );
}

function InfoItem({ label, value, capitalize = false }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-slate-800 ${capitalize ? "capitalize" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function UsageCard({ icon: Icon, label, value }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-[#f1f4e9] p-2.5 text-[#64723b]">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-4 break-words text-base font-semibold text-slate-900">{value}</p>
    </article>
  );
}
