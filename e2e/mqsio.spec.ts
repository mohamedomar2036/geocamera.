import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
async function camera(page: Page) {
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect
    .poll(() =>
      page
        .locator(".viewfinder video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("geocamera", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const records = await new Promise<any[]>((resolve, reject) => {
      const r = db.transaction("records").objectStore("records").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return records.map(({ blob, ...r }) => ({ ...r, bytes: blob.size }));
  });
}
async function photo(page: Page, count: number) {
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(`^Records ${count}$`) }),
  ).toBeVisible();
}

test("MQSIO manifest, icons, launch and recovery use the approved artwork", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("MQSIO — GIS FIELD TOOLS");
  await expect(page.locator(".brand")).toContainText("MQSIO");
  await expect(page.locator(".brand small")).toHaveText("GIS FIELD TOOLS");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("MQSIO");
  expect(manifest.short_name).toBe("MQSIO");
  expect(manifest.start_url).toBe(".");
  expect(manifest.scope).toBe("/");
  expect(manifest.theme_color).toBe("#681B35");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/mqsio-icon-180.png",
  );
  for (const size of [180, 192, 512]) {
    const dimensions = await page.evaluate(async (size) => {
      const image = new Image();
      image.src = `/mqsio-icon-${size}.png`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, size);
    expect(dimensions).toEqual([size, size]);
  }
  expect(await readFile("public/mqsio-full-logo.png")).toEqual(
    await readFile("صورة ChatGPT 5 نوفمبر 2026، 09_39_55 م.png"),
  );
});

test("place lookup is opt-in, cached and never substitutes stale city names", async ({
  page,
  context,
}) => {
  let calls = 0;
  await context.route("https://api.bigdatacloud.net/**", (route) => {
    calls++;
    return route.fulfill({
      json: {
        countryName: "Saudi Arabia",
        city: "Riyadh",
        principalSubdivision: "Riyadh Region",
      },
    });
  });
  await page.goto("/");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  expect(calls).toBe(0);
  await page.getByText("Country & city (optional)", { exact: true }).click();
  await page.getByLabel("Use online place names").check();
  await expect(page.locator(".place-card")).toContainText(
    "Country: Saudi Arabia",
  );
  await expect(page.locator(".place-card")).toContainText("City: Riyadh");
  await page
    .getByRole("button", { name: "Retry place names", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry place names", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
  await camera(page);
  await photo(page, 1);
  const [first] = await stored(page);
  expect(first).toMatchObject({
    country: "Saudi Arabia",
    city: "Riyadh",
    area: "Riyadh Region",
    stampVersion: 2,
  });
  await page.getByRole("button", { name: /^Records 1$/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await (await download).saveAs("/tmp/mqsio-place-photo.jpg");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await context.setGeolocation({ latitude: 25, longitude: 46.6753 });
  await expect(page.getByText("25.000000°")).toBeVisible();
  await expect(page.locator(".place-card")).toContainText("City: Unavailable");
  await photo(page, 2);
  expect((await stored(page)).find((r) => r.id !== first.id)).toMatchObject({
    city: "Unavailable",
    country: "Unavailable",
  });
  expect(calls).toBe(1);
});

test("no GPS and no internet still permit stamped photos and CSV plus ZIP export", async ({
  page,
  context,
}) => {
  let calls = 0;
  await context.route("https://api.bigdatacloud.net/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition(_ok: any, fail: any) {
          setTimeout(() => fail({ code: 1 }), 0);
          return 1;
        },
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry GPS", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.getByText("Country & city (optional)", { exact: true }).click();
  await page.getByLabel("Use online place names").check();
  await camera(page);
  await photo(page, 1);
  expect((await stored(page))[0]).toMatchObject({
    location: null,
    country: "Unavailable",
    city: "Unavailable",
    stampVersion: 2,
  });
  expect(calls).toBe(0);
  await page.getByRole("button", { name: /^Records 1$/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export day/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^MQSIO-.*\.zip$/);
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(await zip.file("records.csv")!.async("string")).toContain(
    '"Unavailable"',
  );
});

test("video contains burned pixels and a changing clock, and expires stale GPS in the footage", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await context.route("https://api.bigdatacloud.net/**", (route) =>
    route.fulfill({
      json: {
        countryName: "Saudi Arabia",
        city: "Riyadh",
        principalSubdivision: "Riyadh Region",
      },
    }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        clearWatch() {},
        watchPosition(success: PositionCallback) {
          setTimeout(
            () =>
              success({
                coords: { latitude: 24.7136, longitude: 46.6753, accuracy: 4 },
                // Start with a still-fresh fix and let its real timestamp expire.
                timestamp: Date.now() - 56000,
              } as GeolocationPosition),
            0,
          );
          return 1;
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.getByText("Country & city (optional)", { exact: true }).click();
  await page.getByLabel("Use online place names").check();
  await expect(page.locator(".place-card")).toContainText("City: Riyadh");
  await page.getByLabel("Project name").fill("Video Project");
  await page.getByLabel("Stage name").fill("09");
  await page.getByLabel("Asset ID").fill("VID-1");
  await camera(page);
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".finder-label")).toContainText("● REC");
  await page.waitForTimeout(2300);
  await expect(
    page.getByText("The last GPS fix is over a minute old.", { exact: false }),
  ).toBeVisible();
  await page.waitForTimeout(1400);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Records 1$/ })).toBeVisible();
  const [record] = await stored(page);
  expect(record).toMatchObject({
    videoStamped: true,
    stampVersion: 2,
    city: "Riyadh",
    country: "Saudi Arabia",
  });
  expect(record.mime).toMatch(/^video\/(mp4|webm)$/);
  await page.getByRole("button", { name: /^Records 1$/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save video", exact: true }).click();
  const file = await download;
  const extension = record.mime.includes("mp4") ? "mp4" : "webm";
  expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  await file.saveAs(`/tmp/mqsio-stamped-video.${extension}`);
  const frames = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("geocamera");
      r.onsuccess = () => resolve(r.result);
    });
    const r = await new Promise<any>((resolve) => {
      const q = db.transaction("records").objectStore("records").getAll();
      q.onsuccess = () =>
        resolve(q.result.find((r: any) => r.kind === "video"));
    });
    db.close();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(r.blob);
    video.src = url;
    document.body.append(video);
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Encoded clip cannot play"));
    });
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d")!;
    async function sample(time: number) {
      video.currentTime = time;
      await new Promise<void>((resolve) => (video.onseeked = () => resolve()));
      ctx.drawImage(video, 0, 0);
      const size = Math.max(8, Math.min(28, c.width / 48, c.height / 45));
      const panel = 7 * size * 1.3 + size * 1.4;
      const header = ctx.getImageData(
        0,
        Math.floor(c.height - panel),
        c.width,
        Math.ceil(size * 2.1),
      );
      const gps = ctx.getImageData(
        0,
        Math.floor(c.height - panel + size * 0.7 + size * 1.3 * 3),
        c.width,
        Math.ceil(size * 1.3),
      );
      return {
        header: Array.from(header.data),
        gps: Array.from(gps.data),
        bottom: [...ctx.getImageData(5, c.height - 2, 1, 1).data],
      };
    }
    const first = await sample(0.2);
    const last = await sample(video.duration - 0.3);
    video.remove();
    URL.revokeObjectURL(url);
    return { first, last, width: c.width, height: c.height };
  });
  expect(frames.width).toBeLessThanOrEqual(1280);
  for (const snapshot of [frames.first, frames.last]) {
    expect(snapshot.bottom[0]).toBeGreaterThan(16);
    expect(snapshot.bottom[0]).toBeLessThan(70);
    expect(snapshot.bottom[1]).toBeLessThan(45);
  }
  expect(frames.first.header).not.toEqual(frames.last.header);
  expect(frames.first.gps).not.toEqual(frames.last.gps);
});

test("unsupported stamped-video capture warns explicitly and offers working stamped photos", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/");
  await camera(page);
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".video-warning")).toContainText(
    "no unstamped video will be saved",
  );
  expect(await stored(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Use stamped photos", exact: true })
    .click();
  await photo(page, 1);
  expect((await stored(page))[0].kind).toBe("photo");
});

test("orientation change stops safely and saves a playable stamped partial clip", async ({
  page,
}) => {
  await page.goto("/");
  await camera(page);
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".finder-label")).toContainText("● REC");
  await page.waitForTimeout(1200);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("orientationchange")),
  );
  await expect(page.getByRole("button", { name: /^Records 1$/ })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("orientation change");
  expect((await stored(page))[0]).toMatchObject({ videoStamped: true });
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
});
