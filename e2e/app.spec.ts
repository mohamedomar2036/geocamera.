import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
test("captures media, restores records, exports a valid ZIP and starts offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your site. On record." }),
  ).toBeVisible();
  await page.getByLabel("Project name").fill("North District");
  await page.getByLabel("Stage name").fill("Survey");
  await page.getByLabel("Asset ID").fill("A-001");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect
    .poll(() =>
      page
        .locator(".viewfinder video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Photo saved");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".finder-label")).toContainText("● REC");
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Video saved");
  await page.getByRole("button", { name: /Records/ }).click();
  await expect(page.locator(".record")).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue("North District");
  await page.getByRole("button", { name: /Records/ }).click();
  await expect(page.locator(".record")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export day/ }).click();
  const file = await download;
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  const csv = await zip.file("records.csv")!.async("string");
  expect(csv).toContain("North District");
  expect(csv).toContain("24.7136");
  expect(csv).toContain('"38"');
  const media = Object.keys(zip.files).filter(
    (n) => n.startsWith("media/") && !zip.files[n].dir,
  );
  expect(media).toHaveLength(2);
  for (const name of media)
    expect((await zip.file(name)!.async("uint8array")).length).toBeGreaterThan(
      100,
    );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your site. On record." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Records/ }).click();
  await expect(page.locator(".record")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/geocamera-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("reports unavailable camera without losing the interface", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Camera access denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByRole("status")).toContainText("Camera access denied");
  await expect(page.getByLabel("Project name")).toBeEditable();
});

test("shares WGS84 coordinates through the native share sheet", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        sessionStorage.setItem("shared-location", JSON.stringify(data));
      },
    });
  });
  await page.goto("/");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.getByRole("button", { name: /Share location/ }).click();
  const shared = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("shared-location")!),
  );
  expect(shared.text).toContain("https://maps.google.com/?q=24.7136,46.6753");
});
