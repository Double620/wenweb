(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const POS = "#c8ff73";
  const NEG = "#ff8b76";
  const POS_RGB = [200, 255, 115];
  const NEG_RGB = [255, 139, 118];
  const BG_RGB = [8, 8, 8];
  const TAU = Math.PI * 2;

  const INPUTS = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  const TARGETS = [0, 1, 1, 0];

  const HIDDEN = 4;
  const LR = 0.05;
  const BETA1 = 0.9;
  const BETA2 = 0.999;
  const ADAM_EPS = 1e-8;
  const BASE_RATE = 15;

  const surfaceCanvas = document.getElementById("surface");
  const lossCanvas = document.getElementById("loss");
  const networkSvg = document.getElementById("network");
  const trainBtn = document.getElementById("trainBtn");
  const resetBtn = document.getElementById("resetBtn");
  const runState = document.getElementById("runState");
  const phase = document.getElementById("phase");
  const statEpoch = document.getElementById("statEpoch");
  const statLoss = document.getElementById("statLoss");
  const statAcc = document.getElementById("statAcc");
  const sampleLabel = document.getElementById("sampleLabel");
  const hint = document.getElementById("hint");

  if (!surfaceCanvas || !lossCanvas || !networkSvg || !trainBtn) return;

  const surfaceCtx = surfaceCanvas.getContext("2d");
  const lossCtx = lossCanvas.getContext("2d");
  const heatCanvas = document.createElement("canvas");
  heatCanvas.width = 64;
  heatCanvas.height = 64;
  const heatCtx = heatCanvas.getContext("2d");

  let seed = 20261118;
  let rng = mulberry32(seed);
  let W1 = [];
  let b1 = [];
  let W2 = [];
  let b2 = 0;
  let mW1 = [];
  let vW1 = [];
  let mb1 = [];
  let vb1 = [];
  let mW2 = [];
  let vW2 = [];
  let mb2 = 0;
  let vb2 = 0;
  let adamT = 0;

  let epoch = 0;
  let loss = 0;
  let accuracy = 0;
  let goodStreak = 0;
  let converged = false;
  let running = false;
  let speed = 1;
  let selected = 2;
  let history = [];
  let surfaceLayout = null;
  let rafId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let lastRender = 0;

  /* ------------------------------------------------------------------------
     Network
     ------------------------------------------------------------------------ */

  function mulberry32(value) {
    let a = value >>> 0;
    return function random() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
  }

  function forward(x1, x2) {
    const h = new Array(HIDDEN);
    for (let j = 0; j < HIDDEN; j += 1) {
      h[j] = Math.tanh(b1[j] + W1[j][0] * x1 + W1[j][1] * x2);
    }

    let z = b2;
    for (let j = 0; j < HIDDEN; j += 1) {
      z += W2[j] * h[j];
    }

    return { h, p: sigmoid(z) };
  }

  function predict(x1, x2) {
    return forward(x1, x2).p;
  }

  function computeLoss() {
    let total = 0;
    for (let i = 0; i < INPUTS.length; i += 1) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(INPUTS[i][0], INPUTS[i][1])));
      total += -(TARGETS[i] * Math.log(p) + (1 - TARGETS[i]) * Math.log(1 - p));
    }
    return total / INPUTS.length;
  }

  function computeAccuracy() {
    let correct = 0;
    for (let i = 0; i < INPUTS.length; i += 1) {
      const predicted = predict(INPUTS[i][0], INPUTS[i][1]) >= 0.5 ? 1 : 0;
      if (predicted === TARGETS[i]) correct += 1;
    }
    return correct / INPUTS.length;
  }

  function initWeights() {
    rng = mulberry32(seed);
    const limit1 = Math.sqrt(6 / (2 + HIDDEN));
    const limit2 = Math.sqrt(6 / (HIDDEN + 1));

    W1 = Array.from({ length: HIDDEN }, () => [
      (rng() * 2 - 1) * limit1,
      (rng() * 2 - 1) * limit1,
    ]);
    b1 = Array.from({ length: HIDDEN }, () => 0);
    W2 = Array.from({ length: HIDDEN }, () => (rng() * 2 - 1) * limit2);
    b2 = 0;

    mW1 = Array.from({ length: HIDDEN }, () => [0, 0]);
    vW1 = Array.from({ length: HIDDEN }, () => [0, 0]);
    mb1 = Array.from({ length: HIDDEN }, () => 0);
    vb1 = Array.from({ length: HIDDEN }, () => 0);
    mW2 = Array.from({ length: HIDDEN }, () => 0);
    vW2 = Array.from({ length: HIDDEN }, () => 0);
    mb2 = 0;
    vb2 = 0;
    adamT = 0;
  }

  function adamUpdate(value, gradient, m, v, t) {
    const nextM = BETA1 * m + (1 - BETA1) * gradient;
    const nextV = BETA2 * v + (1 - BETA2) * gradient * gradient;
    const mHat = nextM / (1 - Math.pow(BETA1, t));
    const vHat = nextV / (1 - Math.pow(BETA2, t));
    return [
      value - (LR * mHat) / (Math.sqrt(vHat) + ADAM_EPS),
      nextM,
      nextV,
    ];
  }

  function trainStep() {
    const dW1 = Array.from({ length: HIDDEN }, () => [0, 0]);
    const db1 = new Array(HIDDEN).fill(0);
    const dW2 = new Array(HIDDEN).fill(0);
    let db2 = 0;

    for (let n = 0; n < INPUTS.length; n += 1) {
      const x1 = INPUTS[n][0];
      const x2 = INPUTS[n][1];
      const { h, p } = forward(x1, x2);
      const dz2 = (p - TARGETS[n]) / INPUTS.length;

      for (let j = 0; j < HIDDEN; j += 1) {
        dW2[j] += dz2 * h[j];
        const dh = dz2 * W2[j] * (1 - h[j] * h[j]);
        dW1[j][0] += dh * x1;
        dW1[j][1] += dh * x2;
        db1[j] += dh;
      }

      db2 += dz2;
    }

    adamT += 1;

    for (let j = 0; j < HIDDEN; j += 1) {
      let result = adamUpdate(W1[j][0], dW1[j][0], mW1[j][0], vW1[j][0], adamT);
      W1[j][0] = result[0];
      mW1[j][0] = result[1];
      vW1[j][0] = result[2];

      result = adamUpdate(W1[j][1], dW1[j][1], mW1[j][1], vW1[j][1], adamT);
      W1[j][1] = result[0];
      mW1[j][1] = result[1];
      vW1[j][1] = result[2];

      result = adamUpdate(b1[j], db1[j], mb1[j], vb1[j], adamT);
      b1[j] = result[0];
      mb1[j] = result[1];
      vb1[j] = result[2];

      result = adamUpdate(W2[j], dW2[j], mW2[j], vW2[j], adamT);
      W2[j] = result[0];
      mW2[j] = result[1];
      vW2[j] = result[2];
    }

    const result = adamUpdate(b2, db2, mb2, vb2, adamT);
    b2 = result[0];
    mb2 = result[1];
    vb2 = result[2];

    epoch += 1;
    loss = computeLoss();
    accuracy = computeAccuracy();

    if (accuracy === 1 && loss < 0.015) {
      goodStreak += 1;
    } else {
      goodStreak = 0;
    }

    if (goodStreak >= 10 && epoch >= 80) {
      converged = true;
      running = false;
    }

    if (epoch % 2 === 0) {
      history.push({ epoch, loss });
      if (history.length > 260) {
        history = history.filter((_, index) => index % 2 === 0 || index === history.length - 1);
      }
    }
  }

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */

  function reset(randomizeSeed) {
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;

    if (randomizeSeed) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    }

    initWeights();
    epoch = 0;
    loss = computeLoss();
    accuracy = computeAccuracy();
    goodStreak = 0;
    converged = false;
    selected = 2;
    history = [{ epoch: 0, loss }];
    accumulator = 0;
    lastRender = 0;
    updateUI();
    renderAll();
  }

  function start() {
    if (running || converged) return;
    running = true;
    accumulator = 0;
    lastFrame = performance.now();
    updateUI();
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    updateUI();
  }

  function frame(now) {
    if (!running) return;

    const delta = Math.min(0.12, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    accumulator += delta * BASE_RATE * speed;

    let steps = Math.min(40, Math.floor(accumulator));
    accumulator -= steps;

    if (steps > 0) {
      for (let i = 0; i < steps; i += 1) {
        trainStep();
        if (converged) break;
      }

      if (now - lastRender > 60) {
        lastRender = now;
        renderAll();
      }
    }

    if (converged) {
      running = false;
      updateUI();
      renderAll();
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------------
     Canvas helpers
     ------------------------------------------------------------------------ */

  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function rgba(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawSurface() {
    const { ctx, width, height } = fitCanvas(surfaceCanvas);
    if (width < 40 || height < 40) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 38, right: 22, top: 18, bottom: 32 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    if (plotWidth < 20 || plotHeight < 20) return;

    surfaceLayout = { pad, plotWidth, plotHeight };
    const gridSize = 64;
    const probs = new Float32Array(gridSize * gridSize);

    for (let j = 0; j < gridSize; j += 1) {
      const x2 = 1 - j / (gridSize - 1);
      for (let i = 0; i < gridSize; i += 1) {
        probs[j * gridSize + i] = predict(i / (gridSize - 1), x2);
      }
    }

    if (heatCanvas.width !== gridSize || heatCanvas.height !== gridSize) {
      heatCanvas.width = gridSize;
      heatCanvas.height = gridSize;
    }

    const image = heatCtx.createImageData(gridSize, gridSize);
    for (let index = 0; index < probs.length; index += 1) {
      const p = probs[index];
      const strength = 0.04 + Math.pow(Math.abs(p - 0.5) * 2, 0.7) * 0.52;
      const color = mix(BG_RGB, p >= 0.5 ? POS_RGB : NEG_RGB, strength);
      const offset = index * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
    heatCtx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heatCanvas, pad.left, pad.top, plotWidth, plotHeight);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
    for (let t = 0; t <= 1; t += 0.5) {
      const x = pad.left + plotWidth * t;
      const y = pad.top + plotHeight * t;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotWidth, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.strokeRect(pad.left, pad.top, plotWidth, plotHeight);

    ctx.fillStyle = "#62625e";
    ctx.font = '8px "SFMono-Regular", Consolas, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("0", pad.left, height - 13);
    ctx.fillText("1", pad.left + plotWidth, height - 13);
    ctx.fillStyle = "#8b8b86";
    ctx.fillText("x\u2081", pad.left + plotWidth / 2, height - 11);

    ctx.fillStyle = "#565653";
    ctx.fillText("0", pad.left - 18, pad.top + plotHeight);
    ctx.fillText("1", pad.left - 18, pad.top);

    ctx.save();
    ctx.translate(11, pad.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#8b8b86";
    ctx.fillText("x\u2082", 0, 0);
    ctx.restore();

    drawContour(ctx, probs, gridSize, pad, plotWidth, plotHeight);

    INPUTS.forEach(([x1, x2], index) => {
      const px = pad.left + plotWidth * x1;
      const py = pad.top + plotHeight * (1 - x2);
      const color = TARGETS[index] ? POS : NEG;
      const predicted = predict(x1, x2) >= 0.5 ? 1 : 0;

      ctx.beginPath();
      ctx.arc(px, py, 11, 0, TAU);
      ctx.fillStyle = rgba(color, 0.12);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 5.2, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(5, 5, 5, 0.9)";
      ctx.stroke();

      if (predicted !== TARGETS[index]) {
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.arc(px, py, 12, 0, TAU);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (index === selected) {
        ctx.beginPath();
        ctx.setLineDash([2, 4]);
        ctx.arc(px, py, 16, 0, TAU);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = '8px "SFMono-Regular", Consolas, monospace';
      ctx.fillStyle = "rgba(244, 244, 241, 0.72)";
      ctx.textAlign = x1 === 0 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${x1},${x2}`, px + (x1 === 0 ? 13 : -13), py + (x2 === 0 ? -13 : 14));
    });
  }

  function drawContour(ctx, probs, size, pad, plotWidth, plotHeight) {
    ctx.beginPath();

    const point = (i, j) => [
      pad.left + (i / (size - 1)) * plotWidth,
      pad.top + (j / (size - 1)) * plotHeight,
    ];

    const interpolate = (a, b, pa, pb, xa, ya, xb, yb) => {
      const t = (0.5 - pa) / (pb - pa);
      return [xa + (xb - xa) * t, ya + (yb - ya) * t];
    };

    for (let j = 0; j < size - 1; j += 1) {
      for (let i = 0; i < size - 1; i += 1) {
        const p00 = probs[j * size + i];
        const p10 = probs[j * size + i + 1];
        const p01 = probs[(j + 1) * size + i];
        const p11 = probs[(j + 1) * size + i + 1];
        const [x00, y00] = point(i, j);
        const [x10, y10] = point(i + 1, j);
        const [x01, y01] = point(i, j + 1);
        const [x11, y11] = point(i + 1, j + 1);

        const crossings = [];

        if ((p00 >= 0.5) !== (p10 >= 0.5)) {
          crossings.push(interpolate(0, 0, p00, p10, x00, y00, x10, y10));
        }
        if ((p10 >= 0.5) !== (p11 >= 0.5)) {
          crossings.push(interpolate(0, 0, p10, p11, x10, y10, x11, y11));
        }
        if ((p11 >= 0.5) !== (p01 >= 0.5)) {
          crossings.push(interpolate(0, 0, p11, p01, x11, y11, x01, y01));
        }
        if ((p01 >= 0.5) !== (p00 >= 0.5)) {
          crossings.push(interpolate(0, 0, p01, p00, x01, y01, x00, y00));
        }

        if (crossings.length === 2) {
          ctx.moveTo(crossings[0][0], crossings[0][1]);
          ctx.lineTo(crossings[1][0], crossings[1][1]);
        } else if (crossings.length === 4) {
          ctx.moveTo(crossings[0][0], crossings[0][1]);
          ctx.lineTo(crossings[1][0], crossings[1][1]);
          ctx.moveTo(crossings[2][0], crossings[2][1]);
          ctx.lineTo(crossings[3][0], crossings[3][1]);
        }
      }
    }

    ctx.lineWidth = 1.1;
    ctx.strokeStyle = "rgba(244, 244, 241, 0.55)";
    ctx.stroke();
  }

  function drawLoss() {
    const { ctx, width, height } = fitCanvas(lossCanvas);
    if (width < 40 || height < 30) return;

    ctx.clearRect(0, 0, width, height);

    const pad = { left: 28, right: 10, top: 12, bottom: 18 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    if (plotWidth < 10 || plotHeight < 10) return;

    const losses = history.map((item) => item.loss);
    const maxLoss = Math.max(0.75, Math.ceil(Math.max(...losses, 0.75) * 4) / 4);
    const maxEpoch = Math.max(120, Math.ceil(epoch / 120) * 120);

    ctx.font = '7px "SFMono-Regular", Consolas, monospace';
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#4f4f4c";

    for (let i = 0; i <= 3; i += 1) {
      const value = (maxLoss / 3) * i;
      const y = pad.top + plotHeight - (value / maxLoss) * plotHeight;
      ctx.strokeStyle = i === 0 ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotWidth, y);
      ctx.stroke();
      ctx.fillStyle = "#4f4f4c";
      ctx.fillText(value.toFixed(2), pad.left - 6, y);
    }

    const point = (item) => [
      pad.left + (item.epoch / maxEpoch) * plotWidth,
      pad.top + (1 - item.loss / maxLoss) * plotHeight,
    ];

    if (history.length > 1) {
      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
      gradient.addColorStop(0, "rgba(200, 255, 115, 0.16)");
      gradient.addColorStop(1, "rgba(200, 255, 115, 0)");

      ctx.beginPath();
      const first = point(history[0]);
      const last = point(history[history.length - 1]);
      ctx.moveTo(first[0], pad.top + plotHeight);
      history.forEach((item) => {
        const [x, y] = point(item);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(last[0], pad.top + plotHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      history.forEach((item, index) => {
        const [x, y] = point(item);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = POS;
      ctx.stroke();
    }

    const current = history[history.length - 1];
    const [currentX, currentY] = point(current);
    ctx.beginPath();
    ctx.arc(currentX, currentY, 2.3, 0, TAU);
    ctx.fillStyle = POS;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, TAU);
    ctx.strokeStyle = "rgba(200, 255, 115, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#4f4f4c";
    ctx.textAlign = "left";
    ctx.fillText("0", pad.left, pad.top + plotHeight + 10);
    ctx.textAlign = "right";
    ctx.fillText(String(maxEpoch), pad.left + plotWidth, pad.top + plotHeight + 10);
  }

  /* ------------------------------------------------------------------------
     SVG network
     ------------------------------------------------------------------------ */

  const edgeLayer = document.createElementNS(NS, "g");
  const nodeLayer = document.createElementNS(NS, "g");
  networkSvg.appendChild(edgeLayer);
  networkSvg.appendChild(nodeLayer);

  const inputNodes = [
    { x: 55, y: 84 },
    { x: 55, y: 196 },
  ];
  const hiddenNodes = Array.from({ length: HIDDEN }, (_, index) => ({
    x: 204,
    y: 52 + index * 60,
  }));
  const outputNode = { x: 366, y: 140 };
  const w1Edges = [];
  const w2Edges = [];

  function makeLine(a, b) {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("class", "net-edge");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("vector-effect", "non-scaling-stroke");
    edgeLayer.appendChild(line);
    return line;
  }

  inputNodes.forEach((input, inputIndex) => {
    hiddenNodes.forEach((hidden, hiddenIndex) => {
      w1Edges.push({
        line: makeLine(input, hidden),
        inputIndex,
        hiddenIndex,
      });
    });
  });

  hiddenNodes.forEach((hidden, hiddenIndex) => {
    w2Edges.push({
      line: makeLine(hidden, outputNode),
      hiddenIndex,
    });
  });

  function makeNode(node, className, radius) {
    const group = document.createElementNS(NS, "g");
    group.setAttribute("class", `net-node ${className}`);
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", radius);
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", node.x);
    text.setAttribute("y", node.y);
    group.appendChild(circle);
    group.appendChild(text);
    nodeLayer.appendChild(group);
    return { group, circle, text };
  }

  const inputVisuals = inputNodes.map((node, index) => {
    const visual = makeNode(node, "net-node--input", 17);
    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "net-label net-label--left");
    label.setAttribute("x", 27);
    label.setAttribute("y", node.y);
    label.textContent = index === 0 ? "x\u2081" : "x\u2082";
    nodeLayer.appendChild(label);
    return visual;
  });

  const hiddenVisuals = hiddenNodes.map((node, index) => {
    const visual = makeNode(node, "net-node--hidden", 17);
    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "net-label");
    label.setAttribute("x", node.x);
    label.setAttribute("y", node.y - 25);
    label.textContent = `h${index + 1}`;
    nodeLayer.appendChild(label);
    return visual;
  });

  const outputVisual = makeNode(outputNode, "net-node--output", 19);
  const outputLabel = document.createElementNS(NS, "text");
  outputLabel.setAttribute("class", "net-label");
  outputLabel.setAttribute("x", outputNode.x);
  outputLabel.setAttribute("y", outputNode.y - 28);
  outputLabel.textContent = "y\u0302";
  nodeLayer.appendChild(outputLabel);

  function drawNetwork() {
    const [x1, x2] = INPUTS[selected];
    const { h, p } = forward(x1, x2);

    w1Edges.forEach(({ line, inputIndex, hiddenIndex }) => {
      const weight = W1[hiddenIndex][inputIndex];
      const magnitude = Math.min(1, Math.abs(weight) / 2.2);
      line.setAttribute("stroke", weight >= 0 ? POS : NEG);
      line.setAttribute("stroke-width", (0.55 + magnitude * 2.8).toFixed(2));
      line.setAttribute("stroke-opacity", (0.12 + magnitude * 0.58).toFixed(2));
    });

    w2Edges.forEach(({ line, hiddenIndex }) => {
      const weight = W2[hiddenIndex];
      const magnitude = Math.min(1, Math.abs(weight) / 2.6);
      line.setAttribute("stroke", weight >= 0 ? POS : NEG);
      line.setAttribute("stroke-width", (0.7 + magnitude * 3.4).toFixed(2));
      line.setAttribute("stroke-opacity", (0.16 + magnitude * 0.68).toFixed(2));
    });

    inputVisuals.forEach((visual, index) => {
      visual.text.textContent = String(INPUTS[selected][index]);
      visual.circle.setAttribute("fill", "#111");
      visual.circle.setAttribute("stroke", "#777772");
    });

    hiddenVisuals.forEach((visual, index) => {
      const value = h[index];
      visual.text.textContent = `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
      visual.circle.setAttribute(
        "fill",
        value >= 0 ? rgba(POS, 0.06 + Math.abs(value) * 0.22) : rgba(NEG, 0.06 + Math.abs(value) * 0.22)
      );
      visual.circle.setAttribute("stroke", value >= 0 ? POS : NEG);
    });

    outputVisual.text.textContent = p.toFixed(2);
    outputVisual.circle.setAttribute("fill", rgba(p >= 0.5 ? POS : NEG, 0.08 + Math.abs(p - 0.5) * 0.42));
    outputVisual.circle.setAttribute("stroke", p >= 0.5 ? POS : NEG);

    sampleLabel.textContent = `SAMPLE (${x1}, ${x2}) \u2192 ${TARGETS[selected]}`;
  }

  /* ------------------------------------------------------------------------
     UI
     ------------------------------------------------------------------------ */

  function updateUI() {
    statEpoch.textContent = String(epoch).padStart(4, "0");
    statLoss.textContent = loss.toFixed(4);
    statAcc.textContent = `${Math.round(accuracy * 100)}%`;

    phase.classList.toggle("is-live", running);
    phase.classList.toggle("is-done", converged);

    if (converged) {
      phase.textContent = "CONVERGED";
      runState.textContent = "CONVERGED";
      trainBtn.textContent = "再训练一次";
      hint.textContent = "网络已经学会 XOR。点击“再训练一次”换一组随机权重，再看一遍。";
    } else if (running) {
      phase.textContent = accuracy === 1 ? "SEPARATING" : "LEARNING";
      runState.textContent = "TRAINING";
      trainBtn.textContent = "暂停";
      hint.textContent = "训练中：观察白色 0.5 轮廓如何弯折，把四个点分到正确的区域。";
    } else if (epoch === 0) {
      phase.textContent = "RANDOM INIT";
      runState.textContent = "IDLE";
      trainBtn.textContent = "开始训练";
      hint.textContent = "点击“开始训练”，观察背景如何从随机状态变成两块区域。收敛后会自动暂停。";
    } else {
      phase.textContent = "PAUSED";
      runState.textContent = "PAUSED";
      trainBtn.textContent = "继续训练";
      hint.textContent = "已暂停。点击“继续训练”接着看，或重置换一组随机权重。";
    }

    runState.classList.toggle("is-live", running);
  }

  function renderAll() {
    drawSurface();
    drawNetwork();
    drawLoss();
    updateUI();
  }

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */

  trainBtn.addEventListener("click", () => {
    if (converged) {
      reset(true);
      start();
      return;
    }
    if (running) pause();
    else start();
  });

  resetBtn.addEventListener("click", () => {
    reset(true);
  });

  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      speed = Number(button.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    });
  });

  surfaceCanvas.addEventListener("click", (event) => {
    if (!surfaceLayout) return;
    const rect = surfaceCanvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { pad, plotWidth, plotHeight } = surfaceLayout;
    let bestIndex = -1;
    let bestDistance = Infinity;

    INPUTS.forEach(([x1, x2], index) => {
      const x = pad.left + x1 * plotWidth;
      const y = pad.top + (1 - x2) * plotHeight;
      const distance = Math.hypot(px - x, py - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestDistance <= 30) {
      selected = bestIndex;
      renderAll();
    }
  });

  surfaceCanvas.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    selected = (selected + direction + INPUTS.length) % INPUTS.length;
    renderAll();
  });

  let resizeTimer = 0;
  const scheduleRender = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderAll, 60);
  };

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleRender);
    observer.observe(surfaceCanvas.parentElement);
    observer.observe(lossCanvas.parentElement);
  }
  window.addEventListener("resize", scheduleRender);

  reset(false);
  requestAnimationFrame(renderAll);
})();
