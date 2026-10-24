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
  Loader2,
  Search,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "./ConfirmModal";

export default function AttendanceCard() {
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { showSuccess, showError } = useToast();

  // Dynamically get logged-in user's email from localStorage/auth
  const getStoredUserEmail = () => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user.email || user.user?.email || "";
    } catch {
      return "";
    }
  };

  const [employeeEmail, setEmployeeEmail] = useState(getStoredUserEmail());

  // time log modal states
  const [showTimeLogModal, setShowTimeLogModal] = useState(false);
  const [promanTasks, setPromanTasks] = useState([]);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submittingTime, setSubmittingTime] = useState(false);

  const [timeFormData, setTimeFormData] = useState({
    taskId: "",
    projectId: "",
    taskTitle: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:30",
    endTime: "18:30",
    totalHours: 9,
    totalMinutes: 0,
    billable: true,
    description: "",
  });

  const fetchTodayStatus = async () => {
    try {
      const res = await api.get("/attendance/today");
      const log = res.data?.data !== undefined ? res.data.data : res.data;
      setTodayLog(log);

      // If user email isn't in state yet, grab from /me or attendance log if available
      if (!employeeEmail && log?.user?.email) {
        setEmployeeEmail(log.user.email);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // If email was not in localStorage, fetch from auth profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!employeeEmail) {
        try {
          const res = await api.get("/auth/me");
          const user = res.data?.data || res.data?.user || res.data;
          if (user?.email) {
            setEmployeeEmail(user.email);
          }
        } catch (e) {
          console.warn("Could not fetch user profile automatically:", e);
        }
      }
    };
    fetchUserProfile();
    fetchTodayStatus();
  }, []);

  // update timer every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // listen to global heartbeat
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

  // fetch tasks via hrm backend proxy
  const fetchPromanTasks = async () => {
    setLoadingTasks(true);
    setTaskSearchQuery("");
    try {
      // Use the actual logged-in employee email and all=true
      const activeEmail = employeeEmail || getStoredUserEmail();
      const res = await api.get(
        `/proman/tasks?email=${encodeURIComponent(activeEmail)}&all=true`,
      );
      const taskList =
        res?.data?.data || res?.data || (Array.isArray(res) ? res : []);

      if (Array.isArray(taskList)) {
        // filter out Completed tasks for punch-out
        const activeTasks = taskList.filter((t) => t.status !== "Completed");
        setPromanTasks(activeTasks);

        if (activeTasks.length > 0) {
          const defaultStart = "09:30";
          const defaultEnd = "18:30";
          const [startH, startM] = defaultStart.split(":").map(Number);
          const [endH, endM] = defaultEnd.split(":").map(Number);
          let diffMinutes = endH * 60 + endM - (startH * 60 + startM);
          if (diffMinutes < 0) diffMinutes += 24 * 60;

          setTimeFormData((prev) => ({
            ...prev,
            taskId: activeTasks[0]._id,
            projectId: activeTasks[0].projectId,
            taskTitle: activeTasks[0].title,
            date: new Date().toISOString().split("T")[0],
            startTime: defaultStart,
            endTime: defaultEnd,
            totalHours: Math.floor(diffMinutes / 60),
            totalMinutes: diffMinutes % 60,
            billable: true,
            description: "",
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

  const handlePunchOutClick = async () => {
    await fetchPromanTasks();
    setShowTimeLogModal(true);
  };

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

  const handleLogTimeSubmit = async (e) => {
    e.preventDefault();

    if (!timeFormData.taskId) {
      showError("please select a task to log time");
      return;
    }

    let finalHours = Number(timeFormData.totalHours || 0);
    let finalMinutes = Number(timeFormData.totalMinutes || 0);

    if (
      finalHours === 0 &&
      finalMinutes === 0 &&
      timeFormData.startTime &&
      timeFormData.endTime
    ) {
      const [startH, startM] = timeFormData.startTime.split(":").map(Number);
      const [endH, endM] = timeFormData.endTime.split(":").map(Number);
      let diff = endH * 60 + endM - (startH * 60 + startM);
      if (diff < 0) diff += 24 * 60;
      finalHours = Math.floor(diff / 60);
      finalMinutes = diff % 60;
    }

    if (finalHours === 0 && finalMinutes === 0) {
      showError("please enter hours or minutes spent on the task");
      return;
    }

    setSubmittingTime(true);
    try {
      const payload = {
        email: employeeEmail || getStoredUserEmail(),
        taskId: timeFormData.taskId,
        projectId: timeFormData.projectId,
        date: timeFormData.date,
        startTime: timeFormData.startTime,
        endTime: timeFormData.endTime,
        totalHours: finalHours,
        totalMinutes: finalMinutes,
        billable: timeFormData.billable,
        description: timeFormData.description || "work logged on punch out",
      };

      const res = await api.post("/proman/timelog", payload);
      const isSuccess = res?.success || res?.data?.success;

      if (isSuccess) {
        showSuccess("task time logged in proman successfully");
        setShowTimeLogModal(false);
        setShowConfirmModal(true);
      } else {
        showError(res?.message || "failed to record task time log");
      }
    } catch (err) {
      console.error("time log error", err);
      showError(
        err.response?.data?.message ||
          err.message ||
          "failed to record task time log",
      );
    } finally {
      setSubmittingTime(false);
    }
  };

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

  // Filter tasks in dropdown by search query
  const filteredPromanTasks = promanTasks.filter((t) => {
    const q = taskSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (t.title || "").toLowerCase().includes(q) ||
      (t.projectName || "").toLowerCase().includes(q)
    );
  });

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
          <span className="text-xs text-slate-500 block">Clock in</span>
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
          <span className="text-xs text-slate-500 block">Clock out</span>
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
          <span className="text-xs text-slate-500 block">Active time</span>
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
          Punch in
        </button>
        <button
          onClick={handlePunchOutClick}
          disabled={loading || !todayLog || !!todayLog?.clockOut}
          className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-lg text-sm transition"
        >
          Punch out
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
                  Fill your task time log before punch out ({promanTasks.length}{" "}
                  tasks available)
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
              {/* Select Task with Quick Search */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Task Name
                  </label>
                  {promanTasks.length > 5 && (
                    <span className="text-[11px] text-slate-400">
                      {filteredPromanTasks.length} of {promanTasks.length}{" "}
                      listed
                    </span>
                  )}
                </div>

                {loadingTasks ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[#4e4bf3]" />
                    <span>Loading assigned tasks from Proman...</span>
                  </div>
                ) : promanTasks.length === 0 ? (
                  <div className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-xl p-3">
                    No active tasks assigned to you in Proman.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Quick search input to easily pick from 200+ tasks */}
                    {promanTasks.length > 5 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter task list..."
                          value={taskSearchQuery}
                          onChange={(e) => setTaskSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4e4bf3]"
                        />
                      </div>
                    )}

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
                      size={filteredPromanTasks.length > 8 ? 6 : 1}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                    >
                      {filteredPromanTasks.map((t) => (
                        <option key={t._id} value={t._id} className="py-1">
                          [{t.projectName}] {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
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

              {/* time row */}
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
                    Hours Spent
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
                    Minutes Spent
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
                  Make as Billable
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
                    placeholder="Describe work completed today..."
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
                  disabled={
                    submittingTime || loadingTasks || promanTasks.length === 0
                  }
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
