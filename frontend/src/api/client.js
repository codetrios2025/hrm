import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",

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

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    /*
     * IMPORTANT
     * -----------------------------------------------
     * If request body is FormData, NEVER set:
     *
     * Content-Type: application/json
     *
     * Axios/browser must create the multipart boundary.
     */

    if (config.data instanceof FormData) {
      // Remove any previously configured JSON header
      if (config.headers) {
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    } else {
      // Normal API requests can use JSON
      config.headers = config.headers || {};

      if (!config.headers["Content-Type"]) {
        config.headers["Content-Type"] = "application/json";
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => response.data,

  (error) => {
    const message =
      error.response?.data?.message || error.message || "Request failed";

    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.reload();
      }
    }

    return Promise.reject(new Error(message));
  },
);

export default api;
