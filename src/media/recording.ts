import { drawStamp, type StampMetadata } from "./stamp";
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_VIDEO_DURATION = 180000;
export interface StampedVideo {
  blob: Blob;
  mime: string;
  reason: string;
}
export interface StampedRecording {
  result: Promise<StampedVideo>;
  stop: (reason?: string) => void;
  cancel: () => void;
}
export function stampedVideoCapability() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  )
    return "Stamped video is unavailable in this browser. Use stamped photos instead; no unstamped video will be saved.";
  return "";
}
export function startStampedRecording(
  video: HTMLVideoElement,
  camera: MediaStream,
  metadata: () => StampMetadata,
  onStopping: () => void,
): StampedRecording {
  const unsupported = stampedVideoCapability();
  if (unsupported) throw new Error(unsupported);
  if (video.readyState < 2 || video.videoWidth < 240 || video.videoHeight < 240)
    throw new Error("Wait for a clear camera image before recording.");
  const mime = [
    "video/mp4;codecs=avc1.42E01F",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm",
  ].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime)
    throw new Error(
      "No supported stamped-video format. Use stamped photos instead.",
    );
  const originalWidth = video.videoWidth,
    originalHeight = video.videoHeight;
  const scale = Math.min(1, 1280 / Math.max(originalWidth, originalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((originalWidth * scale) / 2) * 2;
  canvas.height = Math.round((originalHeight * scale) / 2) * 2;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx)
    throw new Error(
      "Video stamping requires Canvas. Use stamped photos instead.",
    );
  const draw = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawStamp(ctx, canvas.width, canvas.height, metadata(), new Date());
  };
  let output: MediaStream | undefined;
  let recorder: MediaRecorder;
  try {
    draw();
    output = canvas.captureStream(24);
    if (!output.getVideoTracks().some((t) => t.readyState === "live"))
      throw new Error(
        "Canvas video capture is not available. Use stamped photos instead.",
      );
    recorder = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: 2500000,
    });
  } catch (error) {
    output?.getTracks().forEach((t) => t.stop());
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  }
  let frame = 0;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let stopping = false;
  let done = false;
  let failure: Error | null = null;
  let reason = "";
  let bytes = 0;
  let lastFrame = Date.now();
  const started = Date.now();
  const chunks: BlobPart[] = [];
  let resolveResult!: (result: StampedVideo) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<StampedVideo>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const cameraTracks = camera.getVideoTracks();
  const removeListeners = () => {
    document.removeEventListener("visibilitychange", hidden);
    window.removeEventListener("orientationchange", orientation);
    cameraTracks.forEach((t) => t.removeEventListener("ended", cameraEnded));
  };
  const cleanup = () => {
    cancelAnimationFrame(frame);
    clearInterval(watchdog);
    removeListeners();
    output?.getTracks().forEach((t) => t.stop());
    canvas.width = 0;
    canvas.height = 0;
  };
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  const stop = (message = "") => {
    if (stopping || done) return;
    stopping = true;
    reason = message;
    onStopping();
    cancelAnimationFrame(frame);
    clearInterval(watchdog);
    removeListeners();
    try {
      if (recorder.state !== "inactive") recorder.stop();
      else finish();
    } catch (error) {
      failure =
        error instanceof Error ? error : new Error("Video recording failed.");
      finish();
    }
    if (!done)
      stopTimeout = setTimeout(() => {
        failure = new Error(
          "Video finalization timed out. No unstamped video was saved. Use stamped photos instead.",
        );
        finish();
      }, 12000);
  };
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(stopTimeout);
    cleanup();
    if (failure) {
      rejectResult(failure);
      return;
    }
    const actual = recorder.mimeType || mime;
    const blob = new Blob(chunks, { type: actual });
    if (!blob.size) {
      rejectResult(
        new Error(
          "No stamped video frames were produced. Use stamped photos instead.",
        ),
      );
      return;
    }
    resolveResult({ blob, mime: actual, reason });
  };
  const hidden = () => {
    if (document.hidden)
      stop("Recording stopped when the app left the foreground.");
  };
  const orientation = () =>
    stop(
      "Recording stopped after an orientation change. Start a new clip in the new orientation.",
    );
  const cameraEnded = () =>
    stop("Recording stopped because the camera disconnected.");
  recorder.ondataavailable = (e) => {
    if (e.data.size) {
      chunks.push(e.data);
      bytes += e.data.size;
      if (bytes >= MAX_VIDEO_BYTES)
        stop("Recording reached the 64 MiB safety limit.");
    }
  };
  recorder.onerror = () => {
    failure = new Error(
      "Stamped-video encoding failed. No unstamped video was saved. Use stamped photos instead.",
    );
    stop();
  };
  recorder.onstop = finish;
  const tick = () => {
    if (stopping || done) return;
    try {
      if (
        video.videoWidth !== originalWidth ||
        video.videoHeight !== originalHeight
      ) {
        stop(
          "Camera orientation or resolution changed. Start a new stamped clip.",
        );
        return;
      }
      if (video.readyState >= 2 && !video.paused) {
        draw();
        lastFrame = Date.now();
      }
      if (Date.now() - lastFrame > 5000) {
        stop("The camera stopped delivering frames.");
        return;
      }
      frame = requestAnimationFrame(tick);
    } catch (error) {
      failure =
        error instanceof Error ? error : new Error("Video stamping failed.");
      stop();
    }
  };
  try {
    recorder.start(1000);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("orientationchange", orientation);
    cameraTracks.forEach((t) => t.addEventListener("ended", cameraEnded));
    frame = requestAnimationFrame(tick);
    watchdog = setInterval(() => {
      if (Date.now() - started >= MAX_VIDEO_DURATION)
        stop("Recording reached the three-minute safety limit.");
      else if (Date.now() - lastFrame > 5000)
        stop("Video frames were interrupted.");
    }, 1000);
  } catch (error) {
    cleanup();
    throw error;
  }
  return {
    result,
    stop,
    cancel: () => {
      failure = new DOMException("Recording cancelled.", "AbortError");
      stop();
    },
  };
}
export async function recordedVideoMime(blob: Blob): Promise<string> {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (
    header.length >= 8 &&
    String.fromCharCode(...header.slice(4, 8)) === "ftyp"
  )
    return "video/mp4";
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  )
    return "video/webm";
  throw new Error(
    "The browser produced an unrecognized video container. Use stamped photos instead.",
  );
}
/** Check that the encoded container has a decodable video track before saving it as stamped. */
export async function validateStampedVideo(blob: Blob): Promise<string> {
  const mime = await recordedVideoMime(blob);
  const url = URL.createObjectURL(blob);
  const probe = document.createElement("video");
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = "auto";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      probe.onloadeddata = () =>
        probe.videoWidth && probe.videoHeight
          ? resolve()
          : reject(new Error("The stamped clip has no decodable video track."));
      probe.onerror = () =>
        reject(
          new Error(
            "This browser could not decode its stamped video. Use stamped photos instead.",
          ),
        );
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Stamped-video validation timed out. Use stamped photos instead.",
            ),
          ),
        10000,
      );
      probe.src = url;
      probe.load();
      void probe.play().catch(() => {});
    });
    const frame = document.createElement("canvas");
    frame.width = probe.videoWidth;
    frame.height = probe.videoHeight;
    try {
      const context = frame.getContext("2d");
      if (!context)
        throw new Error(
          "Video stamp validation is unavailable. Use stamped photos instead.",
        );
      context.drawImage(probe, 0, 0);
      for (const x of [0.02, 0.5, 0.98]) {
        const [r, g, b] = context.getImageData(
          Math.floor(frame.width * x),
          frame.height - 2,
          1,
          1,
        ).data;
        if (r < 16 || r > 70 || g > 45 || b > 55)
          throw new Error(
            "This browser did not produce a reliable video stamp. Use stamped photos instead; no unstamped video was saved.",
          );
      }
    } finally {
      frame.width = 0;
      frame.height = 0;
    }
    return mime;
  } finally {
    clearTimeout(timer);
    probe.pause();
    probe.removeAttribute("src");
    probe.load();
    URL.revokeObjectURL(url);
  }
}
