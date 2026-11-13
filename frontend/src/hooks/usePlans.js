import { useEffect, useState } from "react";
import api from "../api/client";

export default function usePlans(client = api) {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState("");

  useEffect(() => {
    let active = true;
    client
      .get("/public/plans")
      .then((response) => {
        if (active) setPlans(response.data.plans);
      })
      .catch((error) => {
        if (active) setPlansError(error.message);
      })
      .finally(() => {
        if (active) setLoadingPlans(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  return { plans, loadingPlans, plansError };
}
