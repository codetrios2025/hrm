import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { ToastProvider } from "./context/ToastContext.jsx";
import Root from "./Root.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <ToastProvider>
    <Root />
  </ToastProvider>,
);
