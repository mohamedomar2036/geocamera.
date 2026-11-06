import { describe, expect, it } from "vitest";
import { containPhoto, excelPhotoLayout, wordPhotoLayout } from "./layout";
describe("maximum useful report photo sizing", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1080, 1920],
    [1200, 1200],
    [100, 50],
    [50, 100],
    [3000, 400],
  ]) {
    it(`contains ${width}×${height} without cropping, stretching or cell overlap`, () => {
      const excel = excelPhotoLayout(width, height);
      const word = wordPhotoLayout(width, height);
      expect(excel.x).toBeGreaterThanOrEqual(4);
      expect(excel.y).toBe(4);
      expect(excel.x + excel.image.width).toBeLessThanOrEqual(
        excel.cellWidth - 4,
      );
      expect(excel.y + excel.image.height).toBeLessThanOrEqual(
        excel.cellHeight - 4,
      );
      expect((excel.rowHeightPoints * 96) / 72).toBeCloseTo(
        excel.cellHeight,
        5,
      );
      expect(word.width).toBeLessThanOrEqual(342);
      expect(word.height).toBeLessThanOrEqual(460);
      for (const size of [excel.image, word])
        expect(
          Math.abs(size.width / size.height - width / height),
        ).toBeLessThan(0.025);
      expect(excel.image.width === 305 || excel.image.height === 360).toBe(
        true,
      );
      expect(word.width === 342 || word.height === 460).toBe(true);
    });
  }
  it("enlarges small photos proportionally and rejects broken dimensions", () => {
    expect(containPhoto(100, 50, 300, 200)).toEqual({
      width: 300,
      height: 150,
    });
    expect(() => containPhoto(0, 30, 300, 200)).toThrow();
    expect(excelPhotoLayout(1080, 1920).rowHeightPoints).toBeGreaterThan(
      excelPhotoLayout(1920, 1080).rowHeightPoints,
    );
  });
});
