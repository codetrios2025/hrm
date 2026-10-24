import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useToast } from "./context/ToastContext";
import AuthModal from "./components/AuthModal";
import AttendanceCard from "./components/AttendanceCard";
import MyAttendanceSheet from "./components/MyAttendanceSheet"; // Import new sheet
import LeaveManager from "./components/LeaveManager";
import AdminPanel from "./components/AdminPanel";
import OutdoorDutyManager from "./components/OutdoorDutyManager";
import ChangePasswordModal from "./components/ChangePasswordModal";
import { LogOut, User as UserIcon, KeyRound } from "lucide-react";

export default function App() {
  const { user, logout, loading } = useAuth();
  const { showInfo } = useToast();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleLogout = () => {
    logout();
    showInfo("Logged out successfully");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading system...
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  return (
    <div className="min-h-screen pb-12 bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 capitalize">
                {user.role === "admin" ? "HR Administrator" : user.role}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg transition bg-white"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition bg-white"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-6 space-y-6">
        {/* Daily Punch Card */}
        <AttendanceCard />

        {/* Read-Only Monthly Attendance Sheet */}
        <MyAttendanceSheet />

        {/* HR Admin Panel (Only for HR) */}
        {user.role === "admin" && <AdminPanel />}

        <OutdoorDutyManager />
        {/* Leave Requests & Management */}
        <LeaveManager />
      </main>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
