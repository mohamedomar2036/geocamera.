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
  await page.getByLabel("Prepared By", { exact: true }).fill("Site Inspector");
  await page.getByLabel("Job Title", { exact: true }).fill("Field Engineer");
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
  await expect(page.getByLabel("Prepared By", { exact: true })).toHaveValue(
    "Site Inspector",
  );
  await expect(page.getByLabel("Job Title", { exact: true })).toHaveValue(
    "Field Engineer",
  );
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

test("exports actual stamped photographs into printable Excel and Word reports", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByLabel("Project name").fill("Fence Inspection");
  await page.getByLabel("Stage name").fill("07");
  await page.getByLabel("Asset ID").fill("FENCE-007");
  await page.getByLabel("Prepared By", { exact: true }).fill("Field Inspector");
  await page.getByLabel("Job Title", { exact: true }).fill("Site Engineer");
  await expect(page.getByText("● GPS FIX")).toBeVisible();
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect
    .poll(() =>
      page
        .locator(".viewfinder video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  for (let i = 0; i < 8; i++) {
    await page
      .getByRole("button", { name: "Capture photo", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: new RegExp(`^Records ${i + 1}$`) }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Records 9$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Records 9$/ }).click();
  const report = page.getByRole("region", { name: "Export Inspection Report" });
  await expect(report).toContainText("8 photographs");
  await page.getByLabel("Report records").selectOption("all");
  // Verify the entire new workflow can run offline once the PWA has cached its assets.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  const xlsxDownload = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Export Inspection Report", exact: true })
    .click();
  const xlsx = await xlsxDownload;
  expect(xlsx.suggestedFilename()).toMatch(/all-records.xlsx$/);
  await xlsx.saveAs("/tmp/geocamera-inspection-test.xlsx");
  const xlsxBytes = await readFile("/tmp/geocamera-inspection-test.xlsx");
  const xlsxZip = await JSZip.loadAsync(xlsxBytes);
  expect(
    Object.keys(xlsxZip.files).filter((n) =>
      /^xl\/media\/.+\.(jpeg|png)$/.test(n),
    ),
  ).toHaveLength(10);
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxBytes);
  const sheet = workbook.getWorksheet("Fence Inspection")!;
  expect(sheet.getRow(4).values.slice(1)).toEqual([
    "Photo Number",
    "UTM X",
    "UTM Y",
    "Date",
    "Time",
    "Field Activity",
    "Photo",
    "Stage Number",
  ]);
  expect(sheet.getCell("C1").value).toBe("Periodic Fence Inspection");
  expect(sheet.pageSetup.orientation).toBe("landscape");
  expect(sheet.pageSetup.printTitlesRow).toBe("1:4");
  for (let row = 5; row < 13; row++) {
    expect(sheet.getCell(`A${row}`).value).toBe(row - 4);
    expect(typeof sheet.getCell(`B${row}`).value).toBe("number");
    expect(sheet.getCell(`B${row}`).value).toBeCloseTo(669459.622, 2);
    expect(sheet.getCell(`C${row}`).value).toBeCloseTo(2734271.672, 2);
    expect(sheet.getCell(`F${row}`).value).toBe("Inspection");
    expect(sheet.getCell(`H${row}`).value).toBe("07");
  }
  expect(sheet.getCell("A14").value).toContain("Field Inspector");
  const gulfSource = await readFile(
    "file_00000000e30c82438648e9277477d724 (2).png",
  );
  const neomSource = await readFile("02_logo_3x_navy.png");
  const workbookImages = await Promise.all(
    Object.keys(xlsxZip.files)
      .filter((n) => /^xl\/media\/.+\.png$/.test(n))
      .map((n) => xlsxZip.file(n)!.async("nodebuffer")),
  );
  expect(workbookImages.some((b) => b.equals(gulfSource))).toBe(true);
  expect(workbookImages.some((b) => b.equals(neomSource))).toBe(true);
  await page.getByLabel("Report records").selectOption("day");
  await page.getByLabel("Report format").selectOption("docx");
  const docxDownload = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Export Inspection Report", exact: true })
    .click();
  const docx = await docxDownload;
  expect(docx.suggestedFilename()).toMatch(
    /Periodic-Fence-Inspection-\d{4}-\d{2}-\d{2}\.docx$/,
  );
  await docx.saveAs("/tmp/geocamera-inspection-test.docx");
  const docxZip = await JSZip.loadAsync(
    await readFile("/tmp/geocamera-inspection-test.docx"),
  );
  const xml = await docxZip.file("word/document.xml")!.async("string");
  expect(xml).toContain("w:tblHeader");
  expect(xml).toContain("w:cantSplit");
  expect(xml).toContain('w:orient="landscape"');
  expect(xml.match(/descr="Stamped photograph \d+"/g)).toHaveLength(8);
  expect(xml).toContain('w:w="16838" w:h="11906"');
  expect(xml.match(/<w:t[^>]*>Inspection<\/w:t>/g)).toHaveLength(8);
  let position = -1;
  for (const label of [
    "Photo Number",
    "UTM X",
    "UTM Y",
    "Date",
    "Time",
    "Field Activity",
    "Photo",
    "Stage Number",
  ]) {
    position = xml.indexOf(`>${label}</w:t>`, position + 1);
    expect(position).toBeGreaterThan(-1);
  }
  const header = await docxZip.file("word/header1.xml")!.async("string");
  expect(header).toContain("Periodic Fence Inspection");
  expect(header.indexOf("NEOM Nature Reserve")).toBeLessThan(
    header.indexOf("Gulf Skyline"),
  );
  const footer = await docxZip.file("word/footer1.xml")!.async("string");
  expect(footer).toContain("Field Inspector");
  expect(footer).toContain("Site Engineer");
  expect(footer).toContain("PAGE");
  const docMedia = await Promise.all(
    Object.keys(docxZip.files)
      .filter((n) => n.startsWith("word/media/") && !docxZip.files[n].dir)
      .map((n) => docxZip.file(n)!.async("nodebuffer")),
  );
  expect(docMedia.some((b) => b.equals(gulfSource))).toBe(true);
  expect(docMedia.some((b) => b.equals(neomSource))).toBe(true);
  // Confirm the embedded JPEG contains the permanent burgundy stamp band.
  const jpegPath = Object.keys(xlsxZip.files).find((n) =>
    /^xl\/media\/.+\.jpeg$/.test(n),
  )!;
  const jpeg = await xlsxZip.file(jpegPath)!.async("base64");
  const stamp = await page.evaluate(async (base64) => {
    const im = new Image();
    im.src = `data:image/jpeg;base64,${base64}`;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0);
    return {
      width: im.naturalWidth,
      height: im.naturalHeight,
      pixel: [...ctx.getImageData(5, im.naturalHeight - 5, 1, 1).data],
    };
  }, jpeg);
  expect(stamp.width).toBeGreaterThan(0);
  expect(stamp.width).toBeLessThanOrEqual(1200);
  expect(stamp.pixel.slice(0, 3).every((channel) => channel < 80)).toBe(true);
  await expect(report.locator(".report-progress")).toContainText(
    "8 photographs exported",
  );
});

test("handles an unreadable stored photograph without changing the library", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("geocamera", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite");
      transaction
        .objectStore("records")
        .put({
          id: "damaged-photo",
          kind: "photo",
          createdAt: new Date().toISOString(),
          day: "2026-11-05",
          project: "Site",
          stage: "1",
          asset: "Bad file",
          location: null,
          mime: "image/jpeg",
          blob: new Blob(["not-a-jpeg"], { type: "image/jpeg" }),
        });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole("button", { name: /^Records 1$/ }).click();
  await page.getByLabel("Report records").selectOption("all");
  const report = page.getByRole("region", { name: "Export Inspection Report" });
  await report
    .getByRole("button", { name: "Export Inspection Report", exact: true })
    .click();
  await expect(report.getByRole("alert")).toContainText("could not be decoded");
  await expect(page.locator(".record")).toHaveCount(1);
  await expect(
    report.getByRole("button", {
      name: "Export Inspection Report",
      exact: true,
    }),
  ).toBeEnabled();
});
