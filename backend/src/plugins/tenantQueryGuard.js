import { AsyncLocalStorage } from "node:async_hooks";

const bypassStorage = new AsyncLocalStorage();
const crossTenantReadOperations = new Set([
  "countDocuments",
  "distinct",
  "find",
  "findOne",
]);

const hasTenantId = (value) =>
  (typeof value === "string" && value.length > 0) ||
  (value != null && value._bsontype === "ObjectId");

const requireTenantFilter = (filter, operation) => {
  if (!hasTenantId(filter?.tenantId)) {
    throw new Error(
      `${operation} requires a concrete tenantId filter on this model`,
    );
  }
};

const tenantIdsMatch = (left, right) =>
  hasTenantId(left) &&
  hasTenantId(right) &&
  String(left) === String(right);

const rejectTenantMutation = (update, operation, tenantId) => {
  if (!update || typeof update !== "object") return;
  const tenantAssignments = [
    update.tenantId,
    update.$set?.tenantId,
    update.$setOnInsert?.tenantId,
  ];
  if (
    tenantAssignments.some(
      (value) => value !== undefined && !tenantIdsMatch(value, tenantId),
    ) ||
    update.$unset?.tenantId !== undefined
  ) {
    throw new Error(`${operation} cannot change tenantId`);
  }
};

export const runWithTenantQueryBypass = (reason, callback) => {
  if (!["migration", "super-admin"].includes(reason)) {
    throw new TypeError("A trusted migration or super-admin context is required");
  }
  return bypassStorage.run(reason, callback);
};

const isMigrationContext = () => bypassStorage.getStore() === "migration";

const hasTenantIdSet = (filter) =>
  Array.isArray(filter?.tenantId?.$in) &&
  filter.tenantId.$in.every(hasTenantId);

const isExplicitSuperAdminOptOut = (options, filter) =>
  bypassStorage.getStore() === "super-admin" &&
  options?.allowCrossTenant === true &&
  hasTenantIdSet(filter);

export const tenantQueryGuard = (schema) => {
  const queryOperations = [
    "countDocuments",
    "deleteMany",
    "deleteOne",
    "distinct",
    "estimatedDocumentCount",
    "find",
    "findOne",
    "findOneAndDelete",
    "findOneAndReplace",
    "findOneAndUpdate",
    "replaceOne",
    "updateMany",
    "updateOne",
  ];

  schema.pre(queryOperations, function () {
    if (isMigrationContext()) return;
    const filter = this.getFilter();
    if (
      crossTenantReadOperations.has(this.op) &&
      isExplicitSuperAdminOptOut(this.getOptions(), filter)
    ) {
      return;
    }
    requireTenantFilter(filter, this.op);
    rejectTenantMutation(this.getUpdate(), this.op, filter.tenantId);
  });

  schema.pre("aggregate", function () {
    if (isMigrationContext()) return;
    const pipeline = this.pipeline() || [];
    const firstMatch = pipeline[0]?.$match;
    const hasWriteStage = pipeline.some(
      (stage) => stage.$out !== undefined || stage.$merge !== undefined,
    );
    if (
      !hasWriteStage &&
      isExplicitSuperAdminOptOut(this.options, firstMatch)
    ) {
      return;
    }
    requireTenantFilter(firstMatch, "aggregate");
  });

  schema.pre("bulkWrite", function (operations) {
    if (isMigrationContext()) return;
    for (const operation of operations || []) {
      const [name, details] = Object.entries(operation)[0] || [];
      if (name === "insertOne") {
        if (!hasTenantId(details?.document?.tenantId)) {
          throw new Error("bulkWrite insertOne requires a tenantId");
        }
        continue;
      }
      const filter = details?.filter;
      requireTenantFilter(filter, `bulkWrite ${name}`);
      rejectTenantMutation(
        details?.update || details?.replacement,
        `bulkWrite ${name}`,
        filter.tenantId,
      );
    }
  });
};
