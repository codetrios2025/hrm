import React, { useState, useEffect } from "react";
import {
  Clock,
  X,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Image,
  Code,
} from "lucide-react";
import axios from "axios";
import api from "../api/client";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "./ConfirmModal";

export default function AttendanceCard() {
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { showSuccess, showError } = useToast();

  // employee email used across hrm and proman
  const employeeEmail = "hitesh@oliveglobal.com";
  const PROMAN_BASE_URL = "https://proman.olive.in/api/tasks";

  // time log modal states
  const [showTimeLogModal, setShowTimeLogModal] = useState(false);
  const [promanTasks, setPromanTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submittingTime, setSubmittingTime] = useState(false);

  const [timeFormData, setTimeFormData] = useState({
    taskId: "",
    projectId: "",
    taskTitle: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:30",
    endTime: "18:30",
    totalHours: 0,
    totalMinutes: 0,
    billable: true,
    description: "",
  });

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

  // update timer every 30 seconds so active time reflects true clock time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // listen to global heartbeat updates dispatched from HeartbeatManager
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

  // fetch tasks from proman when punch out flow begins
  const fetchPromanTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await axios.get(
        `${PROMAN_BASE_URL}/external/tasks?email=${employeeEmail}`,
      );
      if (res.data?.success && res.data?.data) {
        // show non-completed tasks
        const activeTasks = res.data.data.filter(
          (t) => t.status !== "Completed",
        );
        setPromanTasks(activeTasks);
        if (activeTasks.length > 0) {
          setTimeFormData((prev) => ({
            ...prev,
            taskId: activeTasks[0]._id,
            projectId: activeTasks[0].projectId,
            taskTitle: activeTasks[0].title,
          }));
        }
      }
    } catch (err) {
      console.error("error fetching proman tasks", err);
      showError("could not fetch proman tasks for time logging");
    } finally {
      setLoadingTasks(false);
    }
  };

  // step 1: click punch out triggers time log modal first
  const handlePunchOutClick = async () => {
    await fetchPromanTasks();
    setShowTimeLogModal(true);
  };

  // calculate hours & minutes spent
  const calculateHoursSpent = (start, end) => {
    if (!start || !end) return;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);

    let diffMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;

    const hrs = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;

    setTimeFormData((prev) => ({
      ...prev,
      startTime: start,
      endTime: end,
      totalHours: hrs,
      totalMinutes: mins,
    }));
  };

  // step 2: submit time log to proman, then show confirm modal
  const handleLogTimeSubmit = async (e) => {
    e.preventDefault();

    if (!timeFormData.taskId) {
      showError("please select a task to log time");
      return;
    }

    if (
      Number(timeFormData.totalHours) === 0 &&
      Number(timeFormData.totalMinutes) === 0
    ) {
      showError("please enter hours or minutes spent on the task");
      return;
    }

    setSubmittingTime(true);
    try {
      const payload = {
        email: employeeEmail,
        taskId: timeFormData.taskId,
        projectId: timeFormData.projectId,
        date: timeFormData.date,
        startTime: timeFormData.startTime,
        endTime: timeFormData.endTime,
        totalHours: Number(timeFormData.totalHours),
        totalMinutes: Number(timeFormData.totalMinutes),
        billable: timeFormData.billable,
        description: timeFormData.description || "work logged on punch out",
      };

      const res = await axios.post(
        `${PROMAN_BASE_URL}/external/timelog`,
        payload,
      );

      if (res.data?.success) {
        showSuccess("task time logged in proman successfully");
        setShowTimeLogModal(false);
        // step 3: proceed to punch out confirmation modal
        setShowConfirmModal(true);
      }
    } catch (err) {
      console.error("time log error", err);
      showError(
        err.response?.data?.message || "failed to record task time log",
      );
    } finally {
      setSubmittingTime(false);
    }
  };

  // step 4: final punch out action
  const handleAction = async (action) => {
    setLoading(true);
    try {
      const res = await api.post(`/attendance/${action}`);
      showSuccess(
        res.message ||
          (action === "clock-in"
            ? "punched in successfully"
            : "punched out successfully"),
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
    if (status === "in-progress") return "in progress";
    if (status === "present") return "full day (9+ hrs)";
    if (status === "short-leave") return "short leave (7-9 hrs)";
    if (status === "half-day") return "half day (5-7 hrs)";
    if (status === "absent") return "absent (< 5 hrs)";
    return status;
  };

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
          onClick={handlePunchOutClick}
          disabled={loading || !todayLog || !!todayLog?.clockOut}
          className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-lg text-sm transition"
        >
          Punch Out
        </button>
      </div>

      {/* mandatory task time log modal before clock out */}
      {showTimeLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-[#4e4bf3]" />

            <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Task Time Log
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fill your task time log before punch out
                </p>
              </div>
              <button
                onClick={() => setShowTimeLogModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogTimeSubmit} className="p-7 space-y-5">
              {/* select task from proman */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Task Name
                </label>
                {loadingTasks ? (
                  <div className="text-xs text-slate-400 py-2">
                    loading assigned tasks...
                  </div>
                ) : (
                  <select
                    value={timeFormData.taskId}
                    onChange={(e) => {
                      const selected = promanTasks.find(
                        (t) => t._id === e.target.value,
                      );
                      if (selected) {
                        setTimeFormData((prev) => ({
                          ...prev,
                          taskId: selected._id,
                          projectId: selected.projectId,
                          taskTitle: selected.title,
                        }));
                      }
                    }}
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  >
                    {promanTasks.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.projectName} - {t.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* date */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={timeFormData.date}
                  onChange={(e) =>
                    setTimeFormData({ ...timeFormData, date: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3] transition"
                />
              </div>

              {/* start time, end time, hrs, mins */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={timeFormData.startTime}
                    onChange={(e) =>
                      calculateHoursSpent(e.target.value, timeFormData.endTime)
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={timeFormData.endTime}
                    onChange={(e) =>
                      calculateHoursSpent(
                        timeFormData.startTime,
                        e.target.value,
                      )
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Hrs Spent
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={timeFormData.totalHours}
                    onChange={(e) =>
                      setTimeFormData({
                        ...timeFormData,
                        totalHours: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Mins Spent
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={timeFormData.totalMinutes}
                    onChange={(e) =>
                      setTimeFormData({
                        ...timeFormData,
                        totalMinutes: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>
              </div>

              {/* billable checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="billable-punchout"
                  checked={timeFormData.billable}
                  onChange={(e) =>
                    setTimeFormData({
                      ...timeFormData,
                      billable: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-[#4e4bf3] rounded border-slate-300 focus:ring-[#4e4bf3] cursor-pointer"
                />
                <label
                  htmlFor="billable-punchout"
                  className="text-xs font-semibold text-slate-700 cursor-pointer select-none"
                >
                  make as billable
                </label>
              </div>

              {/* description toolbar & textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Description
                </label>
                <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#4e4bf3]/20 focus-within:border-[#4e4bf3] transition">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/75 text-slate-600">
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-px h-4 bg-slate-300 mx-1" />
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-px h-4 bg-slate-300 mx-1" />
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <Image className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-slate-200/60 rounded"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="describe work completed today..."
                    value={timeFormData.description}
                    onChange={(e) =>
                      setTimeFormData({
                        ...timeFormData,
                        description: e.target.value,
                      })
                    }
                    className="w-full p-4 text-sm focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* action buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTimeLogModal(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submittingTime}
                  className="px-6 py-2.5 bg-[#4e4bf3] hover:bg-[#3d39db] text-white text-sm font-semibold rounded-xl shadow-md transition disabled:opacity-50 active:scale-95"
                >
                  {submittingTime ? "saving time log..." : "log time & proceed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* final punch out confirm modal */}
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
