import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useToast } from "./context/ToastContext";
import AuthModal from "./components/AuthModal";
import AttendanceCard from "./components/AttendanceCard";
import MyAttendanceSheet from "./components/MyAttendanceSheet";
import AdminPanel from "./components/AdminPanel";
import OutdoorDutyManager from "./components/OutdoorDutyManager";
import LeaveManager from "./components/LeaveManager";
import ChangePasswordModal from "./components/ChangePasswordModal";
import HeartbeatManager from "./components/HeartbeatManager";
import AdminLeaveHistory from "./components/AdminLeaveHistory";
import EmployeeProfileModal from "./components/EmployeeProfileModal";
import AdminEmployeeAttendance from "./components/AdminEmployeeAttendance";
import HRMTaskTimeTracker from "./components/HRMTaskTimeTracker";

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

  // Active Menu Tab
  const [activeTab, setActiveTab] = useState("daily-punch");

  const handleLogout = () => {
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

  /*
  |--------------------------------------------------------------------------
  | Sidebar Navigation
  |--------------------------------------------------------------------------
  |
  | Official Holidays is intentionally added ONLY inside the admin section.
  |
  */

  const menuItems = [
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
    {
      id: "task-time-tracker",
      label: "Task Time Tracker",
      icon: Clock,
    },
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
        <div className="w-full mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          {/* Left Header */}
          <div className="flex items-center space-x-4">
            {/* Logo */}
            <img
              src={logoImg}
              alt="oliveHRM Logo"
              className="h-9 w-auto object-contain"
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
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-900 text-sm leading-tight">
                  {user.name}
                </p>

                {user.employeeId && (
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-1.5 py-0.5 rounded border border-slate-200">
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
          <div className="flex items-center gap-2">
            {/* Change Password */}
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg transition bg-white font-medium shadow-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />

              <span>Change Password</span>
            </button>

            {/* My Profile */}
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg transition bg-white font-medium shadow-sm"
            >
              <UserIcon className="w-3.5 h-3.5" />

              <span>My Profile</span>
            </button>

            {/* Sign Out */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition bg-white font-medium shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />

              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main Body                                                          */}
      {/* ------------------------------------------------------------------ */}

      <div className="w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-row gap-6 items-start">
        {/* ---------------------------------------------------------------- */}
        {/* Sidebar                                                          */}
        {/* ---------------------------------------------------------------- */}

        <aside className="w-[260px] min-w-[260px] shrink-0">
          <nav className="bg-white rounded-xl border border-slate-200 p-2 shadow-sm space-y-1 sticky top-20">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Navigation
            </div>

            {menuItems.map((item) => {
              const Icon = item.icon;

              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition text-left ${
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

                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Right Content Area                                                */}
        {/* ---------------------------------------------------------------- */}

        <main className="flex-1 min-w-0">
          {/* Daily Punch */}
          {activeTab === "daily-punch" && <AttendanceCard />}

          {/* My Attendance */}
          {activeTab === "attendance-sheet" && <MyAttendanceSheet />}

          {/* ---------------------------------------------------------------- */}
          {/* HR ADMIN MODULES                                                 */}
          {/* ---------------------------------------------------------------- */}

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
          {activeTab === "task-time-tracker" && (
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

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
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
