import assert from "node:assert/strict";
import { test } from "node:test";
import { Attendance } from "../src/models/Attendance.js";
import { Leave } from "../src/models/Leave.js";
import { OutdoorDuty } from "../src/models/OutdoorDuty.js";
import Holiday from "../src/models/Holiday.js";
import { User } from "../src/models/User.js";
import { runWithTenantQueryBypass } from "../src/plugins/tenantQueryGuard.js";

const tenantModels = [User, Attendance, Leave, OutdoorDuty, Holiday];

test("unscoped find, update, delete, aggregate, and bulkWrite operations are rejected", async () => {
  for (const model of tenantModels) {
    await assert.rejects(model.find({}).exec(), /requires a concrete tenantId/);
    await assert.rejects(
      model.findOne({ _id: "target" }).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.countDocuments({}).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.updateOne({ _id: "target" }, { $set: { name: "changed" } }).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.updateMany({}, { $set: { name: "changed" } }).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.findOneAndUpdate(
        { _id: "target" },
        { $set: { name: "changed" } },
      ).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.findOneAndDelete({ _id: "target" }).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.deleteMany({ _id: "target" }).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.deleteOne({ _id: "target" }).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.aggregate([{ $match: { _id: "target" } }]).exec(),
      /requires a concrete tenantId/,
    );
    await assert.rejects(
      model.bulkWrite([
        { deleteOne: { filter: { _id: "target" } } },
      ]),
      /requires a concrete tenantId/,
    );
  }
});

test("tenantId is required for new documents in each tenant-owned model", async () => {
  for (const model of tenantModels) {
    const error = await new model()
      .validate()
      .catch((validationError) => validationError);
    assert.ok(error.errors.tenantId, `${model.modelName} requires tenantId`);
  }
});

test("tenant ownership cannot be changed through update queries", async () => {
  await assert.rejects(
    User.updateOne(
      { tenantId: "tenant-a", _id: "target" },
      { $set: { tenantId: "tenant-b" } },
    ).exec(),
    /cannot change tenantId/,
  );
});

test("cross-tenant options require the trusted Super Admin context", async (t) => {
  await assert.rejects(
    User.countDocuments({})
      .setOptions({ allowCrossTenant: true })
      .exec(),
    /requires a concrete tenantId/,
  );
  await assert.rejects(
    User.aggregate([{ $match: {} }])
      .option({ allowCrossTenant: true })
      .exec(),
    /requires a concrete tenantId/,
  );
  await assert.rejects(
    runWithTenantQueryBypass("super-admin", async () =>
      User.countDocuments({}).exec(),
    ),
    /requires a concrete tenantId/,
  );
  await assert.rejects(
    runWithTenantQueryBypass("super-admin", async () =>
      User.countDocuments({})
        .setOptions({ allowCrossTenant: true })
        .exec(),
    ),
    /requires a concrete tenantId/,
  );
  await assert.rejects(
    runWithTenantQueryBypass("super-admin", async () =>
      User.deleteMany({})
        .setOptions({ allowCrossTenant: true })
        .exec(),
    ),
    /requires a concrete tenantId/,
  );
  await assert.rejects(
    runWithTenantQueryBypass("super-admin", async () =>
      User.aggregate([
        { $match: { tenantId: { $in: ["0123456789abcdef01234567"] } } },
        { $out: "users" },
      ])
        .option({ allowCrossTenant: true })
        .exec(),
    ),
    /requires a concrete tenantId/,
  );

  const countDocuments = t.mock.method(
    User.collection,
    "countDocuments",
    async () => 4,
  );
  const aggregate = t.mock.method(User.collection, "aggregate", () => ({
    toArray: async () => [{ _id: "tenant-a", count: 4 }],
  }));
  const result = await runWithTenantQueryBypass("super-admin", async () =>
    await User.countDocuments({
      tenantId: { $in: ["0123456789abcdef01234567"] },
    })
      .setOptions({ allowCrossTenant: true })
      .exec(),
  );
  const aggregateResult = await runWithTenantQueryBypass(
    "super-admin",
    async () =>
      await User.aggregate([{ $match: { tenantId: { $in: [] } } }])
        .option({ allowCrossTenant: true })
        .exec(),
  );

  assert.equal(result, 4);
  assert.equal(countDocuments.mock.callCount(), 1);
  assert.deepEqual(aggregateResult, [{ _id: "tenant-a", count: 4 }]);
  assert.equal(aggregate.mock.callCount(), 1);
});

test("tenant query bypasses require an explicit trusted reason", () => {
  assert.throws(
    () => runWithTenantQueryBypass("request", () => {}),
    /trusted migration or super-admin context/,
  );
});
