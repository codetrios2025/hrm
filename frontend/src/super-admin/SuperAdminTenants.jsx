import { useEffect, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import Pagination from "../components/Pagination";
import { superAdminApi } from "../api/client";
import { ErrorBanner } from "./SuperAdminDashboard";

const statusStyles = {
  trial: "bg-amber-50 text-amber-800 ring-amber-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  suspended: "bg-rose-50 text-rose-800 ring-rose-200",
  deleted: "bg-slate-100 text-slate-600 ring-slate-200",
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
};

export default function SuperAdminTenants({ navigate }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      if (plan) params.plan = plan;
      superAdminApi
        .get("/super/tenants", {
          params,
        })
        .then((response) => {
          if (active) setResult(response.data);
        })
        .catch((requestError) => {
          if (active) setError(requestError.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, plan, search, status]);

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#64723b]">Organizations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Tenants
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Search, filter, and manage company accounts.
          </p>
        </div>
        <button
          onClick={() => navigate("/super-admin/tenants/new")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#53612f]"
        >
          <Plus className="h-4 w-4" />
          Create tenant
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(240px,1fr)_180px_160px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={changeFilter(setSearch)}
            placeholder="Search company or slug"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
          />
        </label>
        <select
          value={status}
          onChange={changeFilter(setStatus)}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#64723b]"
        >
          <option value="">All statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
        <select
          value={plan}
          onChange={changeFilter(setPlan)}
          aria-label="Filter by plan"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#64723b]"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Company</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Plan</th>
                <th className="px-5 py-3.5 text-right font-semibold">Employees</th>
                <th className="px-5 py-3.5 font-semibold">Created</th>
                <th className="px-5 py-3.5 text-right font-semibold"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center text-slate-500">
                    Loading tenant accounts...
                  </td>
                </tr>
              ) : result?.tenants?.length ? (
                result.tenants.map((tenant) => (
                  <tr key={tenant._id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f4e9] text-[#64723b]">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">{tenant.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{tenant.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
                          statusStyles[tenant.status] || statusStyles.deleted
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium capitalize text-slate-700">
                      {tenant.plan}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-700">
                      {Number(tenant.employeeCount || 0).toLocaleString()}
                      <span className="text-slate-400">
                        {" "}
                        / {Number(tenant.effectiveEmployeeLimit).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(tenant.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() =>
                          navigate(`/super-admin/tenants/${encodeURIComponent(tenant._id)}`)
                        }
                        className="rounded-md px-2 py-1 font-semibold text-[#64723b] hover:bg-[#f1f4e9]"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center">
                    <p className="font-medium text-slate-700">No tenants found</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try a different search or filter.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && result?.pagination && (
          <Pagination
            pagination={result.pagination}
            onPageChange={setPage}
          />
        )}
      </div>
    </section>
  );
}
