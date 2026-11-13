import { User } from "../models/User.js";
import { Attendance } from "../models/Attendance.js";
import { Leave } from "../models/Leave.js";
import { OutdoorDuty } from "../models/OutdoorDuty.js";
import Holiday from "../models/Holiday.js";
import { PLANS } from "../config/plans.js";
import { getEffectiveEmployeeLimit } from "../utils/tenantLimits.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const dayMilliseconds = 24 * 60 * 60 * 1000;
const presentStatuses = ["in-progress", "present", "half-day", "short-leave"];

const dateString = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
const dateOffset = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const countFrom = (result) => result[0]?.count || 0;
const valuesByStatus = (rows) =>
  new Map(rows.map(({ _id, userIds }) => [_id, userIds || []]));
const asIdSet = (ids) => new Set(ids.map(String));

const pendingRequestPipeline = (tenantId, projection) => [
  { $match: { tenantId, status: "pending" } },
  {
    $facet: {
      count: [{ $count: "count" }],
      items: [
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: User.collection.name,
            let: { applicantId: "$userId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$_id", "$$applicantId"] },
                      { $eq: ["$tenantId", tenantId] },
                    ],
                  },
                },
              },
              { $project: { _id: 1, name: 1, employeeId: 1 } },
            ],
            as: "applicant",
          },
        },
        { $unwind: { path: "$applicant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            userId: 1,
            employeeName: "$applicant.name",
            employeeId: "$applicant.employeeId",
            createdAt: 1,
            ...projection,
          },
        },
      ],
    },
  },
];

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const now = new Date();
  const today = dateString(now);
  const firstTrendDate = dateString(dateOffset(now, -6));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStartDate = dateString(monthStart);
  const nextMonthDate = dateString(nextMonthStart);
  const probationStartDate = dateString(dateOffset(now, -90));
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  const tenant = req.tenant;
  if (!tenant) throw new ApiError(404, "Tenant not found");
  const employeeResult = await User.aggregate([
    { $match: { tenantId, role: { $ne: "admin" } } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalEmployees: { $sum: 1 },
              activeEmployees: {
                $sum: { $cond: [{ $ne: ["$isActive", false] }, 1, 0] },
              },
              inactiveEmployees: {
                $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] },
              },
            },
          },
        ],
        activeUsers: [
          { $match: { isActive: { $ne: false } } },
          { $group: { _id: null, userIds: { $addToSet: "$_id" } } },
        ],
        departments: [
          {
            $group: {
              _id: {
                $let: {
                  vars: {
                    department: {
                      $trim: { input: { $ifNull: ["$department", ""] } },
                    },
                  },
                  in: {
                    $cond: [
                      { $eq: ["$$department", ""] },
                      "Unassigned",
                      "$$department",
                    ],
                  },
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, _id: 1 } },
        ],
        joinersThisMonth: [
          {
            $match: {
              isActive: { $ne: false },
              joinDate: { $gte: monthStartDate, $lt: nextMonthDate },
            },
          },
          { $count: "count" },
        ],
        onProbation: [
          {
            $match: {
              isActive: { $ne: false },
              joinDate: { $gte: probationStartDate, $lte: today },
            },
          },
          { $count: "count" },
        ],
      },
    },
  ]);

  const employeeData = employeeResult[0] || {};
  const summary = employeeData.summary?.[0] || {
    totalEmployees: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
  };
  const activeUserIds = employeeData.activeUsers?.[0]?.userIds || [];
  const activeUserSet = asIdSet(activeUserIds);
  const lastSevenDates = Array.from({ length: 7 }, (_, index) =>
    dateString(dateOffset(now, index - 6)),
  );

  const [
    attendanceResult,
    leaveTodayResult,
    pendingLeaveResult,
    approvedLeavesResult,
    outdoorTodayResult,
    pendingOutdoorResult,
    holidays,
  ] = await Promise.all([
    Attendance.aggregate([
      {
        $match: {
          tenantId,
          date: { $gte: firstTrendDate, $lte: today },
          userId: { $in: activeUserIds },
        },
      },
      {
        $facet: {
          today: [
            { $match: { date: today } },
            { $group: { _id: "$status", userIds: { $addToSet: "$userId" } } },
          ],
          trend: [
            {
              $group: {
                _id: { date: "$date", status: "$status" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
    Leave.aggregate([
      {
        $match: {
          tenantId,
          status: "approved",
          startDate: { $lte: todayEnd },
          endDate: { $gte: todayStart },
          userId: { $in: activeUserIds },
        },
      },
      { $group: { _id: null, userIds: { $addToSet: "$userId" } } },
    ]),
    Leave.aggregate(
      pendingRequestPipeline(tenantId, {
        leaveType: 1,
        startDate: 1,
        endDate: 1,
        daysCount: 1,
      }),
    ),
    Leave.aggregate([
      {
        $match: {
          tenantId,
          status: "approved",
          updatedAt: { $gte: monthStart, $lt: nextMonthStart },
        },
      },
      { $count: "count" },
    ]),
    OutdoorDuty.aggregate([
      {
        $match: {
          tenantId,
          status: "approved",
          date: today,
          userId: { $in: activeUserIds },
        },
      },
      { $group: { _id: null, userIds: { $addToSet: "$userId" } } },
    ]),
    OutdoorDuty.aggregate(
      pendingRequestPipeline(tenantId, {
        date: 1,
        startTime: 1,
        endTime: 1,
        location: 1,
        reason: 1,
      }),
    ),
    Holiday.aggregate([
      { $match: { tenantId, date: { $gte: today } } },
      { $sort: { date: 1 } },
      { $limit: 5 },
      { $project: { _id: 1, date: 1, title: 1, description: 1 } },
    ]),
  ]);

  const attendanceData = attendanceResult[0] || { today: [], trend: [] };
  const statusUsers = valuesByStatus(attendanceData.today || []);
  const presentUsers = new Set(
    presentStatuses.flatMap((status) =>
      (statusUsers.get(status) || []).map(String),
    ),
  );
  const absentUsers = new Set(
    (statusUsers.get("absent") || []).map(String),
  );
  const leaveUsers = new Set(
    (leaveTodayResult[0]?.userIds || []).map(String),
  );
  const outdoorUsers = new Set(
    (outdoorTodayResult[0]?.userIds || []).map(String),
  );
  const onLeave = [...leaveUsers].filter((id) => activeUserSet.has(id));
  const onLeaveSet = new Set(onLeave);
  const onOutdoorDuty = [...outdoorUsers].filter(
    (id) => activeUserSet.has(id) && !onLeaveSet.has(id),
  );
  const onOutdoorSet = new Set(onOutdoorDuty);
  const present = [...presentUsers].filter(
    (id) =>
      activeUserSet.has(id) && !onLeaveSet.has(id) && !onOutdoorSet.has(id),
  );
  const absent = [...absentUsers].filter(
    (id) =>
      activeUserSet.has(id) && !onLeaveSet.has(id) && !onOutdoorSet.has(id),
  );
  const accountedFor = new Set([
    ...onLeave,
    ...onOutdoorDuty,
    ...present,
    ...absent,
  ]);

  const trendByDate = new Map(
    lastSevenDates.map((date) => [date, { date, present: 0, absent: 0 }]),
  );
  for (const { _id, count } of attendanceData.trend || []) {
    const day = trendByDate.get(_id.date);
    if (!day) continue;
    if (_id.status === "absent") day.absent += count;
    else day.present += count;
  }

  const trialDaysLeft =
    tenant.status === "trial" && tenant.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(tenant.trialEndsAt).getTime() - now.getTime()) /
              dayMilliseconds,
          ),
        )
      : null;
  const plan = PLANS[tenant.plan];

  return ApiResponse.send(
    res,
    200,
    {
      ...summary,
      today: {
        present: present.length,
        absent: absent.length,
        onLeave: onLeave.length,
        onOutdoorDuty: onOutdoorDuty.length,
        notPunchedInYet: Math.max(0, activeUserSet.size - accountedFor.size),
      },
      pendingApprovals: {
        leaveRequests: {
          count: countFrom(pendingLeaveResult[0]?.count || []),
          items: pendingLeaveResult[0]?.items || [],
        },
        outdoorDutyRequests: {
          count: countFrom(pendingOutdoorResult[0]?.count || []),
          items: pendingOutdoorResult[0]?.items || [],
        },
      },
      upcomingOfficialHolidays: holidays,
      leavesApprovedThisMonth: countFrom(approvedLeavesResult),
      attendanceTrend: [...trendByDate.values()],
      departmentWiseEmployeeCount: employeeData.departments || [],
      employeesOnProbation: countFrom(employeeData.onProbation || []),
      newJoinersThisMonth: countFrom(employeeData.joinersThisMonth || []),
      planInfo: {
        plan: tenant.plan,
        planName: plan.label,
        employeesUsed: summary.activeEmployees,
        employeeLimit: getEffectiveEmployeeLimit(tenant),
        trialDaysLeft,
        subscriptionStatus:
          tenant.status === "trial"
            ? "trial"
            : tenant.status === "suspended"
              ? "suspended"
              : tenant.billing?.status || "inactive",
      },
    },
    "Admin dashboard retrieved",
  );
});
