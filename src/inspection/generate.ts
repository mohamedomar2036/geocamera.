import {
  INSPECTION_COLUMNS,
  INSPECTION_TITLE,
  fitWithin,
  type InspectionRow,
  type InspectionSettings,
  type InspectionFormat,
} from "./data";
import type { InspectionImage } from "./images";
import { excelPhotoLayout, wordPhotoLayout } from "./layout";
export interface ReportLogo extends InspectionImage {}
export interface InspectionDocument {
  rows: Omit<InspectionRow, "photo">[];
  images: InspectionImage[];
  branding: { gulf: ReportLogo; neom: ReportLogo };
  settings: InspectionSettings;
  scopeLabel: string;
}
const burgundy = "681B35";
const widths = [900, 1700, 1700, 1600, 1400, 1600, 5300, 1438];
// ExcelJS accepts native EMU anchors; col/row also satisfy its narrower public types.
function pixelAnchor(col: number, row: number, x: number, y: number) {
  return {
    col,
    row,
    nativeCol: col,
    nativeRow: row,
    nativeColOff: Math.round(x * 9525),
    nativeRowOff: Math.round(y * 9525),
  };
}
function base64(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function legend(data: InspectionDocument) {
  const zones = [
    ...new Set(data.rows.flatMap((r) => (r.utmZone ? [r.utmZone] : []))),
  ];
  const missing = data.rows.filter(
    (r) => r.utmX === null || r.utmY === null,
  ).length;
  return `${data.scopeLabel} · ${data.rows.length} photographs · WGS84 / UTM ${zones.join(", ") || "unavailable"}${missing ? ` · ${missing} photos without UTM (blank cells)` : ""}`;
}
function preparer(data: InspectionDocument) {
  return `Prepared By: ${data.settings.preparedBy || "—"}   |   Job Title: ${data.settings.jobTitle || "—"}`;
}
export async function generateInspectionXlsx(
  data: InspectionDocument,
): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  book.creator = data.settings.preparedBy || "GeoCamera";
  book.subject = INSPECTION_TITLE;
  const sheet = book.addWorksheet("Fence Inspection", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:4",
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.5,
        header: 0.15,
        footer: 0.2,
      },
    },
    views: [{ state: "frozen", ySplit: 4 }],
  });
  sheet.columns = [8, 15, 15, 14, 12, 15, 44, 13].map((width) => ({ width }));
  sheet.mergeCells("A1:H2");
  sheet.getRow(1).height = 34;
  sheet.getRow(2).height = 34;
  const title = sheet.getCell("A1");
  title.value = INSPECTION_TITLE;
  title.font = {
    name: "Calibri",
    size: 19,
    bold: true,
    color: { argb: "FF" + burgundy },
  };
  title.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  for (const [logo, tl, maxWidth, maxHeight] of [
    [data.branding.neom, pixelAnchor(0, 0, 48, 4), 76, 82],
    [data.branding.gulf, pixelAnchor(6, 0, 203, 20), 190, 62],
  ] as const) {
    const size = fitWithin(logo.width, logo.height, maxWidth, maxHeight);
    const id = book.addImage({
      base64: `data:image/png;base64,${base64(logo.bytes)}`,
      extension: "png",
    });
    sheet.addImage(id, { tl, ext: size, editAs: "oneCell" });
  }
  sheet.mergeCells("A3:H3");
  const note = sheet.getCell("A3");
  note.value = legend(data);
  note.font = { name: "Calibri", size: 9, color: { argb: "FF66515A" } };
  note.alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(3).height = 30;
  const header = sheet.getRow(4);
  header.values = [...INSPECTION_COLUMNS];
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      bold: true,
      size: 10,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF" + burgundy },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  });
  let pageHeight = 0;
  data.rows.forEach((r, index) => {
    const row = sheet.addRow([
      r.photoNumber,
      r.utmX,
      r.utmY,
      r.date,
      r.time,
      r.fieldActivity,
      "",
      r.stageNumber,
    ]);
    const image = data.images[index];
    const layout = excelPhotoLayout(image.width, image.height);
    row.height = layout.rowHeightPoints;
    if (pageHeight + layout.rowHeightPoints > 360 && index > 0) {
      sheet.getRow(row.number - 1).addPageBreak();
      pageHeight = 0;
    }
    pageHeight += layout.rowHeightPoints;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9CBD0" } },
        bottom: { style: "thin", color: { argb: "FFD9CBD0" } },
        left: { style: "thin", color: { argb: "FFD9CBD0" } },
        right: { style: "thin", color: { argb: "FFD9CBD0" } },
      };
      if (index % 2 === 1)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF5EEE9" },
        };
    });
    row.getCell(2).numFmt = "0.000";
    row.getCell(3).numFmt = "0.000";
    const size = layout.image;
    const id = book.addImage({
      base64: `data:image/jpeg;base64,${base64(image.bytes)}`,
      extension: "jpeg",
    });
    sheet.addImage(id, {
      tl: pixelAnchor(6, row.number - 1, layout.x, layout.y),
      ext: size,
      editAs: "oneCell",
    });
  });
  const end = data.rows.length + 6;
  sheet.mergeCells(`A${end}:H${end}`);
  const final = sheet.getCell(`A${end}`);
  final.value = preparer(data);
  final.font = {
    name: "Calibri",
    bold: true,
    size: 11,
    color: { argb: "FF" + burgundy },
  };
  final.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(end).height = 40;
  sheet.pageSetup.printArea = `A1:H${end}`;
  sheet.headerFooter.oddFooter = `&L${preparer(data)
    .replaceAll("&", "&&")
    .replace(/[\r\n]/g, " ")
    .slice(0, 200)}&RPage &P of &N`;
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function generateInspectionDocx(
  data: InspectionDocument,
): Promise<Uint8Array> {
  const D = await import("docx");
  const text = (value: string, bold = false) =>
    new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [
        new D.TextRun({
          text: value,
          bold,
          size: 18,
          color: bold ? "FFFFFF" : "351B25",
        }),
      ],
    });
  const picture = (
    image: InspectionImage,
    type: "png" | "jpg",
    maxWidth: number,
    maxHeight: number,
    description: string,
  ) =>
    new D.ImageRun({
      type,
      data: image.bytes,
      transformation:
        type === "jpg"
          ? wordPhotoLayout(image.width, image.height)
          : fitWithin(image.width, image.height, maxWidth, maxHeight),
      altText: { title: description, description, name: description },
    });
  const noBorder = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
    insideHorizontal: noBorder,
    insideVertical: noBorder,
  };
  const brandHeader = new D.Table({
    width: { size: 15638, type: D.WidthType.DXA },
    columnWidths: [3000, 9638, 3000],
    borders: noBorders,
    layout: D.TableLayoutType.FIXED,
    rows: [
      new D.TableRow({
        children: [
          new D.TableCell({
            width: { size: 3000, type: D.WidthType.DXA },
            children: [
              new D.Paragraph({
                alignment: D.AlignmentType.LEFT,
                children: [
                  picture(
                    data.branding.neom,
                    "png",
                    70,
                    76,
                    "NEOM Nature Reserve",
                  ),
                ],
              }),
            ],
          }),
          new D.TableCell({
            width: { size: 9638, type: D.WidthType.DXA },
            verticalAlign: D.VerticalAlign.CENTER,
            children: [
              new D.Paragraph({
                alignment: D.AlignmentType.CENTER,
                children: [
                  new D.TextRun({
                    text: INSPECTION_TITLE,
                    bold: true,
                    size: 30,
                    color: burgundy,
                  }),
                ],
              }),
            ],
          }),
          new D.TableCell({
            width: { size: 3000, type: D.WidthType.DXA },
            verticalAlign: D.VerticalAlign.CENTER,
            children: [
              new D.Paragraph({
                alignment: D.AlignmentType.RIGHT,
                children: [
                  picture(data.branding.gulf, "png", 174, 70, "Gulf Skyline"),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  const header = new D.TableRow({
    tableHeader: true,
    cantSplit: true,
    children: INSPECTION_COLUMNS.map(
      (label, index) =>
        new D.TableCell({
          width: { size: widths[index], type: D.WidthType.DXA },
          shading: { fill: burgundy },
          verticalAlign: D.VerticalAlign.CENTER,
          children: [text(label, true)],
        }),
    ),
  });
  const rows = data.rows.map(
    (r, index) =>
      new D.TableRow({
        cantSplit: true,
        children: [
          String(r.photoNumber),
          r.utmX === null ? "" : r.utmX.toFixed(3),
          r.utmY === null ? "" : r.utmY.toFixed(3),
          r.date,
          r.time,
          r.fieldActivity,
          "",
          r.stageNumber,
        ].map(
          (value, col) =>
            new D.TableCell({
              width: { size: widths[col], type: D.WidthType.DXA },
              verticalAlign: D.VerticalAlign.CENTER,
              shading: { fill: index % 2 === 1 ? "F5EEE9" : "FFFFFF" },
              children:
                col === 6
                  ? [
                      new D.Paragraph({
                        alignment: D.AlignmentType.CENTER,
                        spacing: { before: 0, after: 0 },
                        children: [
                          picture(
                            data.images[index],
                            "jpg",
                            300,
                            175,
                            `Stamped photograph ${r.photoNumber}`,
                          ),
                        ],
                      }),
                    ]
                  : [text(value)],
            }),
        ),
      }),
  );
  const doc = new D.Document({
    creator: data.settings.preparedBy || "GeoCamera",
    title: INSPECTION_TITLE,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 18 },
          paragraph: { spacing: { after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: D.PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 1800,
              bottom: 1000,
              left: 600,
              right: 600,
              header: 300,
              footer: 400,
            },
          },
        },
        headers: { default: new D.Header({ children: [brandHeader] }) },
        footers: {
          default: new D.Footer({
            children: [
              new D.Paragraph({
                alignment: D.AlignmentType.CENTER,
                children: [
                  new D.TextRun({
                    text: preparer(data),
                    size: 18,
                    color: burgundy,
                  }),
                ],
              }),
              new D.Paragraph({
                alignment: D.AlignmentType.CENTER,
                children: [
                  new D.TextRun("Page "),
                  new D.TextRun({ children: [D.PageNumber.CURRENT] }),
                  new D.TextRun(" of "),
                  new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children: [
          new D.Paragraph({ text: legend(data), spacing: { after: 140 } }),
          new D.Table({
            width: { size: 15638, type: D.WidthType.DXA },
            columnWidths: widths,
            layout: D.TableLayoutType.FIXED,
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
            rows: [header, ...rows],
          }),
          new D.Paragraph({
            spacing: { before: 200 },
            children: [
              new D.TextRun({
                text: preparer(data),
                bold: true,
                color: burgundy,
              }),
            ],
          }),
        ],
      },
    ],
  });
  return new Uint8Array(await D.Packer.toArrayBuffer(doc));
}
export async function generateInspectionDocument(
  format: InspectionFormat,
  data: InspectionDocument,
) {
  if (!data.rows.length || data.rows.length !== data.images.length)
    throw new Error(
      "The report must contain one embedded image for every photograph.",
    );
  return format === "xlsx"
    ? generateInspectionXlsx(data)
    : generateInspectionDocx(data);
}
