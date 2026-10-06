const video = document.querySelector("#video");
const drawCanvas = document.querySelector("#drawCanvas");
const cursorCanvas = document.querySelector("#cursorCanvas");
const drawCtx = drawCanvas.getContext("2d");
const cursorCtx = cursorCanvas.getContext("2d");
const stage = document.querySelector("#stage");
const welcome = document.querySelector("#welcome");
const welcomeMessage = document.querySelector("#welcomeMessage");
const loading = document.querySelector("#loading");
const loadingText = document.querySelector("#loadingText");
const hint = document.querySelector("#hint");
const startButton = document.querySelector("#startButton");
const statusPill = document.querySelector("#statusPill");
const statusText = document.querySelector("#statusText");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const clearButton = document.querySelector("#clearButton");
const saveButton = document.querySelector("#saveButton");
const sizeUpButton = document.querySelector("#sizeUpButton");
const sizeDisplay = document.querySelector("#sizeDisplay");
const sizeSlider = document.querySelector("#sizeSlider");
const effectButton = document.querySelector("#effectButton");
const galleryButton = document.querySelector("#galleryButton");
const galleryModal = document.querySelector("#galleryModal");
const galleryClose = document.querySelector("#galleryClose");
const galleryGrid = document.querySelector("#galleryGrid");
const opacityUpButton = document.querySelector("#opacityUpButton");
const opacityDisplay = document.querySelector("#opacityDisplay");
const opacitySlider = document.querySelector("#opacitySlider");
const shapeButton = document.querySelector("#shapeButton");
const gestureToast = document.querySelector("#gestureToast");
const snapshotButton = document.querySelector("#snapshotButton");
const recordButton = document.querySelector("#recordButton");
const textButton = document.querySelector("#textButton");
const textModal = document.querySelector("#textModal");
const textClose = document.querySelector("#textClose");
const recognizeTextButton = document.querySelector("#recognizeTextButton");
const recognizedText = document.querySelector("#recognizedText");
const textStatus = document.querySelector("#textStatus");

let hands = null;
let stream = null;
let trackingReady = false;
let trackingStarting = false;
let animationId = 0;
let processing = false;
let tool = "brush";
let color = "#ffffff";
let brushSize = 7;
let brushEffect = "neon";
let opacity = 1;
let shapeMode = "freehand";
let shapeStart = null;
let gestureCooldownUntil = 0;
let openPalmSince = 0;
let openPalmCleared = false;
let lastGestureName = "";
const EFFECTS = ["normal", "glow", "neon", "marker", "pencil"];
const SHAPES = ["freehand", "line", "rectangle", "circle"];
let eraserSize = 38;
let strokes = [];
let redoStack = [];
let activeStroke = null;
let smoothedPoint = null;
let started = false;
let selectedAirControl = null;
let fistHeld = false;
let drawPaused = false;
let uiInteractionLock = false;
let recording = false;
let mediaRecorder = null;
let recordingChunks = [];
let recordingCanvas = null;
let recordingCtx = null;
let recordingFrameId = 0;
let tesseractLoading = null;

function setStatus(text, live = false) {
  statusText.textContent = text;
  statusPill.classList.toggle("live", live);
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function showLoading(text) {
  loadingText.textContent = text;
  loading.style.display = "grid";
  loading.hidden = false;
}

function hideLoading() {
  loading.hidden = true;
  loading.style.display = "none";
}

function resizeCanvases() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const canvas of [drawCanvas, cursorCanvas]) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cursorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function canvasPoint(landmark) {
  const rect = stage.getBoundingClientRect();
  const videoWidth = video.videoWidth || rect.width;
  const videoHeight = video.videoHeight || rect.height;

  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const displayedWidth = videoWidth * scale;
  const displayedHeight = videoHeight * scale;
  const offsetX = (rect.width - displayedWidth) / 2;
  const offsetY = (rect.height - displayedHeight) / 2;

  const cameraX = landmark.x * displayedWidth + offsetX;
  const cameraY = landmark.y * displayedHeight + offsetY;

  return {
    x: rect.width - cameraX,
    y: cameraY
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFist(hand) {
  const wrist = hand[0];
  const palm = Math.max(distance(wrist, hand[9]), 0.001);
  const fingertips = [8, 12, 16, 20];
  const folded = fingertips.every(i => distance(hand[i], wrist) / palm < 1.35);
  const thumbFolded = distance(hand[4], hand[5]) / palm < 0.85;
  return folded && thumbFolded;
}

function isPointInsideRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom;
}

let hoveredControl = null;
let dwellControl = null;
let dwellStartedAt = 0;
let lastAirSelectionAt = 0;
const CONTROL_DWELL_MS = 650; // Gesture controls: index, fist, peace, thumb-up, pinch, open palm

function getAirControlAt(point) {
  const controls = document.querySelectorAll(".controls button");
  const stageRect = stage.getBoundingClientRect();

  for (const button of controls) {
    if (button.disabled || button.offsetParent === null) continue;
    const rect = button.getBoundingClientRect();
    const localRect = {
      left: rect.left - stageRect.left,
      right: rect.right - stageRect.left,
      top: rect.top - stageRect.top,
      bottom: rect.bottom - stageRect.top
    };
    if (isPointInsideRect(point, localRect)) return button;
  }
  return null;
}

function updateAirControlHover(button) {
  if (hoveredControl === button) return;
  if (hoveredControl) hoveredControl.classList.remove("air-hover");
  hoveredControl = button;
  if (hoveredControl) hoveredControl.classList.add("air-hover");
}

function clearAirControlHover() {
  if (hoveredControl) hoveredControl.classList.remove("air-hover");
  hoveredControl = null;
  dwellControl = null;
  dwellStartedAt = 0;
}

function activateAirControl(button) {
  if (!button || button.disabled) return;
  const now = performance.now();
  if (now - lastAirSelectionAt < 500) return;

  // Selecting a control is always a hard pen-up event.
  endStroke();
  smoothedPoint = null;
  uiInteractionLock = true;

  lastAirSelectionAt = now;
  button.click();
  button.classList.remove("air-hover");
  button.classList.add("air-selected");
  setTimeout(() => button.classList.remove("air-selected"), 180);
}

function updateAirControlDwell(control) {
  if (!control) {
    dwellControl = null;
    dwellStartedAt = 0;
    selectedAirControl = null;
    return false;
  }

  if (selectedAirControl === control) return false;

  if (dwellControl !== control) {
    dwellControl = control;
    dwellStartedAt = performance.now();
    return false;
  }

  if (performance.now() - dwellStartedAt >= CONTROL_DWELL_MS) {
    activateAirControl(control);
    selectedAirControl = control;
    dwellControl = null;
    return true;
  }

  return false;
}

function drawCursor(point, active) {
  const rect = stage.getBoundingClientRect();
  cursorCtx.clearRect(0, 0, rect.width, rect.height);
  if (!point) return;
  const size = tool === "eraser" ? eraserSize : brushSize;
  cursorCtx.beginPath();
  cursorCtx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
  cursorCtx.fillStyle = active
    ? (tool === "eraser" ? "rgba(255,255,255,.12)" : color + "33")
    : "rgba(255,255,255,.05)";
  cursorCtx.fill();
  cursorCtx.lineWidth = 2;
  cursorCtx.strokeStyle = active
    ? (tool === "eraser" ? "#fff" : color)
    : "rgba(255,255,255,.55)";
  cursorCtx.stroke();
}

function beginStroke(point) {
  activeStroke = {
    tool,
    color,
    size: tool === "eraser" ? eraserSize : brushSize,
    effect: brushEffect,
    opacity,
    shape: shapeMode,
    points: [point]
  };
  strokes.push(activeStroke);
  redoStack = [];
  updateHistoryButtons();
}

function addPoint(point) {
  if (!activeStroke) return;
  if (activeStroke.shape !== "freehand") {
    activeStroke.points = [activeStroke.points[0], point];
    redraw();
    return;
  }
  const last = activeStroke.points[activeStroke.points.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1.5) {
    activeStroke.points.push(point);
    redraw();
  }
}

function endStroke() {
  activeStroke = null;
  shapeStart = null;
}

function drawSmoothStroke(ctx, points) {
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
}

function drawShape(ctx, stroke) {
  const a = stroke.points[0], b = stroke.points[stroke.points.length - 1];
  ctx.beginPath();
  if (stroke.shape === "line") {
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  } else if (stroke.shape === "rectangle") {
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (stroke.shape === "circle") {
    const radius = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
  }
  ctx.stroke();
}

function redraw() {
  const rect = stage.getBoundingClientRect();
  drawCtx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.lineWidth = stroke.size;
    drawCtx.globalAlpha = stroke.opacity ?? 1;
    if (stroke.tool === "eraser") {
      drawCtx.globalCompositeOperation = "destination-out";
      drawCtx.strokeStyle = "#000";
    } else {
      drawCtx.globalCompositeOperation = "source-over";
      drawCtx.strokeStyle = stroke.color;
      if (stroke.effect === "neon") {
        drawCtx.shadowColor = stroke.color;
        drawCtx.shadowBlur = Math.min(stroke.size * 2.6, 34);
      } else if (stroke.effect === "glow") {
        drawCtx.shadowColor = stroke.color;
        drawCtx.shadowBlur = Math.min(stroke.size * 1.35, 20);
      } else if (stroke.effect === "marker") {
        drawCtx.lineWidth = stroke.size * 1.35;
        drawCtx.globalAlpha *= 0.82;
        drawCtx.shadowBlur = 0;
      } else if (stroke.effect === "pencil") {
        drawCtx.lineWidth = Math.max(1.2, stroke.size * 0.55);
        drawCtx.globalAlpha *= 0.78;
        drawCtx.shadowBlur = 0;
      } else {
        drawCtx.shadowBlur = 0;
      }
    }
    if (stroke.shape && stroke.shape !== "freehand" && stroke.points.length >= 2) {
      drawShape(drawCtx, stroke);
    } else if (stroke.points.length === 1) {
      const p = stroke.points[0];
      drawCtx.beginPath();
      drawCtx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      drawCtx.fillStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
      drawCtx.fill();
    } else {
      drawSmoothStroke(drawCtx, stroke.points);
    }
    drawCtx.restore();
  }
}

function updateHistoryButtons() {
  undoButton.disabled = strokes.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function undo() {
  endStroke();
  if (!strokes.length) return;
  redoStack.push(strokes.pop());
  redraw();
  updateHistoryButtons();
}

function redo() {
  endStroke();
  if (!redoStack.length) return;
  strokes.push(redoStack.pop());
  redraw();
  updateHistoryButtons();
}

function clearDrawing() {
  endStroke();
  if (!strokes.length) return;
  redoStack = strokes.slice();
  strokes = [];
  redraw();
  updateHistoryButtons();
}

function savePng() {
  endStroke();
  const rect = stage.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.round(rect.width * 2);
  out.height = Math.round(rect.height * 2);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.scale(2, 2);
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.opacity ?? 1;
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
    if (stroke.tool !== "eraser") {
      if (stroke.effect === "neon") {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = Math.min(stroke.size * 2.6, 34);
      } else if (stroke.effect === "glow") {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = Math.min(stroke.size * 1.35, 20);
      } else if (stroke.effect === "marker") {
        ctx.lineWidth = stroke.size * 1.35;
        ctx.globalAlpha *= 0.82;
      } else if (stroke.effect === "pencil") {
        ctx.lineWidth = Math.max(1.2, stroke.size * 0.55);
        ctx.globalAlpha *= 0.78;
      }
    }
    if (stroke.shape && stroke.shape !== "freehand" && stroke.points.length >= 2) {
      drawShape(ctx, stroke);
    } else if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.tool === "eraser" ? "#000" : stroke.color;
      ctx.fill();
    } else {
      drawSmoothStroke(ctx, stroke.points);
    }
    ctx.restore();
  }
  ctx.restore();
  const dataUrl = out.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = "airdraw.png";
  link.href = dataUrl;
  link.click();
  saveToGallery(dataUrl);
}

function drawCompositeFrame(ctx, canvasWidth, canvasHeight, includeCursor = true) {
  if (!video.videoWidth || !video.videoHeight) return false;
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(canvasWidth / vw, canvasHeight / vh);
  const dw = vw * scale, dh = vh * scale;
  const ox = (canvasWidth - dw) / 2, oy = (canvasHeight - dh) / 2;
  ctx.save();
  ctx.fillStyle = "#03050a";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.translate(canvasWidth, 0);
  ctx.scale(-1, 1);
  ctx.globalAlpha = 0.76;
  ctx.drawImage(video, ox, oy, dw, dh);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.drawImage(drawCanvas, 0, 0, canvasWidth, canvasHeight);
  if (includeCursor) ctx.drawImage(cursorCanvas, 0, 0, canvasWidth, canvasHeight);
  return true;
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function takeSnapshot() {
  stopDrawingForUI();
  const rect = stage.getBoundingClientRect();
  const out = document.createElement("canvas");
  out.width = Math.max(640, Math.round(rect.width * 2));
  out.height = Math.max(360, Math.round(rect.height * 2));
  const ctx = out.getContext("2d");
  if (!drawCompositeFrame(ctx, out.width, out.height, false)) {
    showGesture("📸 Camera not ready");
    return;
  }
  const dataUrl = out.toDataURL("image/png", 1);
  downloadDataUrl(dataUrl, "airdraw-snapshot.png");
  saveToGallery(dataUrl);
  showGesture("📸 Snapshot saved");
}

function recordingLoop() {
  if (!recording || !recordingCanvas || !recordingCtx) return;
  drawCompositeFrame(recordingCtx, recordingCanvas.width, recordingCanvas.height, true);
  recordingFrameId = requestAnimationFrame(recordingLoop);
}

function chooseRecordingMime() {
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function startRecording() {
  stopDrawingForUI();
  if (recording) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showGesture("🎥 Recording is not supported here");
    return;
  }
  if (!stream || video.readyState < 2) {
    showGesture("🎥 Start the camera first");
    return;
  }
  const rect = stage.getBoundingClientRect();
  recordingCanvas = document.createElement("canvas");
  recordingCanvas.width = Math.max(640, Math.round(rect.width * 1.5));
  recordingCanvas.height = Math.max(360, Math.round(rect.height * 1.5));
  recordingCtx = recordingCanvas.getContext("2d");
  const capture = recordingCanvas.captureStream(30);
  const mimeType = chooseRecordingMime();
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(capture, { mimeType, videoBitsPerSecond: 7000000 })
      : new MediaRecorder(capture);
  } catch {
    showGesture("🎥 Could not start recording");
    recordingCanvas = null;
    recordingCtx = null;
    return;
  }
  recordingChunks = [];
  mediaRecorder.ondataavailable = event => {
    if (event.data?.size) recordingChunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
    const type = mediaRecorder?.mimeType || mimeType || "video/webm";
    const blob = new Blob(recordingChunks, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "airdraw-session.webm";
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    recordingChunks = [];
  };
  mediaRecorder.start(1000);
  recording = true;
  recordButton.textContent = "■";
  recordButton.title = "Stop recording";
  recordButton.classList.add("recording");
  showGesture("🔴 Recording started");
  recordingLoop();
}

function stopRecording() {
  if (!recording || !mediaRecorder) return;
  recording = false;
  cancelAnimationFrame(recordingFrameId);
  mediaRecorder.stop();
  recordButton.textContent = "●";
  recordButton.title = "Record session";
  recordButton.classList.remove("recording");
  showGesture("🎥 Recording saved");
  mediaRecorder = null;
  recordingCanvas = null;
  recordingCtx = null;
}

function openTextRecognition() {
  stopDrawingForUI();
  recognizedText.value = "";
  textStatus.textContent = "Draw a letter or word with ☝️, then press Recognize.";
  textModal.hidden = false;
}

function closeTextRecognition() {
  textModal.hidden = true;
}

function renderWritingCanvas() {
  const source = document.createElement("canvas");
  const rect = stage.getBoundingClientRect();
  source.width = Math.max(900, Math.round(rect.width * 2));
  source.height = Math.max(500, Math.round(rect.height * 2));
  const ctx = source.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, source.width, source.height);
  ctx.save();
  ctx.scale(2, 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.points?.length || stroke.tool === "eraser") continue;
    ctx.save();
    ctx.lineWidth = Math.max(stroke.size, 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#111";
    ctx.shadowBlur = 0;
    if (stroke.shape && stroke.shape !== "freehand" && stroke.points.length >= 2) {
      drawShape(ctx, stroke);
    } else if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(stroke.size / 2, 4), 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
    } else {
      drawSmoothStroke(ctx, stroke.points);
    }
    ctx.restore();
  }
  ctx.restore();
  return source;
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Text recognition library could not be loaded."));
    document.head.appendChild(script);
  });
  return tesseractLoading;
}

async function recognizeAirText() {
  stopDrawingForUI();
  if (!strokes.some(stroke => stroke.points?.length && stroke.tool !== "eraser")) {
    textStatus.textContent = "Draw something first.";
    return;
  }
  recognizeTextButton.disabled = true;
  textStatus.textContent = "Loading handwriting recognition…";
  try {
    const Tesseract = await loadTesseract();
    const source = renderWritingCanvas();
    const result = await Tesseract.recognize(source, "eng", {
      logger: info => {
        if (info.status === "recognizing text" && typeof info.progress === "number") {
          textStatus.textContent = "Recognizing… " + Math.round(info.progress * 100) + "%";
        } else if (info.status) {
          textStatus.textContent = "Recognizing… " + info.status;
        }
      }
    });
    const text = (result?.data?.text || "").replace(/\s+/g, " ").trim();
    recognizedText.value = text || "No text recognized. Try larger, clearer block letters.";
    textStatus.textContent = text ? "Recognition complete — you can edit or copy the result." : "No text recognized. Try larger, clearer block letters.";
  } catch (error) {
    console.error("Air writing recognition error:", error);
    textStatus.textContent = "Recognition could not load. Check your internet connection and try again.";
  } finally {
    recognizeTextButton.disabled = false;
  }
}

function updateSizeDisplay() {
  sizeDisplay.textContent = brushSize;
  if (sizeSlider) sizeSlider.value = brushSize;
}

function updateOpacityDisplay() {
  const value = Math.round(opacity * 100);
  opacityDisplay.textContent = value;
  if (opacitySlider) opacitySlider.value = value;
}

function changeOpacity(delta) {
  stopDrawingForUI();
  opacity = Math.max(0.1, Math.min(1, opacity + delta));
  updateOpacityDisplay();
}

function cycleShape() {
  stopDrawingForUI();
  shapeMode = SHAPES[(SHAPES.indexOf(shapeMode) + 1) % SHAPES.length];
  const labels = {freehand:"○", line:"╱", rectangle:"□", circle:"◯"};
  shapeButton.textContent = labels[shapeMode];
  shapeButton.title = `Shape: ${shapeMode}`;
  showGesture(`Shape: ${shapeMode}`);
}

function showGesture(message) {
  gestureToast.textContent = message;
  gestureToast.hidden = false;
  clearTimeout(showGesture.timer);
  showGesture.timer = setTimeout(() => gestureToast.hidden = true, 900);
}

function changeBrushSize(delta) {
  stopDrawingForUI();
  brushSize = Math.max(2, Math.min(32, brushSize + delta));
  updateSizeDisplay();
  redraw();
}

function cycleEffect() {
  stopDrawingForUI();
  const index = EFFECTS.indexOf(brushEffect);
  brushEffect = EFFECTS[(index + 1) % EFFECTS.length];
  const labels = {normal:"•", glow:"◌", neon:"✦", marker:"▰", pencil:"✎"};
  effectButton.textContent = labels[brushEffect];
  effectButton.title = `Brush style: ${brushEffect}`;
  effectButton.setAttribute("aria-label", `Brush style: ${brushEffect}`);
}

function galleryItems() {
  try {
    return JSON.parse(localStorage.getItem("airdraw-gallery") || "[]");
  } catch {
    return [];
  }
}

function saveToGallery(dataUrl) {
  const items = galleryItems();
  items.unshift({ id: Date.now(), dataUrl });
  try {
    localStorage.setItem("airdraw-gallery", JSON.stringify(items.slice(0, 12)));
  } catch {
    // Storage can be full; PNG download still succeeds.
  }
}

function renderGallery() {
  const items = galleryItems();
  galleryGrid.innerHTML = "";
  if (!items.length) {
    galleryGrid.innerHTML = '<div class="gallery-empty">No saved drawings yet.<br>Save a drawing to add it here.</div>';
    return;
  }
  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "gallery-card";
    card.innerHTML = `<img src="${item.dataUrl}" alt="Saved AirDraw drawing"><div class="gallery-card-actions"><button data-index="${index}" class="gallery-download">Download</button><button data-remove="${index}" class="gallery-delete">Delete</button></div>`;
    galleryGrid.appendChild(card);
  });
}

function openGallery() {
  stopDrawingForUI();
  renderGallery();
  galleryModal.hidden = false;
}

function closeGallery() {
  galleryModal.hidden = true;
}

galleryGrid.addEventListener("click", event => {
  const download = event.target.closest("[data-index]");
  const remove = event.target.closest("[data-remove]");
  const items = galleryItems();
  if (download) {
    const item = items[Number(download.dataset.index)];
    if (!item) return;
    const link = document.createElement("a");
    link.download = "airdraw-gallery.png";
    link.href = item.dataUrl;
    link.click();
  }
  if (remove) {
    items.splice(Number(remove.dataset.remove), 1);
    localStorage.setItem("airdraw-gallery", JSON.stringify(items));
    renderGallery();
  }
});

function fingerExtended(hand, tip, pip, wrist = 0) {
  return distance(hand[tip], hand[wrist]) > distance(hand[pip], hand[wrist]) * 1.12;
}

function isPinch(hand) {
  const palm = Math.max(distance(hand[0], hand[9]), 0.001);
  return distance(hand[4], hand[8]) / palm < 0.42;
}

function isOpenPalm(hand) {
  return [8, 12, 16, 20].every((tip, i) => fingerExtended(hand, tip, [6, 10, 14, 18][i]));
}

function isIndexOnly(hand) {
  const indexUp = fingerExtended(hand, 8, 6);
  const middleDown = !fingerExtended(hand, 12, 10);
  const ringDown = !fingerExtended(hand, 16, 14);
  const pinkyDown = !fingerExtended(hand, 20, 18);
  return indexUp && middleDown && ringDown && pinkyDown;
}

function isThumbUpGesture(hand) {
  const wrist = hand[0], thumb = hand[4];
  const palm = Math.max(distance(wrist, hand[9]), 0.001);
  const otherFingersDown =
    !fingerExtended(hand, 8, 6) &&
    !fingerExtended(hand, 12, 10) &&
    !fingerExtended(hand, 16, 14) &&
    !fingerExtended(hand, 20, 18);
  return thumb.y < hand[3].y &&
    thumb.y < hand[6].y &&
    distance(thumb, wrist) / palm > 1.25 &&
    otherFingersDown;
}

function handleGesture(hand) {
  const now = performance.now();

  if (isPinch(hand)) {
    openPalmSince = 0;
    openPalmCleared = false;
    return "pinch";
  }

  if (isFist(hand)) {
    openPalmSince = 0;
    openPalmCleared = false;
    return "fist";
  }

  if (isOpenPalm(hand)) {
    endStroke();
    drawPaused = true;
    if (!openPalmSince) openPalmSince = now;
    if (!openPalmCleared && now - openPalmSince >= 1500) {
      clearDrawing();
      showGesture("🖐️ Canvas cleared");
      openPalmCleared = true;
      gestureCooldownUntil = now + 800;
    } else if (lastGestureName !== "open") {
      showGesture("🖐️ Open palm — paused");
    }
    lastGestureName = "open";
    return "open";
  }

  openPalmSince = 0;
  openPalmCleared = false;

  if (now < gestureCooldownUntil) return lastGestureName;

  if (isThumbUpGesture(hand)) {
    stopDrawingForUI();
    undo();
    showGesture("👍 Undo");
    gestureCooldownUntil = now + 900;
    lastGestureName = "thumb";
    return "thumb";
  }

  if (isIndexOnly(hand)) {
    lastGestureName = "index";
    return "index";
  }

  lastGestureName = "";
  return "other";
}

function processResults(results) {
  cursorCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
  const hand = results.multiHandLandmarks?.[0];

  if (hand) setStatus("Hand detected", true);
  else if (trackingReady) setStatus("Tracking ready — show your hand", true);

  if (!hand) {
    smoothedPoint = null;
    endStroke();
    clearAirControlHover();
    drawPaused = false;
    openPalmSince = 0;
    openPalmCleared = false;
    lastGestureName = "";
    return;
  }

  const raw = canvasPoint(hand[8]);
  smoothedPoint = raw;

  const control = getAirControlAt(smoothedPoint);
  updateAirControlHover(control);

  const gesture = handleGesture(hand);

  // Pinch is the intentional "select/control" gesture. Only pinch can
  // activate air-dwell controls; simply moving over a button no longer
  // selects it accidentally.
  const selecting = gesture === "pinch";
  const selected = selecting ? updateAirControlDwell(control) : false;

  drawCursor(smoothedPoint, selecting || Boolean(control));

  if (!selecting) {
    clearAirControlHover();
    dwellControl = null;
    dwellStartedAt = 0;
    selectedAirControl = null;
  }

  // Fist and open palm are strict pause gestures.
  if (gesture === "fist" || gesture === "open") {
    endStroke();
    drawPaused = true;
    return;
  }

  // Gesture-based undo is a strict non-drawing action.
  if (gesture === "thumb") {
    endStroke();
    drawPaused = true;
    return;
  }

  drawPaused = false;

  // Pinch controls the UI but never draws.
  if (selecting || selected) {
    endStroke();
    return;
  }

  // Only an index-finger-only pose draws.
  if (gesture !== "index") {
    endStroke();
    return;
  }

  if (uiInteractionLock) {
    endStroke();
    smoothedPoint = null;
    uiInteractionLock = false;
    return;
  }

  if (!activeStroke) beginStroke(smoothedPoint);
  else addPoint(smoothedPoint);
}

function loadHandsLibrary() {
  if (window.Hands) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mediapipe-hands]');
    if (existing) {
      if (existing.dataset.loaded === "true" && window.Hands) {
        resolve();
        return;
      }
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Hand tracking library could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js";
    script.crossOrigin = "anonymous";
    script.dataset.mediapipeHands = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Hand tracking library could not be loaded. Check your internet connection."));
    };
    document.head.appendChild(script);
  });
}

function closeHands() {
  if (!hands) return;
  try {
    if (typeof hands.close === "function") hands.close();
  } catch (error) {
    console.warn("Could not close MediaPipe Hands cleanly:", error);
  }
  hands = null;
  trackingReady = false;
}

function setupHands(assetBase) {
  if (!window.Hands) throw new Error("Hand tracking library did not load.");

  hands = new window.Hands({
    locateFile: file => assetBase + file
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55
  });

  hands.onResults(processResults);
}

async function startHandTracking() {
  const assetBases = [
    "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/",
    "https://unpkg.com/@mediapipe/hands@0.4.1675469240/"
  ];

  let lastError = null;

  await withTimeout(
    loadHandsLibrary(),
    15000,
    "Hand tracking library timed out."
  );

  for (const assetBase of assetBases) {
    closeHands();
    try {
      setupHands(assetBase);
      await withTimeout(
        hands.send({ image: video }),
        20000,
        "Hand model initialization timed out."
      );

      trackingReady = true;
      return;
    } catch (error) {
      lastError = error;
      console.error("MediaPipe initialization failed:", assetBase, error);
      closeHands();
    }
  }

  throw lastError || new Error("Hand model could not be initialized.");
}

async function processFrame() {
  if (!hands || !stream || video.readyState < 2 || processing) return;
  processing = true;
  try {
    await hands.send({ image: video });
  } catch (error) {
    console.error("Hand tracking frame error:", error);
  } finally {
    processing = false;
  }
}

function loop() {
  processFrame();
  animationId = requestAnimationFrame(loop);
}

async function start() {
  if (trackingStarting) return;
  if (started && stream && trackingReady) return;

  if (!started) {
    started = true;
    startButton.disabled = true;
    welcome.hidden = true;
    showLoading("Requesting camera…");
    setStatus("Requesting camera…");
  }

  try {
    if (!window.isSecureContext && location.hostname !== "localhost") {
      throw new Error("Camera access requires HTTPS. Open the GitHub Pages address.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not provide camera access.");
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (cameraError) {
        if (cameraError?.name === "OverconstrainedError" || cameraError?.name === "NotReadableError") {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw cameraError;
        }
      }

      video.srcObject = stream;
      video.muted = true;
      video.defaultMuted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("playsinline", "");
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1 && video.videoWidth > 0) return resolve();
        const timer = setTimeout(() => reject(new Error("Camera video did not become ready.")), 8000);
        video.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Camera video failed to load.")); }, { once: true });
      });
      await video.play();
      resizeCanvases();

      hideLoading();
      hint.hidden = false;
      setStatus("Camera live", true);
    }

    if (!trackingReady) {
      trackingStarting = true;
      processing = false;
      showLoading("Loading hand tracking model…");
      try {
        await startHandTracking();
        hideLoading();
        hint.hidden = false;
        setStatus("Hand tracking ready — show your hand", true);
        startButton.textContent = "AirDraw running";
        startButton.disabled = true;
      } catch (trackingError) {
        console.error("Hand tracking startup error:", trackingError);
        closeHands();
        hideLoading();
        hint.hidden = false;
        setStatus("Camera live — tracking unavailable", true);
        startButton.textContent = "Retry tracking";
        startButton.disabled = false;
        started = true;
        return;
      } finally {
        trackingStarting = false;
      }
    }

    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  } catch (error) {
    console.error("AirDraw camera error:", error);
    cancelAnimationFrame(animationId);

    if (error?.name === "NotAllowedError") {
      welcomeMessage.textContent = "Camera permission was blocked. Allow camera access for this site, then tap Start AirDraw again.";
    } else if (error?.name === "NotFoundError") {
      welcomeMessage.textContent = "No camera was found on this device.";
    } else if (error?.name === "NotReadableError") {
      welcomeMessage.textContent = "The camera is busy or unavailable. Close other apps using the camera, then try again.";
    } else if (error?.name === "SecurityError") {
      welcomeMessage.textContent = "The browser blocked camera access. Open AirDraw directly from its HTTPS GitHub Pages address.";
    } else if (error?.name === "OverconstrainedError") {
      welcomeMessage.textContent = "The requested camera mode is unavailable. Tap Start AirDraw to retry with the device camera.";
    } else {
      welcomeMessage.textContent = `Could not start the camera: ${error?.message || "unknown error"}`;
    }

    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    hideLoading();
    welcome.hidden = false;
    startButton.textContent = "Start AirDraw";
    startButton.disabled = false;
    started = false;
    trackingReady = false;
    trackingStarting = false;
    closeHands();
    setStatus("Camera unavailable");
  }
}

function stop() {
  cancelAnimationFrame(animationId);
  closeHands();
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  trackingReady = false;
  trackingStarting = false;
  setStatus("Camera off");
}

function stopDrawingForUI() {
  // Physical touch/mouse clicks on the toolbar must also break the stroke.
  endStroke();
  smoothedPoint = null;
  uiInteractionLock = true;
}

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => {
    stopDrawingForUI();
    document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    tool = button.dataset.tool;
  });
});

document.querySelectorAll(".color").forEach(button => {
  button.addEventListener("click", () => {
    stopDrawingForUI();
    document.querySelectorAll(".color").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    color = button.dataset.color;
    if (tool === "eraser") document.querySelector('[data-tool="brush"]').click();
  });
});

snapshotButton.addEventListener("click", takeSnapshot);
recordButton.addEventListener("click", () => recording ? stopRecording() : startRecording());
textButton.addEventListener("click", openTextRecognition);
textClose.addEventListener("click", closeTextRecognition);
recognizeTextButton.addEventListener("click", recognizeAirText);
document.getElementById("copyTextButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(recognizedText.value);
    showGesture("📋 Text copied");
  } catch {
    recognizedText.select();
    document.execCommand("copy");
    showGesture("📋 Text copied");
  }
});
textModal.addEventListener("click", event => {
  if (event.target === textModal) closeTextRecognition();
});
startButton.addEventListener("click", start);
undoButton.addEventListener("click", () => { stopDrawingForUI(); undo(); });
redoButton.addEventListener("click", () => { stopDrawingForUI(); redo(); });
clearButton.addEventListener("click", () => { stopDrawingForUI(); clearDrawing(); });
saveButton.addEventListener("click", () => { stopDrawingForUI(); savePng(); });
opacityUpButton.addEventListener("click", () => changeOpacity(0.1));
opacitySlider?.addEventListener("input", event => {
  stopDrawingForUI();
  opacity = Number(event.target.value) / 100;
  updateOpacityDisplay();
});
shapeButton.addEventListener("click", cycleShape);
updateOpacityDisplay();
sizeSlider?.addEventListener("input", event => {
  stopDrawingForUI();
  brushSize = Number(event.target.value);
  updateSizeDisplay();
});
sizeUpButton.addEventListener("click", () => changeBrushSize(2));
effectButton.addEventListener("click", cycleEffect);
galleryButton.addEventListener("click", openGallery);
galleryClose.addEventListener("click", closeGallery);
galleryModal.addEventListener("click", event => {
  if (event.target === galleryModal) closeGallery();
});
updateSizeDisplay();

window.addEventListener("resize", resizeCanvases);
window.addEventListener("beforeunload", () => { try { if (recording) mediaRecorder?.stop(); } catch {} stop(); });

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => start(), 250);
});
