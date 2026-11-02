const THREE = window.THREE || null;

(() => {
  "use strict";
  let canvas = document.getElementById("jess-canvas");
  const visualCanvas = document.getElementById("jess-visualizer");
  const visualCtx = visualCanvas?.getContext("2d", { alpha: true }) || null;
  const speech = document.getElementById("speech");
  const speechText = document.getElementById("speech-text");
  const status = document.getElementById("status");
  const statusLabel = document.getElementById("status-label");
  const character = document.getElementById("character");
  const liveStates = new Set(["idle", "listening", "thinking", "speaking", "interrupted", "muted", "error", "walk", "run", "stride", "think", "happy", "celebrate", "jump", "tired"]);
  const allowedConnections = new Set(["disconnected", "connecting", "connected", "error"]);
  let visualState = { connection: "disconnected", state: "idle", inputLevel: 0, outputLevel: 0 };
  let activeState = "idle", renderer = null, scene = null, camera = null, avatar = null, headRig = null;
  let leftArm = null, rightArm = null, leftEye = null, rightEye = null, mouth = null, mouthLip = null;
  let elapsed = 0, visualPhase = 0, frameHandle = 0;
  let speechTimer = null, idleFidgetTimer = null, activationWatchdogTimer = null;
  let nextBlinkAt = 2.5, blink = 0, alive = true;
  let pointerStart = null, lastPointer = null, isDragging = false, suppressNextClick = false;
  let clock = null, sphereGeometry = null;
  let skin = null, skinLight = null, hair = null, hairHighlight = null;
  let blazer = null, blazerLight = null, blouse = null, blouseLight = null;
  let gold = null, white = null, iris = null, pupil = null, eyeGlint = null;
  let brow = null, lip = null, mouthInterior = null, mouthTongue = null;
  let lastFrameTimestamp = 0;
  let force2DMode = false;

  const mat = (color, roughness = 0.72, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  function initializeMaterials() {
    if (!THREE || typeof THREE.WebGLRenderer !== "function") throw new Error("Three.js or WebGL is unavailable; using the lightweight avatar fallback.");
    clock = new THREE.Clock();
    // 24x16 geometry saves 75% vertices compared to 48x32 without visible difference at 130px size
    sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
    skin = mat(0xc88f72, 0.72); skinLight = mat(0xd9a58b, 0.66);
    hair = mat(0x211922, 0.48); hairHighlight = mat(0x382735, 0.48);
    blazer = mat(0x202b3e, 0.65); blazerLight = mat(0x344258, 0.58);
    blouse = mat(0x8f2429, 0.6); blouseLight = mat(0xb33a3d, 0.55);
    gold = mat(0xd8b36a, 0.32, 0.58); white = mat(0xfff7f1, 0.34);
    iris = mat(0x4e322a, 0.34); pupil = mat(0x130f15, 0.2);
    eyeGlint = new THREE.MeshBasicMaterial({ color: 0xffffff });
    brow = mat(0x38232a, 0.8); lip = mat(0x702b37, 0.5);
    mouthInterior = mat(0x260e17, 0.4); mouthTongue = mat(0xb44d60, 0.5);
  }

  function level(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  function ellipsoid(parent, position, scale, material, geometry = sphereGeometry) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }
  function tube(parent, points, radius, material, segments = 12) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), material);
    parent.add(mesh);
    return mesh;
  }
  function panel(parent, points, material, z = 0.405) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.position.z = z;
    parent.add(mesh);
    return mesh;
  }
  function createEye(parent, side) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.18, 0.10, 0.365);
    parent.add(eye);
    ellipsoid(eye, [0, 0, 0], [0.092, 0.078, 0.036], white);
    ellipsoid(eye, [side * 0.009, -0.004, 0.031], [0.047, 0.053, 0.021], iris);
    ellipsoid(eye, [side * 0.009, -0.003, 0.047], [0.025, 0.033, 0.012], pupil);
    ellipsoid(eye, [-0.012, 0.020, 0.059], [0.012, 0.014, 0.008], eyeGlint);
    return eye;
  }
  function createArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.52, 1.25, 0.025);
    arm.rotation.z = side * 0.10;
    ellipsoid(arm, [side * 0.035, -0.19, 0], [0.145, 0.27, 0.145], blazer);
    ellipsoid(arm, [side * 0.078, -0.46, 0.045], [0.118, 0.25, 0.12], blazerLight);
    ellipsoid(arm, [side * 0.095, -0.66, 0.065], [0.105, 0.12, 0.105], skinLight);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.014, 6, 14), gold);
    cuff.position.set(side * 0.084, -0.545, 0.045);
    cuff.scale.set(1, 0.9, 0.75);
    arm.add(cuff);
    avatar.add(arm);
    return arm;
  }
  function createHead() {
    headRig = new THREE.Group();
    headRig.position.y = 2.12;
    avatar.add(headRig);
    ellipsoid(headRig, [0, 0.04, -0.115], [0.56, 0.75, 0.46], hair);
    ellipsoid(headRig, [0, 0.07, 0.005], [0.505, 0.66, 0.405], skin);
    ellipsoid(headRig, [0, 0.39, -0.005], [0.545, 0.37, 0.438], hair);
    ellipsoid(headRig, [-0.47, -0.03, 0.005], [0.13, 0.48, 0.31], hair);
    ellipsoid(headRig, [0.47, -0.03, 0.005], [0.13, 0.48, 0.31], hair);
    tube(headRig, [[-0.43, 0.43, 0.25], [-0.37, 0.20, 0.325], [-0.28, 0.02, 0.31]], 0.062, hairHighlight, 10);
    tube(headRig, [[0.42, 0.43, 0.25], [0.38, 0.17, 0.325], [0.29, -0.05, 0.31]], 0.062, hairHighlight, 10);
    tube(headRig, [[-0.36, 0.46, 0.31], [-0.27, 0.29, 0.363], [-0.10, 0.31, 0.384]], 0.095, hair, 10);
    tube(headRig, [[-0.18, 0.48, 0.34], [-0.05, 0.28, 0.39], [0.10, 0.30, 0.38]], 0.085, hairHighlight, 10);
    tube(headRig, [[0.02, 0.48, 0.34], [0.22, 0.27, 0.36], [0.33, 0.34, 0.31]], 0.09, hair, 10);
    for (const side of [-1, 1]) {
      ellipsoid(headRig, [side * 0.49, -0.015, 0.015], [0.105, 0.15, 0.075], skinLight);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.012, 6, 16), gold);
      hoop.position.set(side * 0.50, -0.13, 0.075);
      headRig.add(hoop);
    }
    leftEye = createEye(headRig, -1);
    rightEye = createEye(headRig, 1);
    tube(headRig, [[-0.285, 0.226, 0.354], [-0.19, 0.26, 0.375], [-0.095, 0.23, 0.36]], 0.025, brow, 10);
    tube(headRig, [[0.095, 0.23, 0.36], [0.19, 0.26, 0.375], [0.285, 0.226, 0.354]], 0.025, brow, 10);
    ellipsoid(headRig, [0, -0.01, 0.365], [0.056, 0.105, 0.061], skinLight);
    ellipsoid(headRig, [0, -0.074, 0.393], [0.078, 0.045, 0.048], skinLight);
    ellipsoid(headRig, [-0.037, -0.078, 0.404], [0.025, 0.022, 0.015], skin);
    mouth = ellipsoid(headRig, [0, -0.225, 0.36], [0.112, 0.035, 0.022], mouthInterior);
    mouth.userData.closedScaleY = mouth.scale.y;
    ellipsoid(headRig, [0, -0.249, 0.378], [0.052, 0.008, 0.009], mouthTongue);
    mouthLip = tube(headRig, [[-0.12, -0.214, 0.375], [-0.06, -0.253, 0.382], [0, -0.26, 0.383], [0.06, -0.253, 0.382], [0.12, -0.214, 0.375]], 0.012, lip, 12);
  }
  function createAvatar() {
    avatar = new THREE.Group();
    avatar.position.y = -0.08;
    scene.add(avatar);
    ellipsoid(avatar, [0, 1.50, 0], [0.18, 0.34, 0.18], skin);
    ellipsoid(avatar, [0, 0.69, -0.02], [0.60, 0.78, 0.38], blazer);
    ellipsoid(avatar, [0, 1.10, 0.07], [0.37, 0.36, 0.36], blouse);
    ellipsoid(avatar, [0, 1.30, 0.10], [0.34, 0.19, 0.34], skinLight);
    panel(avatar, [[-0.40, 1.42], [-0.045, 1.16], [-0.23, 0.62]], blazerLight, 0.36);
    panel(avatar, [[0.40, 1.42], [0.045, 1.16], [0.23, 0.62]], blazerLight, 0.36);
    panel(avatar, [[-0.17, 1.37], [0, 1.12], [0.15, 1.38]], white, 0.39);
    panel(avatar, [[-0.07, 1.15], [0, 1.26], [0.07, 1.15], [0.04, 0.79], [0, 0.71], [-0.04, 0.79]], blouseLight, 0.405);
    ellipsoid(avatar, [0, 0.42, 0.372], [0.018, 0.018, 0.012], gold);
    ellipsoid(avatar, [0, 0.26, 0.358], [0.018, 0.018, 0.012], gold);
    ellipsoid(avatar, [-0.43, 1.20, 0], [0.28, 0.26, 0.33], blazer);
    ellipsoid(avatar, [0.43, 1.20, 0], [0.28, 0.26, 0.33], blazer);
    leftArm = createArm(-1); rightArm = createArm(1); createHead();
    tube(avatar, [[-0.60, 1.20, 0.20], [-0.43, 1.34, 0.24], [-0.20, 1.37, 0.30]], 0.014, gold, 10);
    tube(avatar, [[0.60, 1.20, 0.20], [0.43, 1.34, 0.24], [0.20, 1.37, 0.30]], 0.014, gold, 10);
  }
  function statusMode() {
    if (visualState.connection === "error" || visualState.state === "error") return "error";
    if (visualState.connection === "connecting") return "connecting";
    if (visualState.connection === "connected" && visualState.state === "muted") return "muted";
    if (visualState.connection === "connected") return "connected";
    return "disconnected";
  }
  function updateStatus() {
    const mode = statusMode();
    status.dataset.status = mode;
    if (mode === "connecting") statusLabel.textContent = "Connecting to Jess…";
    else if (mode === "error") statusLabel.textContent = "Connection error · click to retry";
    else if (mode === "muted") statusLabel.textContent = "Microphone muted";
    else if (mode === "connected" && visualState.state === "speaking") statusLabel.textContent = "Jess is speaking";
    else if (mode === "connected" && visualState.state === "thinking") statusLabel.textContent = "Jess is thinking";
    else if (mode === "connected") statusLabel.textContent = "Connected · listening";
    else statusLabel.textContent = "Click Jess to talk";
  }
  function applyState(next) {
    activeState = liveStates.has(next) ? next : "idle";
    if (idleFidgetTimer !== null) window.clearTimeout(idleFidgetTimer);
    idleFidgetTimer = null;
    if (!leftArm || !rightArm || !headRig) return;
    if (activeState === "thinking" || activeState === "think") {
      leftArm.userData.targetZ = -0.08; rightArm.userData.targetZ = -2.08; headRig.userData.targetZ = 0.12;
    } else if (activeState === "celebrate" || activeState === "happy" || activeState === "jump") {
      leftArm.userData.targetZ = -2.25; rightArm.userData.targetZ = 2.25; headRig.userData.targetZ = -0.04;
    } else if (activeState === "error" || activeState === "interrupted" || activeState === "tired") {
      leftArm.userData.targetZ = -0.30; rightArm.userData.targetZ = 0.22; headRig.userData.targetZ = 0.15;
    } else if (activeState === "walk" || activeState === "run" || activeState === "stride") {
      leftArm.userData.targetZ = -0.38; rightArm.userData.targetZ = 0.38; headRig.userData.targetZ = 0;
    } else {
      leftArm.userData.targetZ = -0.10; rightArm.userData.targetZ = 0.10;
      headRig.userData.targetZ = activeState === "listening" ? -0.045 : activeState === "speaking" ? -0.015 : 0;
    }
    if (activeState === "idle" && visualState.connection === "disconnected") {
      idleFidgetTimer = window.setTimeout(() => { if (activeState === "idle" && visualState.connection === "disconnected") applyState("walk"); }, 12000 + Math.random() * 8000);
    } else if (activeState === "walk") {
      idleFidgetTimer = window.setTimeout(() => { if (activeState === "walk") applyState("idle"); }, 1700);
    }
  }
  function applyVisualState(payload) {
    if (!payload || typeof payload !== "object" || !allowedConnections.has(payload.connection) || !liveStates.has(payload.state)) return;
    visualState = { connection: payload.connection, state: payload.state, inputLevel: level(payload.inputLevel), outputLevel: level(payload.outputLevel) };
    if (visualState.connection === "connected" || visualState.connection === "error") {
      if (activationWatchdogTimer !== null) window.clearTimeout(activationWatchdogTimer);
      activationWatchdogTimer = null;
    }
    updateStatus();
    if (activeState !== visualState.state) applyState(visualState.state);
  }
  function colorForMode(mode) {
    if (mode === "connecting") return { line: "192,132,252", solid: "#c084fc" };
    if (mode === "connected") return { line: "74,222,128", solid: "#4ade80" };
    if (mode === "muted") return { line: "251,191,36", solid: "#fbbf24" };
    if (mode === "error") return { line: "248,113,113", solid: "#f87171" };
    return { line: "148,163,184", solid: "#94a3b8" };
  }
  function renderVisualizer() {
    if (!visualCtx || !visualCanvas) return;
    visualPhase += 0.055;
    const dpr = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));
    const logicalSize = 130, pixels = Math.round(logicalSize * dpr);
    if (visualCanvas.width !== pixels || visualCanvas.height !== pixels) { visualCanvas.width = pixels; visualCanvas.height = pixels; }
    visualCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    visualCtx.clearRect(0, 0, logicalSize, logicalSize);
    const mode = statusMode(), palette = colorForMode(mode), s = visualState.state;
    const loudness = s === "speaking" ? visualState.outputLevel : visualState.inputLevel;
    const idlePulse = 0.08 + (Math.sin(visualPhase) + 1) * 0.035;
    const connectPulse = mode === "connecting" ? 0.2 + (Math.sin(visualPhase * 2.2) + 1) * 0.09 : 0;
    const thinkingPulse = s === "thinking" ? 0.2 + (Math.sin(visualPhase * 1.8) + 1) * 0.11 : 0;
    const intensity = Math.max(0.08, Math.min(1, s === "speaking" || s === "listening" ? loudness * 2.5 + 0.08 : connectPulse || thinkingPulse || idlePulse));
    const cx = logicalSize / 2, cy = logicalSize / 2;
    const gradient = visualCtx.createRadialGradient(cx, cy, 12, cx, cy, 62);
    gradient.addColorStop(0, "rgba(" + palette.line + "," + (0.12 + intensity * 0.12) + ")");
    gradient.addColorStop(0.66, "rgba(" + palette.line + ",0.05)");
    gradient.addColorStop(1, "rgba(" + palette.line + ",0)");
    visualCtx.fillStyle = gradient; visualCtx.beginPath(); visualCtx.arc(cx, cy, 62, 0, Math.PI * 2); visualCtx.fill();
    const rings = mode === "connected" ? 3 : mode === "connecting" || mode === "error" ? 2 : 1;
    // 48 sample points per ring instead of 96, and zero shadowBlur for ultra-lightweight GPU compositing
    for (let ring = 0; ring < rings; ring += 1) {
      visualCtx.beginPath();
      const radius = 40 + intensity * 4 + ring * 6;
      for (let point = 0; point <= 48; point += 1) {
        const angle = point / 48 * Math.PI * 2;
        const a = Math.sin(angle * (4 + ring) + visualPhase * (ring % 2 ? -1.3 : 1.5));
        const b = Math.cos(angle * (7 + ring) - visualPhase * 1.8);
        const r = radius + (a * 0.65 + b * 0.35) * intensity * (1.8 + ring * 2);
        const x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle);
        if (point === 0) visualCtx.moveTo(x, y); else visualCtx.lineTo(x, y);
      }
      visualCtx.closePath();
      visualCtx.strokeStyle = "rgba(" + palette.line + "," + (mode === "disconnected" ? 0.28 : 0.62 - ring * 0.12) + ")";
      visualCtx.lineWidth = mode === "connected" && s === "speaking" ? 1.6 : 1.0;
      visualCtx.stroke();
    }
  }
  function say(message) {
    window.clearTimeout(speechTimer);
    speechText.textContent = String(message || "").slice(0, 180);
    speech.hidden = false;
    speechTimer = window.setTimeout(() => { speech.hidden = true; }, 4500);
  }
  function requestVoiceActivation(gesture) {
    if (gesture === "toggle" && visualState.connection === "connecting") {
      say("Connecting to Jess… please wait a moment.");
      return;
    }
    const active = visualState.connection === "connected" || visualState.connection === "connecting";
    if (gesture === "mute") say(visualState.state === "muted" ? "Microphone unmuted." : "Microphone muted.");
    else say(active ? "Ending voice chat…" : "Connecting to Jess…");
    if (gesture === "toggle" && !active) {
      if (activationWatchdogTimer !== null) window.clearTimeout(activationWatchdogTimer);
      activationWatchdogTimer = window.setTimeout(() => {
        activationWatchdogTimer = null;
        if (visualState.connection === "connected" || visualState.connection === "error") return;
        visualState = { connection: "error", state: "error", inputLevel: 0, outputLevel: 0 };
        updateStatus(); say("Voice chat did not connect. Click Jess to try again.");
      }, 25000);
    }
    Promise.resolve(window.jessPet?.activateVoice?.(gesture)).then(result => {
      if (!result || result.ok !== true) {
        if (activationWatchdogTimer !== null) window.clearTimeout(activationWatchdogTimer);
        activationWatchdogTimer = null;
        visualState = { connection: "error", state: "error", inputLevel: 0, outputLevel: 0 };
        updateStatus(); say("I couldn't activate voice chat. Ensure Hub-Mind is running.");
      }
    }).catch(error => {
      if (activationWatchdogTimer !== null) window.clearTimeout(activationWatchdogTimer);
      activationWatchdogTimer = null;
      visualState = { connection: "error", state: "error", inputLevel: 0, outputLevel: 0 };
      updateStatus(); say("Voice activation error. Please retry.");
      console.error("[Jess pet] Voice activation failed:", error);
    });
  }
  function drawFallback2D() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));
    const width = canvas.clientWidth || 130, height = canvas.clientHeight || 150;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.scale(dpr, dpr);
    const cx = width / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#202b3e"; ctx.beginPath(); ctx.ellipse(cx, height * .90, width * .35, height * .28, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#211922"; ctx.beginPath(); ctx.ellipse(cx, height * .38, width * .28, height * .32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c88f72"; ctx.beginPath(); ctx.ellipse(cx, height * .36, width * .235, height * .26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#211922"; ctx.beginPath(); ctx.ellipse(cx, height * .22, width * .245, height * .15, 0, Math.PI, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#fff7f1"; ctx.beginPath(); ctx.ellipse(cx + side * width * .09, height * .35, width * .035, height * .025, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4e322a"; ctx.beginPath(); ctx.arc(cx + side * width * .09, height * .35, width * .022, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#702b37"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, height * .45, width * .06, .15, Math.PI - .15); ctx.stroke();
  }
  function resizeRenderer() {
    if (!renderer || !camera || !alive) return;
    const width = Math.max(1, canvas.clientWidth || 130), height = Math.max(1, canvas.clientHeight || 150);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  function animateStep(dt) {
    if (!alive || !renderer || !scene || !camera) return;
    elapsed += dt;
    headRig.rotation.z += ((headRig.userData.targetZ || 0) - headRig.rotation.z) * Math.min(1, dt * 5);
    leftArm.rotation.z += ((leftArm.userData.targetZ ?? -.1) - leftArm.rotation.z) * Math.min(1, dt * 5);
    rightArm.rotation.z += ((rightArm.userData.targetZ ?? .1) - rightArm.rotation.z) * Math.min(1, dt * 5);
    const walking = activeState === "walk" || activeState === "run" || activeState === "stride";
    const energy = activeState === "celebrate" || activeState === "jump" ? .06 : walking ? .045 : .014;
    avatar.position.y = -.08 + Math.sin(elapsed * (walking ? 9 : 2.6)) * energy;
    avatar.rotation.y = Math.sin(elapsed * (walking ? 4.6 : .85)) * (walking ? .12 : .045);
    if (elapsed >= nextBlinkAt) { blink = 1; nextBlinkAt = elapsed + 2.2 + Math.random() * 3.7; }
    if (blink > 0) blink = Math.max(0, blink - dt * 6);
    const eyeScale = 1 - Math.sin(blink * Math.PI) * .94;
    leftEye.scale.y = eyeScale; rightEye.scale.y = eyeScale;
    const talking = activeState === "speaking", thinking = activeState === "thinking" || activeState === "think";
    mouth.scale.y = mouth.userData.closedScaleY * (talking ? 2.2 + (Math.sin(elapsed * 14) + 1) * 1.7 : thinking ? .58 : 1);
    mouthLip.scale.y = talking ? .72 : 1;
    renderer.render(scene, camera);
  }

  // Unified throttled rendering loop:
  // 30 fps when busy (connecting, speaking, listening, animating)
  // 12 fps when idle and disconnected -> completely saves CPU/GPU and eliminates mouse cursor lag on Windows!
  function throttledLoop(now) {
    if (!alive) return;
    frameHandle = window.requestAnimationFrame(throttledLoop);
    const isBusy = visualState.connection === "connecting"
      || visualState.connection === "connected"
      || activeState !== "idle"
      || isDragging
      || visualState.inputLevel > 0.05
      || visualState.outputLevel > 0.05;
    const targetInterval = isBusy ? 33 : 83; // 30fps vs 12fps
    const elapsedSinceLast = now - lastFrameTimestamp;
    if (elapsedSinceLast < targetInterval) return;
    lastFrameTimestamp = now - (elapsedSinceLast % targetInterval);

    renderVisualizer();
    if (!force2DMode && renderer && scene && camera) {
      const dt = Math.min(clock ? clock.getDelta() : 0.033, 0.05);
      animateStep(dt);
    }
  }

  function initialize() {
    try {
      initializeMaterials();
      // Low-power preference, antialias disabled on tiny 130px frame, pixelRatio clamped to 1.25
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power", premultipliedAlpha: false });
      renderer.setPixelRatio(Math.min(1.25, Math.max(1, window.devicePixelRatio || 1)));
      renderer.setClearColor(0x000000, 0); renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(34, 130 / 150, .1, 80);
      camera.position.set(0, 1.63, 5.45); camera.lookAt(0, 1.60, 0);
      scene.add(new THREE.HemisphereLight(0xffe8dd, 0x263044, 2.05));
      const key = new THREE.DirectionalLight(0xfff0df, 3.2); key.position.set(-2.4, 4.5, 4); scene.add(key);
      const fill = new THREE.DirectionalLight(0x93c5fd, 1.2); fill.position.set(2.8, 2.1, 3); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xb91c1c, 2); rim.position.set(1.8, 3.1, -2.5); scene.add(rim);
      createAvatar(); applyState("idle"); updateStatus(); resizeRenderer();
      window.addEventListener("resize", resizeRenderer);
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(resizeRenderer); observer.observe(canvas); window.jessPetResizeObserver = observer;
      }
      nextBlinkAt = 2 + Math.random() * 3;
    } catch (error) {
      console.warn("[Jess pet] 3D rendering is unavailable; using lightweight 2D avatar:", error);
      force2DMode = true;
      try { renderer?.dispose?.(); } catch {}
      renderer = null; scene = null; camera = null; avatar = null;
      leftArm = null; rightArm = null; leftEye = null; rightEye = null; mouth = null; mouthLip = null;
      const fallbackCanvas = canvas.cloneNode(false);
      canvas.replaceWith(fallbackCanvas);
      canvas = fallbackCanvas;
      drawFallback2D();
    }
  }

  character.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    pointerStart = { x: event.screenX, y: event.screenY }; lastPointer = pointerStart; isDragging = false;
    try { character.setPointerCapture(event.pointerId); } catch {}
  });
  character.addEventListener("pointermove", event => {
    if (!pointerStart || !lastPointer) return;
    const dx = event.screenX - lastPointer.x, dy = event.screenY - lastPointer.y;
    if (!isDragging && Math.hypot(dx, dy) > 5) isDragging = true;
    if (isDragging) {
      const stepX = event.screenX - lastPointer.x, stepY = event.screenY - lastPointer.y;
      lastPointer = { x: event.screenX, y: event.screenY };
      Promise.resolve(window.jessPet?.moveBy?.(stepX, stepY)).catch(error => console.debug(error));
    }
  });
  function finishPointer() {
    const moved = isDragging; pointerStart = null; lastPointer = null; isDragging = false;
    if (moved) { suppressNextClick = true; window.setTimeout(() => { suppressNextClick = false; }, 0); }
  }
  character.addEventListener("pointerup", finishPointer);
  character.addEventListener("pointercancel", () => {
    pointerStart = null; lastPointer = null; isDragging = false; suppressNextClick = true;
    window.setTimeout(() => { suppressNextClick = false; }, 0);
  });

  // Instant snap-of-a-finger click activation:
  // Disconnected: immediately trigger voice connection without 420ms delay!
  // Connected: immediately toggle mute.
  character.addEventListener("click", event => {
    if (suppressNextClick) { event.preventDefault(); return; }
    if (visualState.connection === "connected") {
      requestVoiceActivation("mute");
    } else if (visualState.connection === "connecting") {
      say("Jess is connecting… please wait a moment.");
    } else {
      // Connect instantly!
      requestVoiceActivation("toggle");
    }
  });

  character.addEventListener("dblclick", event => {
    event.preventDefault(); event.stopPropagation();
    // Double-click toggle
    requestVoiceActivation("toggle");
  });

  character.addEventListener("contextmenu", event => {
    event.preventDefault();
    Promise.resolve(window.jessPet?.hide?.()).catch(error => console.error(error));
  });

  window.jessPet?.onState?.(next => { if (liveStates.has(next)) applyState(next); });
  window.jessPet?.onVisualState?.(applyVisualState);
  window.jessPet?.onSpeech?.(payload => {
    if (!payload || typeof payload.text !== "string") return;
    if (/^(Connecting to Jess|Ending voice chat|Starting voice chat|I couldn't activate voice chat|Voice chat did not connect|Microphone is muted|Turning the microphone|Muting the microphone|Jess could not finish connecting|Jess is not connected)/i.test(payload.text.trim())) say(payload.text);
  });

  updateStatus();
  initialize();
  frameHandle = window.requestAnimationFrame(throttledLoop);

  window.addEventListener("beforeunload", () => {
    alive = false;
    if (frameHandle) window.cancelAnimationFrame(frameHandle);
    if (idleFidgetTimer !== null) window.clearTimeout(idleFidgetTimer);
    if (activationWatchdogTimer !== null) window.clearTimeout(activationWatchdogTimer);
    if (speechTimer !== null) window.clearTimeout(speechTimer);
    if (window.jessPetResizeObserver) window.jessPetResizeObserver.disconnect();
    if (renderer) renderer.dispose();
  }, { once: true });
})();