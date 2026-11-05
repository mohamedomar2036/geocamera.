/** Contain the complete photo, including its stamp. Small images may be enlarged proportionally. */
export function containPhoto(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (
    ![width, height, maxWidth, maxHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error("Invalid report photo dimensions.");
  return width / height >= maxWidth / maxHeight
    ? { width: maxWidth, height: (maxWidth * height) / width }
    : { width: (maxHeight * width) / height, height: maxHeight };
}
export function excelPhotoLayout(width: number, height: number) {
  const cellWidth = 313;
  const padding = 4;
  const image = containPhoto(width, height, cellWidth - padding * 2, 360);
  const cellHeight = image.height + padding * 2;
  return {
    image,
    cellWidth,
    cellHeight,
    rowHeightPoints: (cellHeight * 72) / 96,
    x: (cellWidth - image.width) / 2,
    y: padding,
  };
}
export function wordPhotoLayout(width: number, height: number) {
  // DXA/twips to 96dpi pixels; preserve cell margins plus a small border allowance.
  return containPhoto(width, height, 342, 460);
}
