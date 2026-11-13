import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  Users,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";

const cardStyle =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
const formatDate = (value) => {
  const dateValue = typeof value === "string" ? value.slice(0, 10) : value;
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

function MetricCard({ label, value, icon: Icon, tone = "olive" }) {
  const tones = {
    olive: "bg-[#f1f3e8] text-[#65733b]",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <div className={cardStyle}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value ?? 0}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function AttendanceChart({ data = [] }) {
  const maxCount = Math.max(
    1,
    ...data.flatMap((day) => [day.present || 0, day.absent || 0]),
  );
  const chartHeight = 126;
  const columnWidth = 72;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${Math.max(7 * columnWidth, data.length * columnWidth)} 190`}
        className="h-52 min-w-[500px] w-full"
        role="img"
        aria-label="Attendance for the last seven days"
      >
        {[0, 1, 2].map((line) => {
          const y = 16 + (chartHeight / 2) * line;
          return (
            <line
              key={line}
              x1="20"
              x2={Math.max(7 * columnWidth, data.length * columnWidth) - 12}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray={line === 2 ? undefined : "4 5"}
            />
          );
        })}
        {data.map((day, index) => {
          const x = 25 + index * columnWidth;
          const presentHeight = ((day.present || 0) / maxCount) * chartHeight;
          const absentHeight = ((day.absent || 0) / maxCount) * chartHeight;
          return (
            <g key={day.date}>
              <rect
                x={x}
                y={142 - presentHeight}
                width="20"
                height={presentHeight}
                rx="5"
                fill="#748443"
              />
              <rect
                x={x + 25}
                y={142 - absentHeight}
                width="20"
                height={absentHeight}
                rx="5"
                fill="#e9a23b"
              />
              <text
                x={x + 22}
                y="166"
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {formatDate(day.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="-mt-2 flex justify-center gap-5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-[#748443]" /> Present
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-[#e9a23b]" /> Absent
        </span>
      </div>
    </div>
  );
}

function RequestList({ title, requests, kind, busyId, onReview }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <span className="rounded-full bg-[#f1f3e8] px-2.5 py-1 text-xs font-bold text-[#65733b]">
          {requests.count || 0}
        </span>
      </div>
      {requests.items?.length ? (
        <ul className="space-y-2">
          {requests.items.map((request) => (
            <li
              key={request._id}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {request.employeeName || "Employee"}
                    {request.employeeId ? ` · ${request.employeeId}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {kind === "leave"
                      ? `${request.leaveType || "Leave"} · ${formatDate(request.startDate)}${
                          request.endDate &&
                          formatDate(request.endDate) !==
                            formatDate(request.startDate)
                            ? ` – ${formatDate(request.endDate)}`
                            : ""
                        }`
                      : `${formatDate(request.date)} · ${request.location || request.reason || "Outdoor duty"}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === request._id}
                    onClick={() => onReview(kind, request._id, "approved")}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#65733b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#53612e] disabled:opacity-50"
                  >
                    {busyId === request._id ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === request._id}
                    onClick={() => onReview(kind, request._id, "rejected")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          No pending requests
        </p>
      )}
    </section>
  );
}

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const { showError, showSuccess } = useToast();
  const toastRef = useRef({ showError, showSuccess });
  useEffect(() => {
    toastRef.current = { showError, showSuccess };
  }, [showError, showSuccess]);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await api.get("/admin/dashboard");
      setDashboard(response.data);
    } catch (error) {
      toastRef.current.showError(
        error.message || "Unable to load the dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchDashboard = async () => {
      try {
        const response = await api.get("/admin/dashboard");
        if (!cancelled) setDashboard(response.data);
      } catch (error) {
        if (!cancelled) {
          toastRef.current.showError(
            error.message || "Unable to load the dashboard",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const reviewRequest = async (kind, id, status) => {
    setBusyId(id);
    try {
      if (kind === "leave") {
        await api.patch(`/leaves/${id}/review`, {
          status,
          ...(status === "rejected"
            ? { rejectionReason: "Rejected from the admin dashboard" }
            : {}),
        });
      } else {
        await api.patch(
          `/outdoor-duty/${id}/${status === "approved" ? "approve" : "reject"}`,
        );
      }
      showSuccess(`Request ${status}`);
      await loadDashboard();
    } catch (error) {
      showError(error.message || `Unable to ${status} request`);
    } finally {
      setBusyId(null);
    }
  };

  const upgrade = async () => {
    const targetPlan = dashboard?.planInfo?.plan === "free" ? "basic" : "pro";
    setUpgrading(true);
    try {
      const response = await api.post("/billing/subscribe", {
        plan: targetPlan,
      });
      const checkoutUrl = response.data?.shortUrl;
      if (!checkoutUrl) {
        throw new Error("The billing service did not return a checkout link");
      }
      window.location.assign(checkoutUrl);
    } catch (error) {
      showError(error.message || "Unable to start the upgrade");
      setUpgrading(false);
    }
  };

  const departmentTotal = useMemo(
    () =>
      Math.max(
        1,
        ...(dashboard?.departmentWiseEmployeeCount || []).map(
          (department) => department.count,
        ),
      ),
    [dashboard?.departmentWiseEmployeeCount],
  );

  if (loading) {
    return (
      <div className={`${cardStyle} flex items-center justify-center gap-2 py-16 text-sm text-slate-500`}>
        <LoaderCircle className="h-5 w-5 animate-spin" />
        Loading dashboard…
      </div>
    );
  }
  if (!dashboard) {
    return (
      <div className={`${cardStyle} py-12 text-center text-sm text-slate-500`}>
        Dashboard data is unavailable. Please try again.
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadDashboard();
          }}
          className="ml-2 font-semibold text-[#65733b] underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const { today, planInfo } = dashboard;
  const employeeUsage = Math.min(
    100,
    Math.round((planInfo.employeesUsed / Math.max(1, planInfo.employeeLimit)) * 100),
  );
  const nextPlan = planInfo.plan === "free" ? "Basic" : "Pro";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#748443]">
            Organization overview
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your workforce and today’s activity at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadDashboard();
          }}
          className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:self-auto"
        >
          Refresh
        </button>
      </div>

      {planInfo.trialDaysLeft !== null && planInfo.trialDaysLeft <= 5 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Your free trial{" "}
            {planInfo.trialDaysLeft === 0
              ? "ends today."
              : `ends in ${planInfo.trialDaysLeft} day${planInfo.trialDaysLeft === 1 ? "" : "s"}.`}
            {" "}Upgrade to keep access to your current plan.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Total employees" value={dashboard.totalEmployees} icon={Users} />
        <MetricCard label="Active employees" value={dashboard.activeEmployees} icon={UserRoundCheck} />
        <MetricCard label="Inactive employees" value={dashboard.inactiveEmployees} icon={UserRoundX} tone="amber" />
        <MetricCard label="Present today" value={today.present} icon={Check} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Absent" value={today.absent} icon={UserRoundX} tone="rose" />
        <MetricCard label="On leave" value={today.onLeave} icon={CalendarDays} tone="blue" />
        <MetricCard label="Outdoor duty" value={today.onOutdoorDuty} icon={ArrowUpRight} />
        <MetricCard label="Not punched in" value={today.notPunchedInYet} icon={Clock3} tone="amber" />
        <MetricCard label="Approved leaves this month" value={dashboard.leavesApprovedThisMonth} icon={CalendarDays} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className={cardStyle}>
          <div className="mb-3">
            <h2 className="font-bold text-slate-900">Attendance trend</h2>
            <p className="mt-1 text-xs text-slate-500">Daily attendance over the last seven days</p>
          </div>
          <AttendanceChart data={dashboard.attendanceTrend} />
        </section>

        <section className={cardStyle}>
          <div className="mb-4">
            <h2 className="font-bold text-slate-900">Plan usage</h2>
            <p className="mt-1 text-xs text-slate-500">
              {planInfo.planName} plan · {planInfo.subscriptionStatus}
              {planInfo.trialDaysLeft !== null
                ? ` · ${planInfo.trialDaysLeft} trial days left`
                : ""}
            </p>
          </div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-lg font-bold text-slate-900">
              {planInfo.employeesUsed}{" "}
              <span className="text-sm font-medium text-slate-500">
                / {planInfo.employeeLimit} employees
              </span>
            </p>
            <span className="text-sm font-bold text-[#65733b]">{employeeUsage}%</span>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Employee plan usage"
            aria-valuenow={employeeUsage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#748443] transition-all"
              style={{ width: `${employeeUsage}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {dashboard.employeesOnProbation} on probation ·{" "}
              {dashboard.newJoinersThisMonth} new this month
            </p>
            {planInfo.plan !== "pro" && (
              <button
                type="button"
                disabled={upgrading}
                onClick={upgrade}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#65733b] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#53612e] disabled:opacity-60"
              >
                {upgrading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                )}
                Upgrade to {nextPlan}
              </button>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={cardStyle}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Pending approvals</h2>
              <p className="mt-1 text-xs text-slate-500">Review requests without leaving the dashboard.</p>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              {(dashboard.pendingApprovals.leaveRequests.count || 0) +
                (dashboard.pendingApprovals.outdoorDutyRequests.count || 0)}{" "}
              pending
            </span>
          </div>
          <div className="space-y-5">
            <RequestList
              title="Leave requests"
              requests={dashboard.pendingApprovals.leaveRequests}
              kind="leave"
              busyId={busyId}
              onReview={reviewRequest}
            />
            <RequestList
              title="Outdoor duty requests"
              requests={dashboard.pendingApprovals.outdoorDutyRequests}
              kind="outdoor"
              busyId={busyId}
              onReview={reviewRequest}
            />
          </div>
        </section>

        <div className="space-y-5">
          <section className={cardStyle}>
            <h2 className="font-bold text-slate-900">Department overview</h2>
            <div className="mt-4 space-y-3">
              {dashboard.departmentWiseEmployeeCount.length ? (
                dashboard.departmentWiseEmployeeCount.map((department) => (
                  <div key={department._id}>
                    <div className="mb-1.5 flex justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-slate-700">
                        {department._id}
                      </span>
                      <span className="font-semibold text-slate-500">
                        {department.count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#88965a]"
                        style={{
                          width: `${Math.max(4, (department.count / departmentTotal) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">
                  No active employees yet.
                </p>
              )}
            </div>
          </section>

          <section className={cardStyle}>
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#748443]" />
              <h2 className="font-bold text-slate-900">Upcoming official holidays</h2>
            </div>
            {dashboard.upcomingOfficialHolidays.length ? (
              <ul className="divide-y divide-slate-100">
                {dashboard.upcomingOfficialHolidays.map((holiday) => (
                  <li
                    key={holiday._id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {holiday.title}
                    </span>
                    <span className="shrink-0 rounded-lg bg-[#f1f3e8] px-2 py-1 text-xs font-semibold text-[#65733b]">
                      {formatDate(holiday.date)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-slate-500">
                No upcoming holidays
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
