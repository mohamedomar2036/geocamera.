import { expect, it } from "vitest";
import { recordedVideoMime } from "./recording";
it("uses the real MP4/WebM container rather than a guessed extension", async () => {
  const mp4 = new Blob(
    [new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])],
    { type: "video/webm" },
  );
  expect(await recordedVideoMime(mp4)).toBe("video/mp4");
  expect(
    await recordedVideoMime(
      new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0])], {
        type: "video/mp4",
      }),
    ),
  ).toBe("video/webm");
  await expect(recordedVideoMime(new Blob(["not video"]))).rejects.toThrow(
    "unrecognized",
  );
});
