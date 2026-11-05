import { test, expect, type Page } from "@playwright/test";
// Network-failure injection must reach the page rather than an existing SW cache.
test.use({ serviceWorkers: "block" });
async function started(page: Page) {
  await expect(page.locator(".launch-screen")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Field camera", exact: true }),
  ).toBeVisible();
}
async function seed(page: Page) {
  await page.goto("/");
  await started(page);
  await page.evaluate(async () => {
    localStorage.setItem(
      "geocamera-settings",
      JSON.stringify({
        project: "Preserved Site",
        stage: "07",
        asset: "FENCE-42",
      }),
    );
    localStorage.setItem(
      "geocamera-inspection-settings",
      JSON.stringify({ preparedBy: "Saved Inspector", jobTitle: "Engineer" }),
    );
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("geocamera", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("records", "readwrite");
      for (const kind of ["photo", "video"])
        tx.objectStore("records").put({
          id: kind,
          kind,
          createdAt: "2026-11-05T09:00:00Z",
          day: "2026-11-05",
          project: "Preserved Site",
          stage: "07",
          asset: "FENCE-42",
          location: { latitude: 24.7136, longitude: 46.6753, accuracy: 4 },
          mime: kind === "photo" ? "image/jpeg" : "video/mp4",
          blob: new Blob([`${kind}-original-bytes`]),
        });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
}
async function assertPreserved(page: Page) {
  const saved = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("geocamera");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const r = database.transaction("records").objectStore("records").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const result = {
      version: database.version,
      rows: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          bytes: await r.blob.text(),
          stage: r.stage,
        })),
      ),
      project: JSON.parse(localStorage.getItem("geocamera-settings")!),
      preparer: JSON.parse(
        localStorage.getItem("geocamera-inspection-settings")!,
      ),
    };
    database.close();
    return result;
  });
  expect(saved.version).toBe(1);
  expect(saved.rows).toEqual([
    { id: "photo", bytes: "photo-original-bytes", stage: "07" },
    { id: "video", bytes: "video-original-bytes", stage: "07" },
  ]);
  expect(saved.project.project).toBe("Preserved Site");
  expect(saved.preparer.preparedBy).toBe("Saved Inspector");
}
test("unavailable IndexedDB cannot strand startup; Retry Records restores access", async ({
  page,
}) => {
  await seed(page);
  await page.addInitScript(() => {
    const original = indexedDB;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get() {
        if (!(window as any).storageUnlocked)
          throw new DOMException("Storage unavailable", "SecurityError");
        return original;
      },
    });
  });
  await page.reload();
  await started(page);
  await expect(page.getByRole("alert")).toContainText(
    "Existing data has not been deleted",
  );
  await expect(page.getByLabel("Project name")).toHaveValue("Preserved Site");
  await page.evaluate(() => ((window as any).storageUnlocked = true));
  await page.getByRole("button", { name: "Retry Records" }).click();
  await expect(page.getByRole("button", { name: /^Records 2$/ })).toBeVisible();
  await assertPreserved(page);
});
test("module failure shows recovery and reload preserves photos, videos and settings", async ({
  page,
}) => {
  await seed(page);
  const bundle = /\/assets\/App-[^/]+\.js$/;
  await page.route(bundle, (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "GeoCamera could not start" }),
  ).toBeVisible();
  await assertPreserved(page);
  await page.getByRole("button", { name: "Check for Update" }).click();
  await expect(page.locator("#startup-update-status")).toContainText(
    "Retry Startup",
  );
  await page.unroute(bundle);
  await page.getByRole("button", { name: "Retry Startup" }).click();
  await started(page);
  await expect(page.getByLabel("Project name")).toHaveValue("Preserved Site");
  await assertPreserved(page);
});
test("a stalled entry script reaches the independent startup watchdog", async ({
  page,
}) => {
  await page.clock.install();
  await page.route(/\/assets\/index-[^/]+\.js$/, () => {});
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForFunction(() => !!window.GeoCameraStartup);
  await page.clock.fastForward(12500);
  await expect(
    page.getByRole("heading", { name: "GeoCamera could not start" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry Startup" }),
  ).toBeVisible();
});
test("a React render exception shows recovery instead of the splash", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Date.prototype.toLocaleDateString = () => {
      throw new Error("Simulated render failure");
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "GeoCamera could not start" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry Startup" }),
  ).toBeVisible();
});
test("temporary settings read denial does not overwrite stored project or preparer details", async ({
  page,
}) => {
  await seed(page);
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const blocked = new Set([
      "geocamera-settings",
      "geocamera-inspection-settings",
    ]);
    Storage.prototype.getItem = function (key) {
      if (blocked.delete(key))
        throw new DOMException("Read temporarily denied", "SecurityError");
      return get.call(this, key);
    };
  });
  await page.reload();
  await started(page);
  await assertPreserved(page);
});
test("denied GPS does not block startup; Retry GPS obtains a real fix after permission changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition(success: PositionCallback, error: PositionErrorCallback) {
          calls++;
          setTimeout(() => {
            if (calls === 1)
              error({
                code: 1,
                message: "User denied Geolocation",
              } as GeolocationPositionError);
            else
              success({
                coords: { latitude: 24.7136, longitude: 46.6753, accuracy: 4 },
                timestamp: Date.now(),
              } as GeolocationPosition);
          }, 0);
          return calls;
        },
      },
    });
  });
  await page.goto("/");
  await started(page);
  await expect(
    page.getByText("Location access was denied for this website.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByText("Allow location in Safari", { exact: true }).click();
  await expect(
    page.getByText("iPhone Safari:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await expect(page.getByText("24.713600°")).toBeVisible();
  await expect(page.locator(".location-card .utm")).toContainText("UTM 38N");
});
test("GPS timeout and unavailable positioning can each be retried", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition(success: PositionCallback, error: PositionErrorCallback) {
          const call = ++calls;
          setTimeout(() => {
            if (call < 3)
              error({ code: call === 1 ? 3 : 2 } as GeolocationPositionError);
            else
              success({
                coords: { latitude: 0, longitude: 3, accuracy: 5 },
                timestamp: Date.now(),
              } as GeolocationPosition);
          }, 0);
          return call;
        },
      },
    });
  });
  await page.goto("/");
  await started(page);
  await expect(
    page.getByText("GPS timed out.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  await expect(
    page.getByText("Your device cannot determine a position right now.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry GPS", exact: true }).click();
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await expect(page.locator(".location-card .utm")).toContainText(
    "500000.0 E · 0.0 N",
  );
});
test("a synchronous GPS SecurityError is handled without crashing React", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition() {
          throw new DOMException("Location restricted", "SecurityError");
        },
      },
    }),
  );
  await page.goto("/");
  await started(page);
  await expect(
    page.getByText("Location access was denied for this website.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "GeoCamera could not start" }),
  ).toHaveCount(0);
});
test("stale GPS does not present a current fix", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition(success: PositionCallback) {
          setTimeout(
            () =>
              success({
                coords: { latitude: 24.7136, longitude: 46.6753, accuracy: 5 },
                timestamp: Date.now() - 120000,
              } as GeolocationPosition),
            0,
          );
          return 1;
        },
      },
    }),
  );
  await page.goto("/");
  await started(page);
  await expect(
    page.getByText("The last GPS fix is over a minute old.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("● GPS FIX")).toHaveCount(0);
});

test("missing geolocation API leaves the camera usable", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", { value: undefined }),
  );
  await page.goto("/");
  await started(page);
  await expect(
    page.getByText("GPS is unavailable in this browser.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry GPS", exact: true }),
  ).toBeVisible();
});
test("GPS is requested only after the branded splash has closed", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition() {
          sessionStorage.setItem(
            "gps-before-splash",
            String(!!document.querySelector(".launch-screen")),
          );
          return 1;
        },
      },
    }),
  );
  await page.goto("/");
  await started(page);
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("gps-before-splash")),
    )
    .toBe("false");
});
