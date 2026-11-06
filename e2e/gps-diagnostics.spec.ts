import { test, expect, type Page } from "@playwright/test";
test.use({ serviceWorkers: "block" });
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const requests: any[] = [];
    const watches: any[] = [];
    const writes: string[] = [];
    (window as any).diagnosticProbe = { requests, watches, writes };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      writes.push("storage-write");
      return setItem.call(this, key, value);
    };
    for (const method of ["add", "put", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[method];
      (IDBObjectStore.prototype as any)[method] = function (...args: any[]) {
        writes.push("record-write");
        return (original as Function).apply(this, args);
      };
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copiedGPSDiagnostic = text;
        },
      },
    });
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition(
          success: PositionCallback,
          error: PositionErrorCallback,
          options: PositionOptions,
        ) {
          watches.push({ success, error, options });
          if (watches.length === 1)
            setTimeout(
              () =>
                success({
                  coords: {
                    latitude: 12.3456789,
                    longitude: 67.8901234,
                    accuracy: 35,
                  },
                  timestamp: Date.now(),
                  userRecord: "SECRET_RECORD_DATA",
                } as unknown as GeolocationPosition),
              0,
            );
          return watches.length;
        },
        getCurrentPosition(
          success: PositionCallback,
          error: PositionErrorCallback,
          options: PositionOptions,
        ) {
          requests.push({ success, error, options });
        },
      },
    });
  });
}
for (const url of ["/", "/?gps_debug=0", "/?gps_debug=01"]) {
  test(`diagnostics are absent and normal GPS behavior is unchanged at ${url}`, async ({
    page,
  }) => {
    await installProbe(page);
    await page.goto(url);
    await expect(page.getByText("● GPS FIX")).toBeVisible();
    expect(
      await page.evaluate(() => Object.hasOwn(window, "MQSIO_GPS_DEBUG")),
    ).toBe(false);
    await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
    await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
    expect(
      await page.evaluate(
        () => (window as any).diagnosticProbe.requests.length,
      ),
    ).toBe(1);
    await page.evaluate(() =>
      (window as any).diagnosticProbe.requests[0].success({
        coords: { latitude: 12.3456789, longitude: 67.8901234, accuracy: 35 },
        timestamp: Date.now(),
      }),
    );
    await expect(page.getByText("● GPS FIX")).toBeVisible();
    expect(
      await page.evaluate(() => (window as any).diagnosticProbe.watches.length),
    ).toBe(2);
    expect(
      await page.evaluate(() => (window as any).diagnosticProbe.writes),
    ).toEqual([]);
    expect(
      await page.evaluate(() => Object.hasOwn(window, "MQSIO_GPS_DEBUG")),
    ).toBe(false);
  });
}

test("opt-in diagnostics capture decisions and timeout flags without coordinates, records, persistence or transmission", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await installProbe(page);
  const external: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1")
      external.push(url.origin);
  });
  await page.goto("/?gps_debug=1");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  await page.clock.fastForward(21000);
  await expect(
    page.getByText("GPS timed out.", { exact: false }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).diagnosticProbe.requests[0].success({
      coords: { latitude: 12.3456789, longitude: 67.8901234, accuracy: 35 },
      timestamp: Date.now(),
    }),
  );
  await expect(page.getByText("● GPS FIX")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  await page.evaluate(() =>
    (window as any).diagnosticProbe.watches[0].success({
      coords: { latitude: 12.3456789, longitude: 67.8901234, accuracy: 35 },
      timestamp: Date.now(),
    }),
  );
  await page.evaluate(() =>
    (window as any).diagnosticProbe.requests[1].success({
      coords: { latitude: 12.3456789, longitude: 67.8901234, accuracy: 35 },
      timestamp: Date.now(),
    }),
  );
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.evaluate(() =>
    (window as any).diagnosticProbe.watches.at(-1).error({
      code: 2,
      message: "SECRET_RECORD_DATA latitude=12.3456789 longitude=67.8901234",
    }),
  );
  await expect(
    page.getByText("Your device cannot determine a position right now.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const text = await page.evaluate(() => window.MQSIO_GPS_DEBUG!.text());
  const log = JSON.parse(text);
  expect(log.info.baselineCommit).toBe("4291621");
  expect(log.info.moduleAsset).toMatch(/\.js$/);
  expect(log.info).toHaveProperty("buildCommit");
  for (const event of [
    "request_start",
    "success_callback",
    "error_callback",
    "local_timeout",
    "callback_decision",
    "state_transition",
    "visibility_change",
  ])
    expect(log.events.some((e: any) => e.event === event)).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.event === "request_start" &&
        e.source === "getCurrentPosition" &&
        e.maximumAge === 0 &&
        e.timeout === 20000 &&
        e.pending === true &&
        e.settled === false,
    ),
  ).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.event === "request_start" &&
        e.source === "watchPosition" &&
        e.maximumAge === 10000,
    ),
  ).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.event === "local_timeout" &&
        e.pending === true &&
        e.settled === false,
    ),
  ).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.reason === "already_settled" &&
        e.settled === true &&
        e.pending === false,
    ),
  ).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.reason === "generation_changed" &&
        e.attemptGeneration !== e.generation,
    ),
  ).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.reason === "accepted" && e.accuracyMeters === 35 && e.ageMs >= 0,
    ),
  ).toBe(true);
  expect(log.events.some((e: any) => e.errorCode === 2)).toBe(true);
  expect(
    log.events.some(
      (e: any) => e.fromStatus === "ready" && e.status === "unavailable",
    ),
  ).toBe(true);
  for (const entry of log.events) {
    expect(typeof entry.at).toBe("number");
    expect(typeof entry.generation).toBe("number");
    expect(typeof entry.pending).toBe("boolean");
    expect(entry).toHaveProperty("settled");
    expect(entry.visibility).toMatch(/visible|hidden/);
  }
  for (const value of [
    "12.3456789",
    "67.8901234",
    "latitude",
    "longitude",
    "UTM",
    "SECRET_RECORD_DATA",
  ])
    expect(text).not.toContain(value);
  await page.evaluate(() => window.MQSIO_GPS_DEBUG!.copy());
  expect(await page.evaluate(() => (window as any).copiedGPSDiagnostic)).toBe(
    text,
  );
  expect(
    await page.evaluate(() => (window as any).diagnosticProbe.writes),
  ).toEqual([]);
  expect(external).toEqual([]);
  await page.evaluate(() => window.MQSIO_GPS_DEBUG!.clear());
  expect(
    JSON.parse(await page.evaluate(() => window.MQSIO_GPS_DEBUG!.text()))
      .events,
  ).toEqual([]);
});

test("diagnostics are bounded in memory and stop collecting when the opt-in flag is removed", async ({
  page,
}) => {
  await installProbe(page);
  await page.goto("/?gps_debug=1");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.evaluate(() => {
    for (let i = 0; i < 2100; i++)
      document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = JSON.parse(
    await page.evaluate(() => window.MQSIO_GPS_DEBUG!.text()),
  );
  expect(before.events).toHaveLength(1000);
  expect(before.droppedEvents).toBeGreaterThan(1100);
  await page.evaluate(() => {
    history.replaceState(null, "", location.pathname);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  expect(
    JSON.parse(await page.evaluate(() => window.MQSIO_GPS_DEBUG!.text())),
  ).toEqual(before);
  expect(
    await page.evaluate(() => (window as any).diagnosticProbe.requests.length),
  ).toBe(1);
});

test("a cached success is logged as accepted data but stale visible state without changing recovery", async ({
  page,
}) => {
  await page.clock.install();
  await installProbe(page);
  await page.goto("/?gps_debug=1");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  const initial = await page.evaluate(
    () =>
      JSON.parse(window.MQSIO_GPS_DEBUG!.text()).events.find(
        (e: any) => e.reason === "accepted",
      ).positionTimestamp,
  );
  await page.clock.fastForward(65000);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).diagnosticProbe.requests.length),
    )
    .toBe(1);
  await page.evaluate(
    (timestamp) =>
      (window as any).diagnosticProbe.requests[0].success({
        coords: { latitude: 12.3456789, longitude: 67.8901234, accuracy: 35 },
        timestamp,
      }),
    initial,
  );
  await expect(
    page.getByText("The last GPS fix is over a minute old.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("● GPS FIX")).toHaveCount(0);
  const log = JSON.parse(
    await page.evaluate(() => window.MQSIO_GPS_DEBUG!.text()),
  );
  expect(
    log.events.some(
      (e: any) =>
        e.reason === "accepted" &&
        e.source === "getCurrentPosition" &&
        e.ageMs >= 60000,
    ),
  ).toBe(true);
  expect(
    log.events.some(
      (e: any) =>
        e.event === "state_transition" &&
        e.stateStatus === "ready" &&
        e.status === "stale" &&
        e.hasError &&
        typeof e.stateNow === "number",
    ),
  ).toBe(true);
  await page.clock.fastForward(120000);
  expect(
    await page.evaluate(() => (window as any).diagnosticProbe.requests.length),
  ).toBe(1);
});
