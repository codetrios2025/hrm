import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,

  // IMPORTANT:
  // Do NOT set Content-Type globally.
  // Axios will automatically use:
  //
  // application/json
  //
  // for normal objects, and:
  //
  // multipart/form-data; boundary=...
  //
  // for FormData.
});

const attachInterceptors = (client, tokenKey, onUnauthorized) => {
  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem(tokenKey);

      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }

      if (typeof FormData !== "undefined" && config.data instanceof FormData) {
        if (config.headers) {
          delete config.headers["Content-Type"];
          delete config.headers["content-type"];
        }
      } else {
        config.headers = config.headers || {};
        if (!config.headers["Content-Type"]) {
          config.headers["Content-Type"] = "application/json";
        }
      }

      return config;
    },
    (error) => Promise.reject(error),
  );

  client.interceptors.response.use(
    (response) => response.data,
    (error) => {
      const message =
        error.response?.data?.message || error.message || "Request failed";

      if (error.response?.status === 401) {
        onUnauthorized();
      }

      const apiError = new Error(message);
      apiError.code = error.response?.data?.code;
      return Promise.reject(apiError);
    },
  );
};

attachInterceptors(api, "token", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (window.location.pathname !== "/login") {
    window.location.reload();
  }
});

export const superAdminApi = axios.create({
  baseURL: API_BASE_URL,
});

attachInterceptors(superAdminApi, "superAdminToken", () => {
  localStorage.removeItem("superAdminToken");
  localStorage.removeItem("superAdmin");
  window.dispatchEvent(new Event("super-admin-unauthorized"));
  if (window.location.pathname !== "/super-admin/login") {
    window.history.replaceState(null, "", "/super-admin/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
});

export default api;
