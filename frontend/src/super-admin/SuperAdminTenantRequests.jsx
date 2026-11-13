import { useCallback, useEffect, useState } from "react";
import { Check, Mail, RefreshCw, X } from "lucide-react";
import { superAdminApi } from "../api/client";
import { ErrorBanner } from "./SuperAdminDashboard";

const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

export default function SuperAdminTenantRequests() {
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState({});

  const loadRequests = useCallback(async () => {
    try {
      const response = await superAdminApi.get("/super/tenant-requests", {
        params: { page, limit: 20 },
      });
      setRequests(response.data.requests || []);
      setPagination(response.data.pagination);
    } catch (requestError) {
      setError(requestError.message || "Unable to load tenant requests");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    let active = true;
    superAdminApi
      .get("/super/tenant-requests", { params: { page, limit: 20 } })
      .then((response) => {
        if (active) {
          setRequests(response.data.requests || []);
          setPagination(response.data.pagination);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Unable to load tenant requests");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const review = async (request, status) => {
    const rejectionReason = rejectionReasons[request._id]?.trim();
    if (status === "rejected" && !rejectionReason) {
      setError("Enter a reason before rejecting a request.");
      return;
    }
    setBusyId(request._id);
    setError("");
    try {
      await superAdminApi.patch(
        `/super/tenant-requests/${request._id}/review`,
        {
          status,
          ...(status === "rejected" ? { rejectionReason } : {}),
        },
      );
      await loadRequests();
    } catch (requestError) {
      setError(requestError.message || `Unable to ${status} request`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#64723b]">Verified enquiries</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Tenant requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Only email-verified requests appear here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError("");
            loadRequests();
          }}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
          Loading verified requests…
        </div>
      ) : requests.length ? (
        <div className="space-y-4">
          {requests.map((request) => (
            <article
              key={request._id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      {request.companyName}
                    </h2>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Email verified
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {request.slug}
                  </p>
                  <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold">Contact:</span>{" "}
                      {request.contactName}
                    </p>
                    <p className="inline-flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {request.email}
                    </p>
                    <p>
                      <span className="font-semibold">Phone:</span>{" "}
                      {request.phone}
                    </p>
                    <p>
                      <span className="font-semibold">Employees:</span>{" "}
                      {request.employeeCountEstimate}
                    </p>
                    <p className="text-xs text-slate-500 sm:col-span-2">
                      Received {formatDate(request.createdAt)}
                    </p>
                  </div>
                  {request.message && (
                    <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      {request.message}
                    </p>
                  )}
                </div>

                <div className="flex w-full flex-col gap-2 lg:max-w-xs">
                  <button
                    type="button"
                    disabled={busyId === request._id}
                    onClick={() => review(request, "approved")}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#64723b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#53612f] disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {busyId === request._id ? "Processing…" : "Approve & create tenant"}
                  </button>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={rejectionReasons[request._id] || ""}
                    onChange={(event) =>
                      setRejectionReasons((current) => ({
                        ...current,
                        [request._id]: event.target.value,
                      }))
                    }
                    placeholder="Reason shown in rejection email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
                  />
                  <button
                    type="button"
                    disabled={busyId === request._id}
                    onClick={() => review(request, "rejected")}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Reject request
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
          <p className="font-semibold text-slate-800">No verified requests</p>
          <p className="mt-1 text-sm text-slate-500">
            Requests appear here after applicants verify their email.
          </p>
        </div>
      )}
      {!loading && pagination?.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span>
            Page {pagination.page} of {pagination.totalPages} ·{" "}
            {pagination.total} verified requests
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                setLoading(true);
                setPage((current) => current - 1);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => {
                setLoading(true);
                setPage((current) => current + 1);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
