import { useCallback, useEffect, useState } from "react";
import { Check, Mail, RefreshCw, Search, X } from "lucide-react";
import { superAdminApi } from "../api/client";
import { ErrorBanner } from "./SuperAdminDashboard";

const statuses = ["pending", "approved", "rejected"];
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export default function SuperAdminTenantRequests({ pathname, navigate }) {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [plan, setPlan] = useState("free");
  const [employeeLimit, setEmployeeLimit] = useState("");
  const [trialDays, setTrialDays] = useState("14");
  const [rejectionReason, setRejectionReason] = useState("");
  const selectedId = pathname.match(/^\/super-admin\/requests\/([^/]+)$/)?.[1];

  const loadRequests = useCallback(async () => {
    try {
      const response = await superAdminApi.get("/super/requests", {
        params: { page, limit: 20, status, search: search.trim() || undefined },
      });
      setRequests(response.data.requests || []);
      setPagination(response.data.pagination);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load tenant requests");
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(loadRequests, 250);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedRequest(null);
      return;
    }
    let active = true;
    superAdminApi
      .get(`/super/requests/${encodeURIComponent(selectedId)}`)
      .then((response) => {
        if (active) {
          setSelectedRequest(response.data);
          setDialog(null);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) {
          setSelectedRequest(null);
          setError(requestError.message || "Unable to load request details");
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const review = async (event) => {
    event.preventDefault();
    if (!selectedRequest) return;
    setBusy(true);
    setError("");
    try {
      if (dialog === "approve") {
        await superAdminApi.post(
          `/super/requests/${selectedRequest._id}/approve`,
          {
            plan,
            ...(employeeLimit ? { employeeLimit: Number(employeeLimit) } : {}),
            trialDays: Number(trialDays),
          },
        );
        setStatus("approved");
      } else {
        await superAdminApi.post(
          `/super/requests/${selectedRequest._id}/reject`,
          { reason: rejectionReason.trim() },
        );
        setStatus("rejected");
      }
      setPage(1);
      setDialog(null);
      setSelectedRequest(null);
      navigate("/super-admin/requests");
      await loadRequests();
    } catch (requestError) {
      setError(requestError.message || "Unable to process tenant request");
    } finally {
      setBusy(false);
    }
  };

  const openRequest = (id) =>
    navigate(`/super-admin/requests/${encodeURIComponent(id)}`);

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#64723b]">Verified enquiries</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Tenant requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review verified signup requests and track their status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadRequests();
          }}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {statuses.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatus(item);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                status === item
                  ? "bg-[#f1f3e9] text-[#566434]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="relative block sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search company, contact, email"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#64723b]"
          />
        </label>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
          Loading tenant requests...
        </div>
      ) : requests.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {requests.map((request) => (
              <button
                key={request._id}
                type="button"
                onClick={() => openRequest(request._id)}
                className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {request.companyName}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                      {request.status}
                    </span>
                  </span>
                  <span className="mt-1 block font-mono text-xs text-slate-500">
                    {request.slug}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <Mail className="h-3.5 w-3.5" />
                    {request.contactName} · {request.email}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {request.employeeCountEstimate} employees ·{" "}
                  {formatDate(request.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
          <p className="font-semibold capitalize text-slate-800">
            No {status} requests
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Verified signup requests will appear here.
          </p>
        </div>
      )}

      {!loading && pagination?.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total}{" "}
            requests
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
          <button
            type="button"
            aria-label="Close request details"
            onClick={() => navigate("/super-admin/requests")}
            className="absolute inset-0 cursor-default"
          />
          <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#64723b]">
                  Request details
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {selectedRequest?.companyName || "Loading..."}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/super-admin/requests")}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {selectedRequest && (
              <div className="flex-1 space-y-5 p-5">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Company code" value={selectedRequest.slug} />
                  <Detail label="Status" value={selectedRequest.status} capitalize />
                  <Detail label="Contact" value={selectedRequest.contactName} />
                  <Detail label="Email" value={selectedRequest.email} />
                  <Detail label="Phone" value={selectedRequest.phone} />
                  <Detail
                    label="Estimated employees"
                    value={selectedRequest.employeeCountEstimate}
                  />
                  <Detail label="Submitted" value={formatDate(selectedRequest.createdAt)} />
                  <Detail label="Reviewed" value={formatDate(selectedRequest.reviewedAt)} />
                </div>
                {selectedRequest.message && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                      Message
                    </p>
                    <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      {selectedRequest.message}
                    </p>
                  </div>
                )}
                {selectedRequest.rejectionReason && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                      Rejection reason
                    </p>
                    <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                      {selectedRequest.rejectionReason}
                    </p>
                  </div>
                )}
                {selectedRequest.status === "pending" && (
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    {!dialog ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setDialog("approve")}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#53612f]"
                        >
                          <Check className="h-4 w-4" />
                          Approve request
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialog("reject")}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          <X className="h-4 w-4" />
                          Reject request
                        </button>
                      </>
                    ) : (
                      <form onSubmit={review} className="space-y-3 rounded-xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold capitalize text-slate-900">
                            {dialog} request
                          </h3>
                          <button
                            type="button"
                            onClick={() => setDialog(null)}
                            className="text-xs font-semibold text-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                        {dialog === "approve" ? (
                          <>
                            <label className="block text-xs font-medium text-slate-600">
                              Plan
                              <select
                                value={plan}
                                onChange={(event) => setPlan(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                              >
                                <option value="free">Free</option>
                                <option value="basic">Basic</option>
                                <option value="pro">Pro</option>
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-slate-600">
                              Employee limit override (optional)
                              <input
                                type="number"
                                min="1"
                                value={employeeLimit}
                                onChange={(event) => setEmployeeLimit(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                placeholder="Use plan limit"
                              />
                            </label>
                            <label className="block text-xs font-medium text-slate-600">
                              Trial days
                              <input
                                type="number"
                                min="1"
                                max="365"
                                required
                                value={trialDays}
                                onChange={(event) => setTrialDays(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          </>
                        ) : (
                          <label className="block text-xs font-medium text-slate-600">
                            Rejection reason
                            <textarea
                              required
                              minLength={1}
                              maxLength={1000}
                              rows={4}
                              value={rejectionReason}
                              onChange={(event) => setRejectionReason(event.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        )}
                        {error && <ErrorBanner message={error} />}
                        <button
                          type="submit"
                          disabled={busy}
                          className="w-full rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy ? "Processing..." : `Confirm ${dialog}`}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function Detail({ label, value, capitalize = false }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 break-words font-medium text-slate-800 ${capitalize ? "capitalize" : ""}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}
