import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Mail,
  MessageSquareText,
  Phone,
  UserRound,
  UsersRound,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../context/ToastContext";
import logoImg from "../assets/logo.png";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function SignupPage({ navigate }) {
  const { showError } = useToast();
  const [form, setForm] = useState({
    companyName: "",
    slug: "",
    contactName: "",
    email: "",
    phone: "",
    employeeCountEstimate: "",
    message: "",
    website: "",
  });
  const [slugAvailability, setSlugAvailability] = useState({
    slug: "",
    status: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittedMode, setSubmittedMode] = useState(null);
  const slug = form.slug.trim().toLowerCase();
  const slugStatus = !slug
    ? "idle"
    : !slugPattern.test(slug)
      ? "invalid"
      : slugAvailability.slug === slug
        ? slugAvailability.status
        : "checking";

  useEffect(() => {
    if (!slug || !slugPattern.test(slug)) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      api
        .get("/public/slug-available", { params: { slug } })
        .then((response) => {
          if (active) {
            setSlugAvailability({
              slug,
              status: response.data?.available
                ? "available"
                : response.data?.reason === "taken"
                  ? "taken"
                  : "invalid",
            });
          }
        })
        .catch(() => {
          if (active) setSlugAvailability({ slug, status: "error" });
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [slug]);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (slugStatus !== "available") {
      showError("Choose an available company code before continuing.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post("/public/signup-request", {
        ...form,
        slug,
        email: form.email.trim().toLowerCase(),
        employeeCountEstimate: Number(form.employeeCountEstimate),
      });
      setSubmittedMode(response.data.mode);
    } catch (error) {
      showError(error.message || "Unable to submit your request");
    } finally {
      setSubmitting(false);
    }
  };

  const slugMessage = {
    checking: "Checking availability…",
    available: "Company code is available",
    taken: "This company code is already in use or under review",
    invalid: "Use lowercase letters, numbers, and hyphens; reserved codes are unavailable",
    error: "Could not check availability",
  }[slugStatus];

  if (submittedMode) {
    const approvalMode = submittedMode === "approval";
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <img src={logoImg} alt="oliveHRM" className="mx-auto mb-7 h-10 w-auto" />
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#748443]" />
          <h1 className="text-2xl font-bold text-slate-900">
            {approvalMode
              ? "Request received, we will contact you"
              : "Check your email"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {approvalMode
              ? "We sent an email verification link. Verify your email to submit your request for review. We will contact you when it has been reviewed."
              : "We sent an email verification link. Verify your address to finish setting up your workspace. Your administrator credentials will be emailed after verification."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-7 rounded-lg bg-[#64723b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#53612f]"
          >
            Back to sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-7 text-center">
          <img src={logoImg} alt="oliveHRM" className="mx-auto mb-4 h-10 w-auto" />
          <h1 className="text-2xl font-bold text-slate-900">
            Request a company workspace
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Tell us about your organization. We’ll email you a link to verify your address.
          </p>
        </div>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Company name
            <span className="relative mt-1 block">
              <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                required
                minLength={2}
                maxLength={100}
                value={form.companyName}
                onChange={update("companyName")}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              />
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Company code
            <input
              required
              maxLength={63}
              autoComplete="off"
              value={form.slug}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  slug: event.target.value.toLowerCase(),
                }));
                setSlugAvailability({ slug: "", status: "idle" });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              placeholder="your-company"
            />
            <span
              aria-live="polite"
              className={`mt-1 block text-xs ${
                slugStatus === "available"
                  ? "text-emerald-700"
                  : ["invalid", "taken", "error"].includes(slugStatus)
                    ? "text-rose-600"
                    : "text-slate-500"
              }`}
            >
              {slugMessage ||
                "Only a-z, 0-9, and hyphens. Reserved codes are unavailable."}
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact name
            <span className="relative mt-1 block">
              <UserRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                required
                minLength={2}
                maxLength={60}
                autoComplete="name"
                value={form.contactName}
                onChange={update("contactName")}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              />
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Work email
            <span className="relative mt-1 block">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={form.email}
                onChange={update("email")}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              />
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Phone
            <span className="relative mt-1 block">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                required
                type="tel"
                minLength={5}
                maxLength={30}
                autoComplete="tel"
                value={form.phone}
                onChange={update("phone")}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              />
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Estimated employee count
            <span className="relative mt-1 block">
              <UsersRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                required
                type="number"
                min={1}
                max={100000}
                step={1}
                value={form.employeeCountEstimate}
                onChange={update("employeeCountEstimate")}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              />
            </span>
          </label>

          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Message <span className="font-normal text-slate-400">(optional)</span>
            <span className="relative mt-1 block">
              <MessageSquareText className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <textarea
                maxLength={1000}
                rows={4}
                value={form.message}
                onChange={update("message")}
                className="w-full resize-y rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-[#64723b] focus:ring-2 focus:ring-[#64723b]/10"
              />
            </span>
          </label>

          <label
            aria-hidden="true"
            className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
          >
            Leave this field empty
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={update("website")}
            />
          </label>

          <button
            type="submit"
            disabled={submitting || slugStatus !== "available"}
            className="mt-2 rounded-lg bg-[#64723b] px-4 py-3 font-semibold text-white transition hover:bg-[#53612f] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {submitting ? "Sending request…" : "Submit workspace request"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already have a workspace?{" "}
          <a href="/" className="font-semibold text-[#64723b] hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
