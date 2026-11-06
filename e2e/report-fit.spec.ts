import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
test("landscape and portrait photographs fill their original Excel/Word cells without cropping or overlap", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      (window as any).portraitCamera = c;
      function draw() {
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#d9c7a6";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#681B35";
        ctx.fillRect(0, 0, 40, 40);
        ctx.fillStyle = "#f47a26";
        ctx.fillRect(c.width - 40, c.height - 40, 40, 40);
        requestAnimationFrame(draw);
      }
      draw();
      return c.captureStream(24);
    };
  });
  await page.goto("/");
  await page.getByLabel("Asset ID").fill("FIT001");
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect
    .poll(() =>
      page
        .locator(".viewfinder video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBe(1280);
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Records 1$/ })).toBeVisible();
  await page.evaluate(() => {
    const c = (window as any).portraitCamera as HTMLCanvasElement;
    c.width = 720;
    c.height = 1280;
  });
  await expect
    .poll(() =>
      page
        .locator(".viewfinder video")
        .evaluate((v: HTMLVideoElement) => v.videoHeight),
    )
    .toBe(1280);
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Records 2$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Records 2$/ }).click();
  const report = page.getByRole("region", { name: "Export Inspection Report" });
  const excelDownload = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Export Inspection Report", exact: true })
    .click();
  const excel = await excelDownload;
  await excel.saveAs("/tmp/mqsio-report-fit.xlsx");
  const Excel = (await import("exceljs")).default;
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(await readFile("/tmp/mqsio-report-fit.xlsx"));
  const sheet = workbook.getWorksheet("Fence Inspection")!;
  const photos = sheet
    .getImages()
    .filter((image) => image.range.tl.nativeRow >= 4);
  expect(photos).toHaveLength(2);
  for (const [index, photo] of photos.entries()) {
    const { tl, ext } = photo.range;
    expect(tl.nativeCol).toBe(6);
    expect(tl.nativeRow).toBe(4 + index);
    const x = tl.nativeColOff / 9525,
      y = tl.nativeRowOff / 9525;
    expect(x).toBeGreaterThanOrEqual(3.9);
    expect(y).toBeGreaterThanOrEqual(3.9);
    expect(x + ext.width).toBeLessThanOrEqual(313.01);
    expect(y + ext.height).toBeLessThanOrEqual(
      (sheet.getRow(5 + index).height * 96) / 72 + 0.01,
    );
    expect(ext.width / ext.height).toBeCloseTo(
      index === 0 ? 1280 / 720 : 720 / 1280,
      2,
    );
  }
  expect(photos[0].range.ext.width).toBe(305);
  expect(photos[1].range.ext.height).toBe(360);
  expect(sheet.getRow(6).height).toBeGreaterThan(sheet.getRow(5).height);
  await page.getByLabel("Report format").selectOption("docx");
  const wordDownload = page.waitForEvent("download");
  await report
    .getByRole("button", { name: "Export Inspection Report", exact: true })
    .click();
  await (await wordDownload).saveAs("/tmp/mqsio-report-fit.docx");
  const word = await JSZip.loadAsync(
    await readFile("/tmp/mqsio-report-fit.docx"),
  );
  const xml = await word.file("word/document.xml")!.async("string");
  const pictures = (
    xml.match(/<wp:inline\b[\s\S]*?<\/wp:inline>/g) || []
  ).filter((s) => s.includes("Stamped photograph"));
  expect(pictures).toHaveLength(2);
  for (const [index, picture] of pictures.entries()) {
    const size = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(picture)!;
    const width = Number(size[1]) / 9525,
      height = Number(size[2]) / 9525;
    expect(width).toBeLessThanOrEqual(342.01);
    expect(height).toBeLessThanOrEqual(460.01);
    expect(width / height).toBeCloseTo(
      index === 0 ? 1280 / 720 : 720 / 1280,
      2,
    );
    if (index === 0) expect(width).toBeGreaterThan(300);
    else expect(height).toBeGreaterThan(400);
  }
  expect(xml).toContain("w:cantSplit");
  expect(xml).toContain("w:tblHeader");
});
