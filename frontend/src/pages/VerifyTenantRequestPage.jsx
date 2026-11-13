import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import api from "../api/client";
import logoImg from "../assets/logo.png";

export default function VerifyTenantRequestPage({ navigate }) {
  const token = new URLSearchParams(window.location.search).get("token");
  const [result, setResult] = useState({
    status: token ? "verifying" : "invalid",
    mode: null,
    message: "",
  });

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    api
      .get("/public/signup-request/verify", { params: { token } })
      .then((response) => {
        if (active) {
          setResult({
            status: "verified",
            mode: response.data.mode,
            message: response.message,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setResult({
            status: "invalid",
            mode: null,
            message: error.message,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const verified = result.status === "verified";
  const autoApproved = verified && result.mode === "auto";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <img src={logoImg} alt="oliveHRM" className="mx-auto mb-6 h-10 w-auto" />
        {result.status === "verifying" ? (
          <>
            <LoaderCircle className="mx-auto mb-4 h-10 w-10 animate-spin text-[#64723b]" />
            <p className="text-sm text-slate-600">Verifying your email address…</p>
          </>
        ) : (
          <>
            {verified ? (
              <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-600" />
            ) : (
              <XCircle className="mx-auto mb-4 h-10 w-10 text-rose-600" />
            )}
            <h1 className="text-xl font-bold text-slate-900">
              {!verified
                ? "Verification link invalid"
                : autoApproved
                  ? "Check your email"
                  : "Request received, we will contact you"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {!verified
                ? result.message ||
                  "This link may have expired or already been used. Submit a new workspace request to try again."
                : autoApproved
                  ? "Your email is verified and your workspace is ready. We sent your company code and administrator credentials by email."
                  : "Your email is verified and your request is now with our team for review. We will contact you with an update."}
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-6 rounded-lg bg-[#64723b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#53612f]"
            >
              Continue to sign in
            </button>
          </>
        )}
      </section>
    </main>
  );
}
