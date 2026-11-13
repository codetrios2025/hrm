import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useToast } from "./context/ToastContext";
import AuthModal from "./components/AuthModal";
import AttendanceCard from "./components/AttendanceCard";
import MyAttendanceSheet from "./components/MyAttendanceSheet";
import AdminPanel from "./components/AdminPanel";
import AdminDashboard from "./components/AdminDashboard";
import OutdoorDutyManager from "./components/OutdoorDutyManager";
import LeaveManager from "./components/LeaveManager";
import ChangePasswordModal from "./components/ChangePasswordModal";
import HeartbeatManager from "./components/HeartbeatManager";
import AdminLeaveHistory from "./components/AdminLeaveHistory";
import EmployeeProfileModal from "./components/EmployeeProfileModal";
import AdminEmployeeAttendance from "./components/AdminEmployeeAttendance";
import HRMTaskTimeTracker from "./components/HRMTaskTimeTracker";
import OnboardingWizard from "./components/OnboardingWizard";

/*
|--------------------------------------------------------------------------
| NEW
|--------------------------------------------------------------------------
| Official Holiday Management
|
| HR Admin can:
| - View official holidays
| - Add holiday
| - Edit holiday
| - Delete holiday
| - View holiday list with pagination
|--------------------------------------------------------------------------
*/
import OfficialHolidayManager from "./components/OfficialHolidayManager";

import {
  LayoutDashboard,
  LogOut,
  User as UserIcon,
  KeyRound,
  Clock,
  CalendarDays,
  ShieldAlert,
  Briefcase,
  Calendar,
  CalendarRange,
  CalendarCheck,
} from "lucide-react";

import logoImg from "./assets/logo.png";

export default function App() {
  const { user, logout, loading, refreshUser } = useAuth();
  const { showInfo } = useToast();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [tabSelection, setTabSelection] = useState(null);
  const activeTab =
  tabSelection && user && tabSelection.userId === user._id
    ? tabSelection.id
    : user?.role === "admin"
      ? "admin-dashboard"
      : "daily-punch";
  const setActiveTab = (id) => setTabSelection({ userId: user?._id, id });

  const handleLogout = () => {
    setTabSelection(null);
    logout();
    showInfo("Logged out successfully");
  };

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 font-medium">
        Loading system...
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Not Logged In
  |--------------------------------------------------------------------------
  */

  if (!user) {
    return <AuthModal />;
  }
  if (user.role === "admin" && user.onboardingCompleted === false) {
    return <OnboardingWizard />;
  }

  /*
  |--------------------------------------------------------------------------
  | Sidebar Navigation
  |--------------------------------------------------------------------------
  |
  | Official Holidays is intentionally added ONLY inside the admin section.
  |
  */

  const menuItems = [
    ...(user.role === "admin"
      ? [
          {
            id: "admin-dashboard",
            label: "Dashboard",
            icon: LayoutDashboard,
          },
        ]
      : []),
    {
      id: "daily-punch",
      label: "Daily Punch",
      icon: Clock,
    },

    {
      id: "attendance-sheet",
      label: "My Attendance Sheet",
      icon: CalendarDays,
    },

    /*
    |--------------------------------------------------------------------------
    | HR ADMIN ONLY MENU ITEMS
    |--------------------------------------------------------------------------
    */

    ...(user.role === "admin"
      ? [
          {
            id: "admin-panel",
            label: "HR Admin Control Panel",
            icon: ShieldAlert,
          },

          {
            id: "admin-leave-history",
            label: "Employee Leave History",
            icon: CalendarRange,
          },

          {
            id: "admin-employee-attendance",
            label: "Employee Attendance History",
            icon: CalendarRange,
          },

          /*
          |--------------------------------------------------------------------------
          | NEW - OFFICIAL HOLIDAYS
          |--------------------------------------------------------------------------
          */

          {
            id: "official-holidays",
            label: "Official Holidays",
            icon: CalendarCheck,
          },
        ]
      : []),

    /*
    |--------------------------------------------------------------------------
    | COMMON MENU ITEMS
    |--------------------------------------------------------------------------
    */

    {
      id: "outdoor-duty",
      label: "On-Duty / Outdoor Duty (OD)",
      icon: Briefcase,
    },

    /*
    |--------------------------------------------------------------------------
    | Attendance Regularization
    |--------------------------------------------------------------------------
    */

    // {
    //   id: "regularization",
    //   label: "Attendance Regularization",
    //   icon: CalendarClock,
    // },

    {
      id: "leave-management",
      label: "Leave Management",
      icon: Calendar,
    },
    ...(user.planFeatures?.includes("taskTimeTracker")
      ? [
          {
            id: "task-time-tracker",
            label: "Task Time Tracker",
            icon: Clock,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      {/* ------------------------------------------------------------------ */}
      {/* Background Heartbeat                                               */}
      {/* ------------------------------------------------------------------ */}

      <HeartbeatManager />

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="w-full mx-auto px-3 sm:px-6 py-3 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          {/* Left Header */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {/* Logo */}
            <img
              src={logoImg}
              alt="oliveHRM Logo"
              className="h-9 w-auto shrink-0 object-contain"
            />

            {/* Profile Avatar */}
            <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 bg-indigo-50 flex items-center justify-center shrink-0">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-5 h-5 text-indigo-600" />
              )}
            </div>

            {/* User Information */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold text-slate-900 text-sm leading-tight">
                  {user.name}
                </p>

                {user.employeeId && (
                  <span className="shrink-0 text-[10px] bg-slate-100 text-slate-600 font-mono px-1.5 py-0.5 rounded border border-slate-200">
                    {user.employeeId}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 capitalize">
                {user.role === "admin" ? "HR Administrator" : user.role}
              </p>
            </div>
          </div>

          {/* Right Header Buttons */}
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {/* Change Password */}
            <button
              aria-label="Change Password"
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg transition bg-white font-medium shadow-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />

              <span className="hidden sm:inline">Change Password</span>
            </button>

            {/* My Profile */}
            <button
              aria-label="My Profile"
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg transition bg-white font-medium shadow-sm"
            >
              <UserIcon className="w-3.5 h-3.5" />

              <span className="hidden sm:inline">My Profile</span>
            </button>

            {/* Sign Out */}
            <button
              aria-label="Sign Out"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition bg-white font-medium shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />

              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {!user.emailVerified && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Your email address is not verified yet. Use the verification link we sent to your inbox.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main Body                                                          */}
      {/* ------------------------------------------------------------------ */}

      <div className="w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-start">
        {/* ---------------------------------------------------------------- */}
        {/* Sidebar                                                          */}
        {/* ---------------------------------------------------------------- */}

        <aside className="w-full min-w-0 shrink-0 md:w-[260px] md:min-w-[260px]">
          <nav className="flex gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:sticky md:top-20 md:block md:space-y-1">
            <div className="hidden px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:block">
              Navigation
            </div>

            {menuItems.map((item) => {
              const Icon = item.icon;

              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-auto shrink-0 flex items-center gap-2 md:gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition text-left md:w-full ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? "text-indigo-600" : "text-slate-400"
                    }`}
                  />

                  <span className="whitespace-nowrap md:truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Right Content Area                                                */}
        {/* ---------------------------------------------------------------- */}

        <main className="w-full flex-1 min-w-0">
          {/* Daily Punch */}
          {activeTab === "daily-punch" && <AttendanceCard />}

          {/* My Attendance */}
          {activeTab === "attendance-sheet" && <MyAttendanceSheet />}

          {/* ---------------------------------------------------------------- */}
          {/* HR ADMIN MODULES                                                 */}
          {/* ---------------------------------------------------------------- */}

          {activeTab === "admin-dashboard" && user.role === "admin" && (
            <AdminDashboard />
          )}

          {activeTab === "admin-panel" && user.role === "admin" && (
            <AdminPanel />
          )}

          {activeTab === "admin-leave-history" && user.role === "admin" && (
            <AdminLeaveHistory />
          )}

          {activeTab === "admin-employee-attendance" &&
            user.role === "admin" && <AdminEmployeeAttendance />}

          {/* ---------------------------------------------------------------- */}
          {/* NEW - OFFICIAL HOLIDAY MANAGEMENT                                */}
          {/* ---------------------------------------------------------------- */}

          {activeTab === "official-holidays" && user.role === "admin" && (
            <OfficialHolidayManager />
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Common Modules                                                   */}
          {/* ---------------------------------------------------------------- */}

          {activeTab === "outdoor-duty" && <OutdoorDutyManager />}

          {/* Regularization */}
          {/* 
          {activeTab === "regularization" && (
            <RegularizationManager />
          )}
          */}

          {/* Leave Management */}
          {activeTab === "leave-management" && <LeaveManager />}
          {/* Task Time Tracker */}
          {activeTab === "task-time-tracker" &&
            user.planFeatures?.includes("taskTimeTracker") && (
            <HRMTaskTimeTracker loggedInEmployeeEmail={user.email} />
            )}
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                             */}
      {/* ------------------------------------------------------------------ */}

      <footer className="bg-white border-t border-slate-200 mt-auto py-4">
        <div className="w-full mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} Attendance & Leave Management System.
            All rights reserved.
          </p>

          <div className="flex items-center gap-4 text-[11px]">
            {/* Version / Status can be added here */}
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------------ */}
      {/* Change Password Modal                                               */}
      {/* ------------------------------------------------------------------ */}

      {(showPasswordModal || user?.mustChangePassword) && (
        <ChangePasswordModal
          forceChange={user?.mustChangePassword}
          onChanged={refreshUser}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Profile Modal                                                       */}
      {/* ------------------------------------------------------------------ */}

      {showProfileModal && (
        <EmployeeProfileModal
          onClose={() => setShowProfileModal(false)}
          onUpdated={async () => {
            if (typeof refreshUser === "function") {
              await refreshUser();
            }
          }}
        />
      )}
    </div>
  );
}
