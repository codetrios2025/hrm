import { useEffect, useRef } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function HeartbeatManager() {
  const { user } = useAuth();
  const timerRef = useRef(null);
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const ping = async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      try {
        const res = await api.post("/attendance/heartbeat");
        const activeMinutes =
          res.data?.data?.activeMinutes !== undefined
            ? res.data.data.activeMinutes
            : res.data?.activeMinutes;

        if (activeMinutes !== undefined) {
          window.dispatchEvent(
            new CustomEvent("heartbeat_tick", {
              detail: { activeMinutes: Number(activeMinutes) },
            }),
          );
        }
      } catch (err) {
        console.error("[Heartbeat Error]", err.message);
      } finally {
        isRunningRef.current = false;
      }
    };

    // NEVER call ping() here!
    // Start interval so the first call happens ONLY after 60 seconds
    timerRef.current = setInterval(ping, 60 * 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [user]);

  return null;
}
