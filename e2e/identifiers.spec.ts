import { test, expect, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect
    .poll(() =>
      page
        .locator(".viewfinder video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
}
async function rows(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("geocamera", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const records = await new Promise<any[]>((resolve) => {
      const r = db.transaction("records").objectStore("records").getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return records.map(({ blob, ...record }) => record);
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
test("photos and videos share a padded sequence and reopening retains the next ID", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Asset ID").fill("FENCE-099");
  await photo(page, 1);
  await expect(page.getByLabel("Asset ID")).toHaveValue("FENCE-100");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".finder-label")).toContainText("● REC");
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Records 2$/ })).toBeVisible();
  await expect(page.getByLabel("Asset ID")).toHaveValue("FENCE-101");
  const saved = await rows(page);
  expect(saved.map((r) => r.asset).sort()).toEqual(["FENCE-099", "FENCE-100"]);
  expect(saved.find((r) => r.kind === "video")).toMatchObject({
    asset: "FENCE-100",
    videoStamped: true,
  });
  await page.reload();
  await expect(page.getByLabel("Asset ID")).toHaveValue("FENCE-101");
  expect((await rows(page)).map((r) => r.asset).sort()).toEqual([
    "FENCE-099",
    "FENCE-100",
  ]);
});
test("alphabetic input stamps/saves 001 first and proposes 002, preserving later manual starting values", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Asset ID").fill("FENCE");
  await photo(page, 1);
  expect((await rows(page))[0].asset).toBe("FENCE001");
  await expect(page.getByLabel("Asset ID")).toHaveValue("FENCE002");
  await page.getByLabel("Asset ID").fill("SITE_02_PH_009");
  await photo(page, 2);
  await expect(page.getByLabel("Asset ID")).toHaveValue("SITE_02_PH_010");
  expect((await rows(page)).map((r) => r.asset).sort()).toEqual([
    "FENCE001",
    "SITE_02_PH_009",
  ]);
  await page.getByRole("button", { name: /^Records 2$/ }).click();
  const download = page.waitForEvent("download");
  await page
    .locator(".record")
    .filter({ hasText: "FENCE001" })
    .getByRole("button", { name: "Save photo", exact: true })
    .click();
  await (await download).saveAs("/tmp/mqsio-alpha-photo.jpg");
});
test("overlapping clicks and failed saves do not skip or duplicate identifiers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value: any, key?: IDBValidKey) {
      if ((window as any).failCaptureSave && this.name === "records")
        throw new DOMException(
          "Simulated failed capture save",
          "QuotaExceededError",
        );
      return key === undefined
        ? add.call(this, value)
        : add.call(this, value, key);
    };
  });
  await start(page);
  await page.getByLabel("Asset ID").fill("A007");
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole("button", { name: /^Records 1$/ })).toBeVisible();
  await expect(page.getByLabel("Asset ID")).toHaveValue("A008");
  await page.evaluate(() => ((window as any).failCaptureSave = true));
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Simulated failed capture save",
  );
  await expect(page.getByLabel("Asset ID")).toHaveValue("A008");
  expect(await rows(page)).toHaveLength(1);
  await page.evaluate(() => ((window as any).failCaptureSave = false));
  await photo(page, 2);
  await expect(page.getByLabel("Asset ID")).toHaveValue("A009");
  expect((await rows(page)).map((r) => r.asset).sort()).toEqual([
    "A007",
    "A008",
  ]);
});
test("a starting identifier edited during photo encoding is not overwritten by the previous save", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Asset ID").fill("OLD001");
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (
      callback: BlobCallback,
      type?: string,
      quality?: any,
    ) {
      (window as any).finishEncoding = () =>
        encode.call(this, callback, type, quality);
    };
  });
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).finishEncoding))
    .toBe("function");
  await page.getByLabel("Asset ID").fill("NEW050");
  await page.evaluate(() => (window as any).finishEncoding());
  await expect(page.getByRole("button", { name: /^Records 1$/ })).toBeVisible();
  await expect(page.getByLabel("Asset ID")).toHaveValue("NEW050");
  expect((await rows(page))[0].asset).toBe("OLD001");
});
test("a cancelled recording during startup recovery cannot advance the ID", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Asset ID").fill("KEEP009");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".finder-label")).toContainText("● REC");
  await page.evaluate(() => {
    Date.prototype.toLocaleDateString = () => {
      throw new Error("Simulated render cancellation");
    };
  });
  await expect(
    page.getByRole("heading", { name: "MQSIO could not start" }),
  ).toBeVisible();
  expect(await rows(page)).toHaveLength(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("geocamera-settings")!).asset,
    ),
  ).toBe("KEEP009");
  await page.reload();
  await expect(page.getByLabel("Asset ID")).toHaveValue("KEEP009");
  expect(await rows(page)).toHaveLength(0);
});
