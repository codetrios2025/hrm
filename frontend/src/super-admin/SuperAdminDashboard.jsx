import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CircleCheck,
  Clock3,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { superAdminApi } from "../api/client";

const cards = [
  { key: "totalTenants", label: "Total tenants", icon: Building2, color: "olive" },
  { key: "activeTenants", label: "Active", icon: CircleCheck, color: "green" },
  { key: "trialTenants", label: "Trial", icon: Clock3, color: "amber" },
  { key: "suspendedTenants", label: "Suspended", icon: ShieldAlert, color: "rose" },
  { key: "totalEmployees", label: "Total employees", icon: UsersRound, color: "blue" },
];

const cardColors = {
  olive: "bg-[#f1f4e9] text-[#64723b]",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  blue: "bg-blue-50 text-blue-700",
};

export default function SuperAdminDashboard({ navigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    superAdminApi
      .get("/super/stats")
      .then((response) => {
        if (active) setStats(response.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#64723b]">Platform overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            A live overview of tenants and employee accounts.
          </p>
        </div>
        <button
          onClick={() => navigate("/super-admin/tenants")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#53612f]"
        >
          Manage tenants <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ key, label, icon: Icon, color }) => (
          <article
            key={key}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                  {loading ? (
                    <span className="inline-block h-9 w-20 animate-pulse rounded bg-slate-100" />
                  ) : (
                    Number(stats?.[key] || 0).toLocaleString()
                  )}
                </p>
              </div>
              <span className={`rounded-xl p-3 ${cardColors[color]}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-[#e1e6d6] bg-[#f7f8f2] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Tenant administration</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Search companies, review usage, provision a new tenant, and manage
              account status from the tenant workspace.
            </p>
          </div>
          <button
            onClick={() => navigate("/super-admin/tenants")}
            className="shrink-0 rounded-lg border border-[#ccd5b7] bg-white px-4 py-2.5 text-sm font-semibold text-[#566434] transition hover:bg-[#f1f4e9]"
          >
            Open tenant list
          </button>
        </div>
      </div>
    </section>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      {message}
    </div>
  );
}
