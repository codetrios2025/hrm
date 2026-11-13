import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import logoImg from "../assets/logo.png";

const initialProfile = {
  website: "",
  phone: "",
  address: "",
  city: "",
  country: "India",
};

const initialPolicy = {
  casual: 12,
  sick: 8,
  paid: 15,
  oh: 2,
  coff: 0,
  maternity: 0,
  paternity: 0,
  bereavement: 0,
  lwp: 0,
};

const leaveLabels = {
  casual: "Casual leave",
  sick: "Sick leave",
  paid: "Paid leave",
  oh: "Optional holidays",
  coff: "Compensatory off",
  maternity: "Maternity leave",
  paternity: "Paternity leave",
  bereavement: "Bereavement leave",
  lwp: "Leave without pay",
};

const steps = [
  "Company profile",
  "Official holidays",
  "Leave policy",
  "Employees",
  "Finish",
];

export default function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
  const { showError, showSuccess } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [profile, setProfile] = useState(initialProfile);
  const [leavePolicy, setLeavePolicy] = useState(initialPolicy);
  const [employee, setEmployee] = useState({
    employeeId: "",
    name: "",
    email: "",
  });
  const [csvFile, setCsvFile] = useState(null);
  const [usage, setUsage] = useState(null);

  const loadUsage = async () => {
    const response = await api.get("/admin/usage");
    setUsage(response.data);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/onboarding"),
      api.get("/admin/usage").catch((error) => {
        if (active) setUsageError(error.message);
        return null;
      }),
    ])
      .then(([onboardingResponse, usageResponse]) => {
        if (!active) return;
        const tenant = onboardingResponse.data;
        setCompanyName(tenant.name || "");
        setProfile({ ...initialProfile, ...tenant.companyProfile });
        setLeavePolicy({ ...initialPolicy, ...tenant.leavePolicy });
        setStep(tenant.onboarding?.step || 1);
        if (usageResponse) setUsage(usageResponse.data);
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveStep = async (nextStep, data = {}) => {
    await api.patch("/onboarding", { ...data, step: nextStep });
    setStep(nextStep);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveStep(2, { name: companyName, companyProfile: profile });
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const addHolidayTemplate = async () => {
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const response = await api.get(`/holidays?year=${year}&all=true`);
      const existing = new Set(
        (response.data?.holidays || []).map((holiday) => holiday.date),
      );
      const holidays = [
        { date: `${year}-01-26`, title: "Republic Day" },
        { date: `${year}-08-15`, title: "Independence Day" },
        { date: `${year}-10-02`, title: "Gandhi Jayanti" },
      ].filter((holiday) => !existing.has(holiday.date));
      for (const holiday of holidays) {
        await api.post("/holidays", { ...holiday, description: "" });
      }
      await saveStep(3);
      showSuccess(
        holidays.length
          ? "Indian national holidays added."
          : "These national holidays are already in your calendar.",
      );
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveLeavePolicy = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveStep(4, { leavePolicy });
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const createEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/create-staff", {
        ...employee,
        role: "employee",
      });
      setEmployee({ employeeId: "", name: "", email: "" });
      showSuccess("Employee added. Their login credentials were emailed.");
      try {
        await loadUsage();
        setUsageError("");
      } catch (error) {
        setUsageError(error.message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const importEmployees = async (event) => {
    event.preventDefault();
    if (!csvFile) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      await api.post("/admin/bulk-import", formData);
      setCsvFile(null);
      event.target.reset();
      showSuccess("Employee CSV imported successfully.");
      try {
        await loadUsage();
        setUsageError("");
      } catch (error) {
        setUsageError(error.message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await api.patch("/onboarding", { completed: true });
      await refreshUser();
      showSuccess("Your workspace is ready.");
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = async () => {
    const previousStep = Math.max(1, step - 1);
    setSaving(true);
    try {
      await saveStep(previousStep);
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const goToLeavePolicy = async () => {
    setSaving(true);
    try {
      await saveStep(3);
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const goToFinish = async () => {
    setSaving(true);
    try {
      await saveStep(5);
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading workspace setup…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <img src={logoImg} alt="oliveHRM" className="h-9 w-auto" />
            <span className="text-right text-xs text-slate-500">
              Signed in as {user.name}
            </span>
          </div>
          {loadError && (
            <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              Workspace setup could not be loaded: {loadError}
            </div>
          )}
          {!user.emailVerified && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Please verify your email address using the link we sent you. You can continue setup while you wait.
            </div>
          )}
          <h1 className="mt-5 text-xl font-bold text-slate-900">
            Set up {companyName || "your company"}
          </h1>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {steps.map((label, index) => {
              const number = index + 1;
              return (
                <div key={label} className="min-w-0">
                  <div
                    className={`mb-2 h-1.5 rounded-full ${
                      number <= step ? "bg-indigo-600" : "bg-slate-200"
                    }`}
                  />
                  <span className="hidden text-[11px] text-slate-500 sm:block">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <section className="min-h-[360px] px-5 py-6 sm:px-8">
          {step === 1 && (
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Company profile</h2>
                <p className="mt-1 text-sm text-slate-500">Add the basic details for your workspace.</p>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Company name
                <input
                  required
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["website", "Website"],
                  ["phone", "Phone"],
                  ["city", "City"],
                  ["country", "Country"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-medium text-slate-700">
                    {label}
                    <input
                      type={field === "website" ? "url" : "text"}
                      value={profile[field]}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                    />
                  </label>
                ))}
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Address
                <textarea
                  rows={2}
                  value={profile.address}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </label>
              <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                Save and continue
              </button>
            </form>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Official holidays</h2>
              <p className="mt-1 text-sm text-slate-500">
                Add an Indian national holiday template to this company’s private calendar.
              </p>
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <ul className="space-y-2 text-sm text-slate-700">
                  <li>January 26 · Republic Day</li>
                  <li>August 15 · Independence Day</li>
                  <li>October 2 · Gandhi Jayanti</li>
                </ul>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  disabled={saving}
                  onClick={addHolidayTemplate}
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Add template and continue
                </button>
                <button
                  disabled={saving}
                  onClick={goToLeavePolicy}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={saveLeavePolicy}>
              <h2 className="text-lg font-semibold text-slate-900">Leave policy defaults</h2>
              <p className="mt-1 text-sm text-slate-500">These defaults are used for newly added employees.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Object.entries(leaveLabels).map(([field, label]) => (
                  <label key={field} className="text-sm font-medium text-slate-700">
                    {label}
                    <input
                      type="number"
                      min="0"
                      max="365"
                      required
                      value={leavePolicy[field]}
                      onChange={(event) =>
                        setLeavePolicy((current) => ({
                          ...current,
                          [field]: Number(event.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                    />
                  </label>
                ))}
              </div>
              <button disabled={saving} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                Save and continue
              </button>
            </form>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add employees</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add people now or import a CSV later from the HR Admin panel.
                </p>
                {usage && (
                  <p className="mt-2 text-xs font-medium text-indigo-700">
                    {usage.employeeCount} of {usage.effectiveEmployeeLimit} employee seats used
                  </p>
                )}
                {usageError && (
                  <p role="alert" className="mt-2 text-xs text-rose-700">
                    Employee usage could not be loaded: {usageError}
                  </p>
                )}
              </div>
              <form onSubmit={createEmployee} className="grid gap-3 sm:grid-cols-3">
                {[
                  ["employeeId", "Employee ID"],
                  ["name", "Full name"],
                  ["email", "Work email"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-medium text-slate-700">
                    {label}
                    <input
                      required
                      type={field === "email" ? "email" : "text"}
                      value={employee[field]}
                      onChange={(event) =>
                        setEmployee((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                    />
                  </label>
                ))}
                <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3">
                  Add employee
                </button>
              </form>
              <form onSubmit={importEmployees} className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm font-medium text-slate-700">
                  Import employee CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                    className="mt-2 block w-full text-sm text-slate-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || !csvFile}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Import CSV
                </button>
              </form>
              <button
                disabled={saving}
                onClick={goToFinish}
                className="text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50"
              >
                Continue without adding employees
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
              <h2 className="text-xl font-bold text-slate-900">You’re all set</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Your company workspace is ready. You can update these settings or invite more employees at any time.
              </p>
              <button
                disabled={saving}
                onClick={finish}
                className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Finish setup
              </button>
            </div>
          )}

          {step > 1 && step < 5 && (
            <div className="mt-8 flex justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={goBack}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
