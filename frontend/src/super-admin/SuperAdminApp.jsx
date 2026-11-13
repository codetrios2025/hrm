import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Building2,
  LayoutDashboard,
  LogOut,
  MailCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import logoImg from "../assets/logo.png";
import { superAdminApi } from "../api/client";
import { useToast } from "../context/ToastContext";
import SuperAdminDashboard from "./SuperAdminDashboard";
import SuperAdminTenants from "./SuperAdminTenants";
import SuperAdminTenantForm from "./SuperAdminTenantForm";
import SuperAdminTenantDetails from "./SuperAdminTenantDetails";
import SuperAdminTenantRequests from "./SuperAdminTenantRequests";

const TOKEN_KEY = "superAdminToken";
const ADMIN_KEY = "superAdmin";
const SUPER_ADMIN_LOGIN_PATH = "/super/auth/login";

const readStoredAdmin = () => {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY) || "null");
  } catch {
    localStorage.removeItem(ADMIN_KEY);
    return null;
  }
};

function SuperAdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:flex sm:items-center sm:justify-center">
      <section className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-[#64723b] px-7 py-8 text-white">
          <img
            src={logoImg}
            alt="oliveHRM"
            className="mb-7 h-10 w-auto rounded bg-white p-1.5 object-contain"
          />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white/75">Platform access</p>
              <h1 className="text-xl font-bold">Super Admin sign in</h1>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-5 p-7">
          <p className="text-sm leading-6 text-slate-600">
            Sign in with your platform administrator account to manage tenants.
          </p>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          )}
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none transition focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/15"
              placeholder="admin@example.com"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none transition focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/15"
              placeholder="Enter your password"
            />
          </label>
          <button
            disabled={submitting}
            className="w-full rounded-lg bg-[#64723b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#53612f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in securely"}
          </button>
        </form>
        <p className="border-t border-slate-100 px-7 py-4 text-center text-xs text-slate-500">
          Separate from your oliveHRM company account
        </p>
      </section>
    </main>
  );
}

export default function SuperAdminApp({ pathname, navigate }) {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_KEY) || null,
  );
  const [admin, setAdmin] = useState(readStoredAdmin);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { showInfo } = useToast();
  const isLoginPage = pathname.replace(/\/+$/, "") === "/super-admin/login";

  useEffect(() => {
    if (!token && !isLoginPage) {
      navigate("/super-admin/login", true);
    }
    if (token && isLoginPage) {
      navigate("/super-admin", true);
    }
  }, [isLoginPage, navigate, token]);

  useEffect(() => {
    const clearSession = () => {
      setToken(null);
      setAdmin(null);
    };
    window.addEventListener("super-admin-unauthorized", clearSession);
    return () =>
      window.removeEventListener("super-admin-unauthorized", clearSession);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await superAdminApi.get("/super/notifications", {
        params: { limit: 10 },
      });
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (error) {
      console.error("Unable to load Super Admin notifications:", error);
    }
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(interval);
  }, [loadNotifications, token]);

  const login = async (email, password) => {
    const response = await superAdminApi.post(SUPER_ADMIN_LOGIN_PATH, {
      email,
      password,
    });
    const nextToken = response.data.token;
    const nextAdmin = response.data.superAdmin;
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(nextAdmin));
    setToken(nextToken);
    setAdmin(nextAdmin);
    navigate("/super-admin", true);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    setToken(null);
    setAdmin(null);
    showInfo("Signed out of platform administration");
    navigate("/super-admin/login", true);
  };

  const openNotification = async (notification) => {
    try {
      await superAdminApi.patch(
        `/super/notifications/${notification._id}/read`,
      );
      setNotifications((current) =>
        current.map((item) =>
          item._id === notification._id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((count) => (notification.isRead ? count : Math.max(0, count - 1)));
      setNotificationsOpen(false);
      navigate(notification.link || "/super-admin");
    } catch (error) {
      console.error("Unable to mark Super Admin notification as read:", error);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await superAdminApi.patch("/super/notifications/read-all");
      setNotifications((current) =>
        current.map((item) => ({ ...item, isRead: true })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Unable to mark notifications as read:", error);
    }
  };

  if (isLoginPage) {
    return <SuperAdminLogin onLogin={login} />;
  }
  if (!token) return null;

  const tenantDetails = pathname.match(/^\/super-admin\/tenants\/([^/]+)$/);
  const activeSection = pathname.includes("/requests") ||
    pathname.includes("/tenant-requests")
    ? "requests"
    : pathname.includes("/tenants")
    ? "tenants"
    : "dashboard";

  let page;
  if (pathname === "/super-admin/tenants/new") {
    page = <SuperAdminTenantForm navigate={navigate} />;
  } else if (tenantDetails) {
    page = (
      <SuperAdminTenantDetails
        key={decodeURIComponent(tenantDetails[1])}
        tenantId={decodeURIComponent(tenantDetails[1])}
        navigate={navigate}
      />
    );
  } else if (activeSection === "requests") {
    page = (
      <SuperAdminTenantRequests pathname={pathname} navigate={navigate} />
    );
  } else if (activeSection === "tenants") {
    page = <SuperAdminTenants navigate={navigate} />;
  } else {
    page = <SuperAdminDashboard navigate={navigate} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate("/super-admin")}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <img src={logoImg} alt="oliveHRM" className="h-9 w-auto object-contain" />
            <span className="hidden h-8 border-l border-slate-200 sm:block" />
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-[#64723b]" />
              Platform Admin
            </span>
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-bold text-slate-800">
                      Notifications
                    </p>
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      disabled={!unreadCount}
                      className="text-xs font-semibold text-[#64723b] disabled:text-slate-400"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length ? (
                      notifications.map((notification) => (
                        <button
                          key={notification._id}
                          type="button"
                          onClick={() => openNotification(notification)}
                          className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                            notification.isRead ? "" : "bg-[#f7f8f2]"
                          }`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-800">
                              {notification.title}
                            </span>
                            {!notification.isRead && (
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#64723b]" />
                            )}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">
                            {notification.message}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(new Date(notification.createdAt))}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">
                        You are all caught up.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">
                {admin?.name || "Super Admin"}
              </p>
              <p className="text-xs text-slate-500">{admin?.email}</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-3 py-5 sm:px-6 md:flex-row md:gap-6 md:py-7">
        <aside className="w-full shrink-0 md:w-60">
          <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:sticky md:top-24 md:block md:space-y-1">
            <NavButton
              active={activeSection === "dashboard"}
              icon={LayoutDashboard}
              label="Dashboard"
              onClick={() => navigate("/super-admin")}
            />
            <NavButton
              active={activeSection === "tenants"}
              icon={Building2}
              label="Tenants"
              onClick={() => navigate("/super-admin/tenants")}
            />
            <NavButton
              active={activeSection === "requests"}
              icon={MailCheck}
              label="Tenant requests"
              onClick={() => navigate("/super-admin/requests")}
            />
          </nav>
          <div className="mt-4 hidden rounded-xl border border-[#dce3cc] bg-[#f7f8f2] p-4 text-xs leading-5 text-slate-600 md:block">
            <div className="mb-2 flex items-center gap-2 font-semibold text-[#566434]">
              <UsersRound className="h-4 w-4" />
              Platform controls
            </div>
            Manage company accounts and monitor tenant usage from one place.
          </div>
        </aside>
        <main className="min-w-0 flex-1">{page}</main>
      </div>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition md:w-full ${
        active
          ? "border border-[#e1e6d6] bg-[#f4f6ed] text-[#566434]"
          : "border border-transparent text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}
