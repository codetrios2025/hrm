import { AsyncLocalStorage } from "async_hooks";

const tenantStorage = new AsyncLocalStorage();

export const runWithTenant = (tenantId, callback) => {
  if (tenantId == null || tenantId === "") {
    throw new TypeError("tenantId is required");
  }

  return tenantStorage.run(Object.freeze({ tenantId }), callback);
};

export const getTenantId = () => tenantStorage.getStore()?.tenantId;

export const getTenantContext = () => tenantStorage.getStore();
