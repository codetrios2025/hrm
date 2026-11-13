import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../api/client";
import logoImg from "../assets/logo.png";

export default function VerifyEmailPage({ navigate }) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const companySlug = params.get("companySlug");
  const [status, setStatus] = useState(() =>
    token && companySlug ? "verifying" : "invalid",
  );

  useEffect(() => {
    if (!token || !companySlug) return undefined;

    let active = true;
    api
      .post("/public/verify-email", { token, companySlug })
      .then(() => {
        if (active) setStatus("verified");
      })
      .catch(() => {
        if (active) setStatus("invalid");
      });
    return () => {
      active = false;
    };
  }, [companySlug, token]);

  const verified = status === "verified";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <img src={logoImg} alt="oliveHRM" className="mx-auto mb-6 h-10 w-auto" />
        {status === "verifying" ? (
          <p className="text-sm text-slate-600">Verifying your email address…</p>
        ) : (
          <>
            {verified ? (
              <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-600" />
            ) : (
              <XCircle className="mx-auto mb-4 h-10 w-10 text-rose-600" />
            )}
            <h1 className="text-xl font-bold text-slate-900">
              {verified ? "Email verified" : "Verification link invalid"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {verified
                ? "Your company email is verified. You can continue to your workspace."
                : "This link may have expired or already been used. Sign in to request help from your administrator."}
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Continue to sign in
            </button>
          </>
        )}
      </section>
    </main>
  );
}
