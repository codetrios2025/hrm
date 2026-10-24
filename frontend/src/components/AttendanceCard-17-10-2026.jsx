import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "./ConfirmModal";

export default function AttendanceCard() {
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { showSuccess, showError } = useToast();

  const fetchTodayStatus = async () => {
    try {
      const res = await api.get("/attendance/today");
      const log = res.data?.data !== undefined ? res.data.data : res.data;
      setTodayLog(log);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  // Update timer every 30 seconds so active time reflects true clock time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to global heartbeat updates dispatched from HeartbeatManager
  useEffect(() => {
    const handleHeartbeatUpdate = (event) => {
      const { activeMinutes } = event.detail;
      if (activeMinutes !== undefined) {
        setTodayLog((prev) =>
          prev ? { ...prev, activeMinutes: Number(activeMinutes) } : prev,
        );
      }
    };

    window.addEventListener("heartbeat_tick", handleHeartbeatUpdate);
    return () =>
      window.removeEventListener("heartbeat_tick", handleHeartbeatUpdate);
  }, []);

  const handleAction = async (action) => {
    // if (action === "clock-out") {
    //   setShowConfirmModal(true);
    //   return;
    // }

    setLoading(true);
    try {
      const res = await api.post(`/attendance/${action}`);
      showSuccess(
        res.message ||
          (action === "clock-in"
            ? "Punched in successfully!"
            : "Punched out successfully!"),
      );
      await fetchTodayStatus();
      if (action === "clock-out") {
        setTimeout(() => {
          window.open(
            "https://proman.olive.in/",
            "_blank",
            "noopener,noreferrer",
          );
        }, 5000);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "in-progress":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      case "present":
        return "bg-emerald-100 text-emerald-800 border border-emerald-200";
      case "short-leave":
        return "bg-indigo-100 text-indigo-800 border border-indigo-200";
      case "half-day":
        return "bg-amber-100 text-amber-800 border border-amber-200";
      case "absent":
        return "bg-rose-100 text-rose-800 border border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  const formatStatusText = (status) => {
    if (status === "in-progress") return "In Progress";
    if (status === "present") return "Full Day (9+ hrs)";
    if (status === "short-leave") return "Short Leave (7-9 hrs)";
    if (status === "half-day") return "Half Day (5-7 hrs)";
    if (status === "absent") return "Absent (< 5 hrs)";
    return status;
  };

  // Calculates true elapsed duration from clockIn time while in-progress
  const formatActiveTime = () => {
    if (!todayLog || !todayLog.clockIn) return "--:--";

    if (todayLog.status === "in-progress") {
      const startTime = new Date(todayLog.clockIn).getTime();
      const diffMs = Math.max(0, currentTime - startTime);
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return `${hours}h ${mins}m`;
    }

    if (todayLog.totalHours !== undefined && todayLog.totalHours !== null) {
      return `${todayLog.totalHours} hrs`;
    }

    return "--";
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">Daily Punch</h2>
        </div>
        {todayLog?.status && (
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium tracking-wide ${getStatusBadge(
              todayLog.status,
            )}`}
          >
            {formatStatusText(todayLog.status)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 text-sm">
        <div className="p-3 bg-slate-50 rounded-lg">
          <span className="text-xs text-slate-500 block">Clock In</span>
          <span className="font-medium text-slate-800">
            {todayLog?.clockIn
              ? new Date(todayLog.clockIn).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--:--"}
          </span>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg">
          <span className="text-xs text-slate-500 block">Clock Out</span>
          <span className="font-medium text-slate-800">
            {todayLog?.clockOut
              ? new Date(todayLog.clockOut).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--:--"}
          </span>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg">
          <span className="text-xs text-slate-500 block">Active Time</span>
          <span className="font-medium text-slate-800">
            {formatActiveTime()}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("clock-in")}
          disabled={loading || !!todayLog}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-lg text-sm transition"
        >
          Punch In
        </button>
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={loading || !todayLog || !!todayLog?.clockOut}
          className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-lg text-sm transition"
        >
          Punch Out
        </button>
      </div>
      <ConfirmModal
        isOpen={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={() => {
          setShowConfirmModal(false);
          handleAction("clock-out");
        }}
      />
    </div>
  );
}
