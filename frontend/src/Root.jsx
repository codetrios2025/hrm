import { useCallback, useEffect, useState } from "react";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import SuperAdminApp from "./super-admin/SuperAdminApp.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import VerifyTenantRequestPage from "./pages/VerifyTenantRequestPage.jsx";

export default function Root() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const updatePath = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  const navigate = useCallback((path, replace = false) => {
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (pathname.startsWith("/super-admin")) {
    return <SuperAdminApp pathname={pathname} navigate={navigate} />;
  }
  if (pathname === "/signup") return <SignupPage navigate={navigate} />;
  if (pathname === "/signup-request/verify") {
    return <VerifyTenantRequestPage navigate={navigate} />;
  }
  if (pathname === "/verify-email") {
    return <VerifyEmailPage navigate={navigate} />;
  }

  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
