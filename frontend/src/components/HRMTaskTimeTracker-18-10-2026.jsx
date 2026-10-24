import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Clock,
  Briefcase,
  X,
  CheckCircle,
  AlertCircle,
  Plus,
  Search,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Image,
  Code,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

const getStatusBadgeStyle = (status) => {
  switch (status) {
    case "In Progress":
      return "bg-blue-50 text-blue-700 border-blue-200/70 focus:ring-blue-400";
    case "Review":
      return "bg-purple-50 text-purple-700 border-purple-200/70 focus:ring-purple-400";
    case "Completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200/70 focus:ring-emerald-400";
    case "Todo":
    default:
      return "bg-amber-50 text-amber-700 border-amber-200/70 focus:ring-amber-400";
  }
};

const TaskTimeTracker = ({
  loggedInEmployeeEmail = "hitesh@oliveglobal.com",
}) => {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingTasks, setFetchingTasks] = useState(false);
  const [statusAlert, setStatusAlert] = useState({ type: "", text: "" });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const PROMAN_BASE_URL = "https://proman.olive.in/api/tasks";
  const PROMAN_API_KEY = "olive_shared_secret_token_987654321_xyz";

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    startTime: "09:30",
    endTime: "18:30",
    totalHours: 0,
    totalMinutes: 0,
    billable: true,
    description: "",
  });

  const fetchTasks = async () => {
    setFetchingTasks(true);
    try {
      const res = await axios.get(
        `${PROMAN_BASE_URL}/external/tasks?email=${loggedInEmployeeEmail}`,
        {
          headers: {
            "x-hrm-key": PROMAN_API_KEY,
          },
        },
      );
      if (res.data.success) {
        setTasks(res.data.data);
        setFilteredTasks(res.data.data);
      }
    } catch (err) {
      console.error("error fetching tasks:", err);
      setStatusAlert({
        type: "error",
        text: err.response?.data?.message || "failed to load tasks from proman",
      });
      setTimeout(() => setStatusAlert({ type: "", text: "" }), 4000);
    } finally {
      setFetchingTasks(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [loggedInEmployeeEmail]);

  useEffect(() => {
    const filtered = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.projectName.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    setFilteredTasks(filtered);
    setCurrentPage(1);
  }, [searchQuery, tasks]);

  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTasks = filteredTasks.slice(indexOfFirstItem, indexOfLastItem);

  const handleOpenModal = (task) => {
    setSelectedTask(task);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      startTime: "09:30",
      endTime: "18:30",
      totalHours: 0,
      totalMinutes: 0,
      billable: true,
      description: "",
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const calculateHoursSpent = (start, end) => {
    if (!start || !end) return;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);

    let diffMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;

    const hrs = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;

    setFormData((prev) => ({
      ...prev,
      startTime: start,
      endTime: end,
      totalHours: hrs,
      totalMinutes: mins,
    }));
  };

  const handleSubmitTimeLog = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;
    setLoading(true);

    try {
      const payload = {
        email: loggedInEmployeeEmail,
        taskId: selectedTask._id,
        projectId: selectedTask.projectId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        totalHours: Number(formData.totalHours),
        totalMinutes: Number(formData.totalMinutes),
        billable: formData.billable,
        description: formData.description,
      };

      const res = await axios.post(
        `${PROMAN_BASE_URL}/external/timelog`,
        payload,
        {
          headers: {
            "x-hrm-key": PROMAN_API_KEY,
          },
        },
      );

      if (res.data.success) {
        setStatusAlert({
          type: "success",
          text: `timelog added successfully for: ${selectedTask.title}`,
        });
        handleCloseModal();
        fetchTasks();
        setTimeout(() => setStatusAlert({ type: "", text: "" }), 4000);
      }
    } catch (err) {
      console.error(err);
      setStatusAlert({
        type: "error",
        text:
          err.response?.data?.message || "failed to record time log in proman",
      });
      setTimeout(() => setStatusAlert({ type: "", text: "" }), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const res = await axios.patch(
        `${PROMAN_BASE_URL}/external/task/${taskId}/status`,
        { status: newStatus },
        {
          headers: {
            "x-hrm-key": PROMAN_API_KEY,
          },
        },
      );

      if (res.data.success) {
        setTasks((prev) =>
          prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t)),
        );
        setStatusAlert({
          type: "success",
          text: "task status updated successfully",
        });
        setTimeout(() => setStatusAlert({ type: "", text: "" }), 3000);
      }
    } catch (err) {
      console.error("failed to update status", err);
      setStatusAlert({
        type: "error",
        text: err.response?.data?.message || "failed to update task status",
      });
      setTimeout(() => setStatusAlert({ type: "", text: "" }), 3000);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans text-slate-800">
      {/* alert notification */}
      {statusAlert.text && (
        <div
          className={`mb-6 flex items-center gap-3 p-4 rounded-xl border text-sm font-medium shadow-sm transition-all ${
            statusAlert.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {statusAlert.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          )}
          <span>{statusAlert.text}</span>
        </div>
      )}

      {/* header card */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-slate-200/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              My Assigned Tasks
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track and submit your daily working hours directly to proman
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="search tasks or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3] transition"
            />
          </div>
        </div>
      </div>

      {/* listing table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto min-h-[320px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6">project</th>
                <th className="py-4 px-6">task title</th>
                <th className="py-4 px-6">status</th>
                <th className="py-4 px-6">priority</th>
                <th className="py-4 px-6 text-center">time logged</th>
                <th className="py-4 px-6 text-right">action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {fetchingTasks ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 text-[#4e4bf3] animate-spin" />
                      <p className="text-sm font-medium text-slate-600">
                        fetching tasks from olive proman...
                      </p>
                      <span className="text-xs text-slate-400">
                        please wait a moment
                      </span>
                    </div>
                  </td>
                </tr>
              ) : currentTasks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    no tasks found
                  </td>
                </tr>
              ) : (
                currentTasks.map((task) => (
                  <tr
                    key={task._id}
                    className="hover:bg-slate-50/60 transition duration-150"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <Briefcase className="w-4 h-4 text-[#4e4bf3] flex-shrink-0" />
                        <span>{task.projectName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-semibold text-slate-800">
                        {task.title}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="relative inline-block">
                        <select
                          value={task.status || "Todo"}
                          onChange={(e) =>
                            handleStatusChange(task._id, e.target.value)
                          }
                          className={`text-xs font-semibold rounded-full px-3 py-1 border cursor-pointer appearance-none pr-6 focus:outline-none focus:ring-2 transition ${getStatusBadgeStyle(
                            task.status,
                          )}`}
                        >
                          <option value="Todo">Todo</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Review">Review</option>
                          <option value="Completed">Completed</option>
                        </select>
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[9px] opacity-70">
                          ▼
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        {task.priority || "normal"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-[#4e4bf3]">
                        <Clock className="w-3.5 h-3.5" />
                        {task.loggedHours || 0} hrs
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleOpenModal(task)}
                        disabled={task.status === "Completed"}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition ${
                          task.status === "Completed"
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                            : "bg-[#4e4bf3] hover:bg-[#3d39db] text-white shadow-sm active:scale-95"
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Log Time
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* pagination footer */}
        {!fetchingTasks && (
          <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs font-medium text-slate-500">
              Showing {filteredTasks.length === 0 ? 0 : indexOfFirstItem + 1} to{" "}
              {Math.min(indexOfLastItem, filteredTasks.length)} of{" "}
              {filteredTasks.length} tasks
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (number) => (
                  <button
                    key={number}
                    onClick={() => setCurrentPage(number)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                      currentPage === number
                        ? "bg-[#4e4bf3] text-white shadow-sm"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {number}
                  </button>
                ),
              )}

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* modal */}
      {isModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-[#4e4bf3]" />

            <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">
                Task time log
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTimeLog} className="p-7 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Task name
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedTask.title}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3] transition"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Start time
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) =>
                      calculateHoursSpent(e.target.value, formData.endTime)
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    End time
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) =>
                      calculateHoursSpent(formData.startTime, e.target.value)
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Hrs spent
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.totalHours}
                    onChange={(e) =>
                      setFormData({ ...formData, totalHours: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Mins spent
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={formData.totalMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, totalMinutes: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4e4bf3]/20 focus:border-[#4e4bf3]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="billable"
                  checked={formData.billable}
                  onChange={(e) =>
                    setFormData({ ...formData, billable: e.target.checked })
                  }
                  className="w-4 h-4 text-[#4e4bf3] rounded border-slate-300 focus:ring-[#4e4bf3] cursor-pointer"
                />
                <label
                  htmlFor="billable"
                  className="text-xs font-semibold text-slate-700 cursor-pointer select-none"
                >
                  Make as billable
                </label>
              </div>

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
                    placeholder="Describe work progress..."
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full p-4 text-sm focus:outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-[#4e4bf3] hover:bg-[#3d39db] text-white text-sm font-semibold rounded-xl shadow-md transition disabled:opacity-50 active:scale-95"
                >
                  {loading ? "Logging..." : "Log Time"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskTimeTracker;
