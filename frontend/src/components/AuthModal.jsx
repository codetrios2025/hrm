import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Lock, Mail, ArrowLeft, KeyRound, Building2 } from "lucide-react";
import api from "../api/client";
import logoImg from "../assets/logo.png";

export default function AuthModal() {
  const [view, setView] = useState("login"); // 'login' | 'forgot' | 'reset'
  const [companySlug, setCompanySlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("resetToken");
    const companyCode = params.get("companySlug");
    if (companyCode) setCompanySlug(companyCode);
    if (token) {
      setResetToken(token);
      setView("reset");
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(companySlug, email, password);
      showSuccess("Logged in successfully");
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", {
        companySlug,
        email,
      });
      showSuccess(res.message || "Check your email for reset instructions.");
      setView("login");
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post(`/auth/reset-password/${resetToken}`, {
        companySlug,
        password: newPassword,
      });
      showSuccess(res.message || "Password reset successfully. Please log in.");
      // window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        window.location.replace("/");
      }, 2000);
      setView("login");
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {/* Centered oliveHRM Logo Header */}
        <div className="flex flex-col items-center mb-6">
          <img
            src={logoImg}
            alt="oliveHRM"
            className="h-10 w-auto object-contain mb-3"
          />
        </div>

        {/* LOGIN VIEW */}
        {view === "login" && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-lg font-bold text-slate-800">Sign In</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Attendance &amp; Leave Portal
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Company Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoComplete="organization"
                    placeholder="company-code"
                    required
                    className="w-full border rounded-lg p-2.5 pl-8 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={companySlug}
                    onChange={(e) => setCompanySlug(e.target.value)}
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Work Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="name@company.com"
                    required
                    className="w-full border rounded-lg p-2.5 pl-8 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-600 font-medium">Password</label>
                  <button
                    type="button"
                    onClick={() => setView("forgot")}
                    className="text-indigo-600 hover:underline text-[11px]"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="••••••••"
                    required
                    className="w-full border rounded-lg p-2.5 pl-8 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 shadow-sm"
              >
                {loading ? "Authenticating..." : "Sign In"}
              </button>
            </form>
          </>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {view === "forgot" && (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 text-amber-600 mb-2">
                <KeyRound className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-slate-800">
                Forgot Password
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Enter your email to receive a reset link
              </p>
            </div>

            <form onSubmit={handleForgot} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Company Code
                </label>
                <input
                  type="text"
                  autoComplete="organization"
                  placeholder="company-code"
                  required
                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={companySlug}
                  onChange={(e) => setCompanySlug(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Registered Work Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="name@company.com"
                    required
                    className="w-full border rounded-lg p-2.5 pl-8 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 shadow-sm"
              >
                {loading ? "Sending link..." : "Send Reset Link"}
              </button>

              <button
                type="button"
                onClick={() => setView("login")}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 pt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </form>
          </>
        )}

        {/* RESET PASSWORD VIEW */}
        {view === "reset" && (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-50 text-rose-600 mb-2">
                <KeyRound className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-slate-800">
                Set New Password
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Enter your new secure password
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                  className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 shadow-sm"
              >
                {loading ? "Resetting..." : "Save New Password"}
              </button>

              <button
                type="button"
                onClick={() => setView("login")}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 pt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </form>
          </>
        )}
        {view === "login" && (
          <p className="mt-5 text-center text-xs text-slate-500">
            New to oliveHRM?{" "}
            <a href="/signup" className="font-semibold text-indigo-600 hover:underline">
              Create a company workspace
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
