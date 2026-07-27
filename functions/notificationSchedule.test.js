const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getLocalParts,
  isUserActiveNow,
  isUserActiveNowBySchedules,
} = require("./notificationSchedule");

const at = (isoTimestamp) => Date.parse(isoTimestamp);
const slot = (startMinutes, endMinutes, part = "full") => ({
  startMinutes,
  endMinutes,
  part,
});

test("weekly active window enables sound only inside [start, end)", () => {
  const schedule = {
    weekly: {
      d0: [slot(8 * 60, 22 * 60)],
    },
  };

  // 2026-01-05 is Monday; Europe/Kyiv is UTC+2 in January.
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T05:59:00Z"), "Europe/Kyiv"),
    false
  );
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T06:00:00Z"), "Europe/Kyiv"),
    true
  );
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T19:59:00Z"), "Europe/Kyiv"),
    true
  );
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T20:00:00Z"), "Europe/Kyiv"),
    false
  );
});

test("overnight split remains active across Sunday to Monday", () => {
  const schedule = {
    weekly: {
      d6: [slot(22 * 60, 24 * 60, "head")],
      d0: [slot(0, 7 * 60, "tail")],
    },
  };

  assert.equal(
    isUserActiveNow(schedule, at("2026-01-04T20:00:00Z"), "Europe/Kyiv"),
    true
  );
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T04:59:00Z"), "Europe/Kyiv"),
    true
  );
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T05:00:00Z"), "Europe/Kyiv"),
    false
  );
});

test("midnight is represented as hour 0, never minute 1440", () => {
  const parts = getLocalParts(
    at("2026-01-05T22:30:00Z"),
    "Europe/Kyiv"
  );
  assert.equal(parts.hour, 0);
  assert.equal(parts.minute, 30);

  const schedule = {
    weekly: {
      d1: [slot(0, 60)],
    },
  };
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-05T22:30:00Z"), "Europe/Kyiv"),
    true
  );
});

test("timezone conversion remains correct across Kyiv DST changes", () => {
  const schedule = {
    weekly: {
      d6: [slot(4 * 60, 5 * 60)],
    },
  };

  // After the spring jump this instant is 04:30 in Kyiv.
  assert.equal(
    isUserActiveNow(schedule, at("2026-03-29T01:30:00Z"), "Europe/Kyiv"),
    true
  );

  // After the autumn rollback this instant is also 04:30 in Kyiv.
  assert.equal(
    isUserActiveNow(schedule, at("2026-10-25T02:30:00Z"), "Europe/Kyiv"),
    true
  );
});

test("versioned rolling dates stay on the same calendar date in every timezone", () => {
  const anchorAt = 1767484800; // 2026-01-04T00:00:00Z
  const schedule = {
    rollingWeeks: {
      anchorAt,
      anchorDate: "2026-01-04",
      version: 2,
      weeks: {
        w0: {
          days: {
            d2: [slot(12 * 60, 13 * 60)],
          },
        },
      },
    },
  };

  // The stable anchor date is Jan 4, so d2 is Jan 6 everywhere.
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-06T12:30:00Z"), "UTC"),
    true
  );
  assert.equal(
    isUserActiveNow(schedule, at("2026-01-06T10:30:00Z"), "Europe/Kyiv"),
    true
  );

  assert.equal(
    isUserActiveNow(
      schedule,
      at("2026-01-06T17:30:00Z"),
      "America/New_York"
    ),
    true
  );
});

test("legacy rolling keys keep the dates selected by the old editor", () => {
  const anchorAt = 1767484800;

  // Old Kyiv editor stored Jan 4 as diff -1 because the epoch was 02:00 local.
  const kyivSchedule = {
    rollingWeeks: {
      anchorAt,
      weeks: {
        "w-1": {
          days: {
            d6: [slot(12 * 60, 13 * 60)],
          },
        },
      },
    },
  };
  assert.equal(
    isUserActiveNow(
      kyivSchedule,
      at("2026-01-04T10:30:00Z"),
      "Europe/Kyiv"
    ),
    true
  );

  // Old New York editor stored Jan 4 as diff 0.
  const newYorkSchedule = {
    rollingWeeks: {
      anchorAt,
      weeks: {
        w0: {
          days: {
            d0: [slot(12 * 60, 13 * 60)],
          },
        },
      },
    },
  };
  assert.equal(
    isUserActiveNow(
      newYorkSchedule,
      at("2026-01-04T17:30:00Z"),
      "America/New_York"
    ),
    true
  );
});

test("several schedules form a union of active windows", () => {
  const morning = { weekly: { d0: [slot(8 * 60, 9 * 60)] } };
  const evening = { weekly: { d0: [slot(18 * 60, 19 * 60)] } };

  assert.equal(
    isUserActiveNowBySchedules(
      [morning, evening],
      at("2026-01-05T16:30:00Z"),
      "Europe/Kyiv"
    ),
    true
  );
  assert.equal(
    isUserActiveNowBySchedules(
      [morning, evening],
      at("2026-01-05T10:00:00Z"),
      "Europe/Kyiv"
    ),
    false
  );
});

test("missing schedules allow sound, but invalid schedule inputs fail closed", () => {
  assert.equal(
    isUserActiveNowBySchedules([], at("2026-01-05T10:00:00Z"), ""),
    true
  );
  assert.equal(
    isUserActiveNow(
      { unexpected: true },
      at("2026-01-05T10:00:00Z"),
      "Europe/Kyiv"
    ),
    false
  );
  assert.throws(
    () =>
      isUserActiveNow(
        { weekly: { d0: [slot(0, 60)] } },
        at("2026-01-05T10:00:00Z"),
        ""
      ),
    /time zone/i
  );
  assert.throws(
    () =>
      isUserActiveNow(
        { weekly: { d0: [slot(0, 60)] } },
        at("2026-01-05T10:00:00Z"),
        "Invalid/Time_Zone"
      ),
    RangeError
  );
});
