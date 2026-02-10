// ============================================================
// ASTEROID DODGE — Configuration & Game Logic
// ============================================================
// Tweak any value in CONFIG to adjust difficulty and feel.
// All speeds are in pixels per second. All times in milliseconds.
// ============================================================

const CONFIG = {
  // --- Canvas ---
  canvasWidth: 600,
  canvasHeight: 600,

  // --- Ship ---
  shipSpeed: 340, // px/sec, instant response (no accel)
  shipSize: 4, // collision radius & draw scale

  // --- Asteroids ---
  asteroidBaseSpeed: 155, // px/sec baseline
  asteroidSpeedVariance: 90, // +/- random on top of base (high = chaotic)
  asteroidMinSize: 4, // smallest asteroid radius
  asteroidMaxSize: 14, // largest asteroid radius
  asteroidSpawnInterval: 200, // ms between spawn batches
  asteroidBatchSize: 3, // asteroids per spawn batch
  asteroidAngleSpread: 1.3, // radians of aim randomness (high = unpredictable)
  asteroidVertices: [5, 8], // min/max vertices for shape
  asteroidRotationSpeed: 3, // max radians/sec spin

  // --- Speed Surges ---
  surgeInterval: [5000, 10000], // ms between surges (random in range)
  surgeDuration: [1500, 2500], // ms a surge lasts
  surgeMultiplier: 1.5, // asteroid speed multiplier during surge
  // --- Visual ---
  starCount: 80, // background star particles
  explosionParticleCount: 30, // particles on death
  screenShakeDuration: 400, // ms of screen shake on death
  screenShakeIntensity: 8, // px max shake offset

  // --- Scoring ---
  maxScoresSaved: 10,
};

// ============================================================
// Utility helpers
// ============================================================

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function dist(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ============================================================
// Score persistence (localStorage)
// ============================================================

const ScoreManager = {
  _key: "asteroidDodgeScores",

  _load() {
    try {
      const raw = localStorage.getItem(this._key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  _save(scores) {
    try {
      localStorage.setItem(this._key, JSON.stringify(scores));
    } catch {
      /* silently fail if storage full */
    }
  },

  getScores() {
    return this._load().sort((a, b) => b - a);
  },

  getBest() {
    const scores = this.getScores();
    return scores.length > 0 ? scores[0] : 0;
  },

  addScore(score) {
    const scores = this._load();
    scores.push(score);
    scores.sort((a, b) => b - a);
    this._save(scores.slice(0, CONFIG.maxScoresSaved));
  },
};

// ============================================================
// Star (background particle)
// ============================================================

class Star {
  constructor(w, h) {
    this.x = rand(0, w);
    this.y = rand(0, h);
    this.size = rand(0.5, 2);
    this.brightness = rand(0.3, 1);
    this.twinkleSpeed = rand(1, 4);
    this.twinkleOffset = rand(0, Math.PI * 2);
  }

  draw(ctx, time) {
    const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * this.twinkleSpeed + this.twinkleOffset));
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * this.brightness})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// Ship
// ============================================================

class Ship {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = CONFIG.shipSize;
  }

  update(dt, keys) {
    let dx = 0;
    let dy = 0;
    if (keys.ArrowLeft || keys.a) dx -= 1;
    if (keys.ArrowRight || keys.d) dx += 1;
    if (keys.ArrowUp || keys.w) dy -= 1;
    if (keys.ArrowDown || keys.s) dy += 1;

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    this.x += dx * CONFIG.shipSpeed * dt;
    this.y += dy * CONFIG.shipSpeed * dt;

    // Clamp to canvas
    this.x = clamp(this.x, this.size, CONFIG.canvasWidth - this.size);
    this.y = clamp(this.y, this.size, CONFIG.canvasHeight - this.size);
  }

  draw(ctx) {
    const s = this.size;

    // Outer glow
    ctx.fillStyle = "rgba(100, 180, 255, 0.15)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, s * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Ship body (circle)
    ctx.fillStyle = "#e0e8ff";
    ctx.strokeStyle = "#7ab8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner highlight
    ctx.fillStyle = "rgba(180, 220, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(this.x - s * 0.25, this.y - s * 0.25, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// Asteroid
// ============================================================

class Asteroid {
  constructor() {
    this.size = rand(CONFIG.asteroidMinSize, CONFIG.asteroidMaxSize);
    this.rotation = 0;
    this.rotationSpeed = rand(-CONFIG.asteroidRotationSpeed, CONFIG.asteroidRotationSpeed);

    // Build irregular polygon shape (cached offsets from center)
    const vertCount = randInt(CONFIG.asteroidVertices[0], CONFIG.asteroidVertices[1]);
    this.vertices = [];
    for (let i = 0; i < vertCount; i++) {
      const angle = (i / vertCount) * Math.PI * 2;
      const r = this.size * rand(0.7, 1.0);
      this.vertices.push({ angle, r });
    }

    // Spawn from a random edge
    this._spawnFromEdge();
  }

  _spawnFromEdge() {
    const W = CONFIG.canvasWidth;
    const H = CONFIG.canvasHeight;
    const margin = this.size + 5;
    const edge = randInt(0, 3); // 0=top, 1=right, 2=bottom, 3=left

    let aimX, aimY;

    switch (edge) {
      case 0: // top
        this.x = rand(0, W);
        this.y = -margin;
        aimX = rand(0, W);
        aimY = rand(H * 0.3, H);
        break;
      case 1: // right
        this.x = W + margin;
        this.y = rand(0, H);
        aimX = rand(0, W * 0.7);
        aimY = rand(0, H);
        break;
      case 2: // bottom
        this.x = rand(0, W);
        this.y = H + margin;
        aimX = rand(0, W);
        aimY = rand(0, H * 0.7);
        break;
      case 3: // left
        this.x = -margin;
        this.y = rand(0, H);
        aimX = rand(W * 0.3, W);
        aimY = rand(0, H);
        break;
    }

    // Direction toward the aim point with some random spread
    const baseAngle = Math.atan2(aimY - this.y, aimX - this.x);
    const angle = baseAngle + rand(-CONFIG.asteroidAngleSpread / 2, CONFIG.asteroidAngleSpread / 2);

    // Speed
    const speed = CONFIG.asteroidBaseSpeed + rand(-CONFIG.asteroidSpeedVariance, CONFIG.asteroidSpeedVariance);
    this.baseVx = Math.cos(angle) * speed;
    this.baseVy = Math.sin(angle) * speed;
    this.vx = this.baseVx;
    this.vy = this.baseVy;
  }

  update(dt, speedMultiplier) {
    this.vx = this.baseVx * speedMultiplier;
    this.vy = this.baseVy * speedMultiplier;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;
  }

  isOffScreen() {
    const margin = this.size + 60;
    return (
      this.x < -margin ||
      this.x > CONFIG.canvasWidth + margin ||
      this.y < -margin ||
      this.y > CONFIG.canvasHeight + margin
    );
  }

  draw(ctx, surgeActive) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const color = surgeActive ? "#ff6655" : "#aaa";
    const strokeColor = surgeActive ? "#ff3322" : "#777";

    ctx.fillStyle = color;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      const px = Math.cos(v.angle) * v.r;
      const py = Math.sin(v.angle) * v.r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

// ============================================================
// Explosion Particle
// ============================================================

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(60, 250);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = rand(1.5, 3.5);
    this.size = rand(1.5, 4);
    // Random warm color
    const colors = ["#ff4444", "#ff8844", "#ffcc22", "#ffffff", "#ff6622", "#ffaa00"];
    this.color = colors[randInt(0, colors.length - 1)];
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 1 - dt * 2;
    this.vy *= 1 - dt * 2;
    this.life -= this.decay * dt;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// Main Game
// ============================================================

class Game {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = CONFIG.canvasWidth;
    this.canvas.height = CONFIG.canvasHeight;

    // Input
    this.keys = {};
    window.addEventListener("keydown", (e) => {
      this.keys[e.key] = true;
      // Prevent arrow key scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
      // Handle state transitions on key press
      if (this.state === "title" && (e.key === "Enter" || e.key === " ")) {
        this.startGame();
      }
      if (this.state === "gameover" && this.gameOverReady && (e.key === "Enter" || e.key === " ")) {
        this.showTitle();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key] = false;
    });

    // Background stars (persist across games)
    this.stars = [];
    for (let i = 0; i < CONFIG.starCount; i++) {
      this.stars.push(new Star(CONFIG.canvasWidth, CONFIG.canvasHeight));
    }

    // State
    this.state = "title"; // 'title' | 'playing' | 'gameover'
    this.bestScore = ScoreManager.getBest();

    // Timing
    this.lastTime = 0;
    this.globalTime = 0;

    // Start the loop
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- State transitions ----

  showTitle() {
    this.state = "title";
    this.bestScore = ScoreManager.getBest();
  }

  startGame() {
    this.state = "playing";
    this.ship = new Ship(CONFIG.canvasWidth / 2, CONFIG.canvasHeight / 2);
    this.asteroids = [];
    this.particles = [];
    this.elapsedTime = 0;

    // Spawn timer
    this.spawnTimer = 0;

    // Surge state
    this.surgeActive = false;
    this.surgeTimer = rand(CONFIG.surgeInterval[0], CONFIG.surgeInterval[1]);
    this.surgeDurationTimer = 0;
    this.speedMultiplier = 1;

    // Screen shake
    this.shakeTimer = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    // Game over delay (prevent instant restart)
    this.gameOverReady = false;
    this.gameOverTimer = 0;
  }

  triggerGameOver() {
    this.state = "gameover";
    this.gameOverReady = false;
    this.gameOverTimer = 0;

    // Save score
    const score = this.elapsedTime;
    ScoreManager.addScore(score);
    this.finalScore = score;
    this.bestScore = ScoreManager.getBest();
    this.topScores = ScoreManager.getScores();

    // Spawn explosion
    for (let i = 0; i < CONFIG.explosionParticleCount; i++) {
      this.particles.push(new Particle(this.ship.x, this.ship.y));
    }

    // Screen shake
    this.shakeTimer = CONFIG.screenShakeDuration / 1000;
  }

  // ---- Main loop ----

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime = timestamp;
    this.globalTime = timestamp / 1000;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- Update ----

  update(dt) {
    if (this.state === "playing") {
      this.updatePlaying(dt);
    } else if (this.state === "gameover") {
      this.updateGameOver(dt);
    }
  }

  updatePlaying(dt) {
    this.elapsedTime += dt;

    // Ship
    this.ship.update(dt, this.keys);

    // Surge system
    this.updateSurge(dt);

    // Spawn asteroids
    this.spawnTimer += dt * 1000;
    if (this.spawnTimer >= CONFIG.asteroidSpawnInterval) {
      this.spawnTimer -= CONFIG.asteroidSpawnInterval;
      for (let i = 0; i < CONFIG.asteroidBatchSize; i++) {
        this.asteroids.push(new Asteroid());
      }
    }

    // Update asteroids
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      this.asteroids[i].update(dt, this.speedMultiplier);
      if (this.asteroids[i].isOffScreen()) {
        this.asteroids.splice(i, 1);
      }
    }

    // Collision detection
    for (const asteroid of this.asteroids) {
      const d = dist(this.ship.x, this.ship.y, asteroid.x, asteroid.y);
      // Slightly forgiving hitbox: 80% of combined radii
      if (d < (this.ship.size + asteroid.size) * 0.8) {
        this.triggerGameOver();
        return;
      }
    }
  }

  updateSurge(dt) {
    const dtMs = dt * 1000;

    if (this.surgeActive) {
      // Currently surging
      this.surgeDurationTimer -= dtMs;
      if (this.surgeDurationTimer <= 0) {
        this.surgeActive = false;
        this.speedMultiplier = 1;
        // Set timer for next surge
        this.surgeTimer = rand(CONFIG.surgeInterval[0], CONFIG.surgeInterval[1]);
      }
    } else {
      // Counting down to next surge
      this.surgeTimer -= dtMs;
      if (this.surgeTimer <= 0) {
        // Surge kicks in immediately — no warning
        this.surgeActive = true;
        this.speedMultiplier = CONFIG.surgeMultiplier;
        this.surgeDurationTimer = rand(CONFIG.surgeDuration[0], CONFIG.surgeDuration[1]);
      }
    }
  }

  updateGameOver(dt) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Keep asteroids drifting
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      this.asteroids[i].update(dt, 1);
      if (this.asteroids[i].isOffScreen()) {
        this.asteroids.splice(i, 1);
      }
    }

    // Screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const intensity = CONFIG.screenShakeIntensity * (this.shakeTimer / (CONFIG.screenShakeDuration / 1000));
      this.shakeX = rand(-intensity, intensity);
      this.shakeY = rand(-intensity, intensity);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Delay before allowing restart
    this.gameOverTimer += dt;
    if (this.gameOverTimer > 0.8) {
      this.gameOverReady = true;
    }
  }

  // ---- Render ----

  render() {
    const ctx = this.ctx;
    const W = CONFIG.canvasWidth;
    const H = CONFIG.canvasHeight;

    ctx.save();

    // Screen shake offset
    if (this.state === "gameover") {
      ctx.translate(this.shakeX, this.shakeY);
    }

    // Background
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // Stars
    for (const star of this.stars) {
      star.draw(ctx, this.globalTime);
    }

    // Surge tint overlay
    if (this.state === "playing" && this.surgeActive) {
      ctx.fillStyle = "rgba(255, 30, 0, 0.06)";
      ctx.fillRect(0, 0, W, H);
    }

    // Asteroids
    if (this.state === "playing" || this.state === "gameover") {
      for (const asteroid of this.asteroids) {
        asteroid.draw(ctx, this.surgeActive);
      }
    }

    // Ship
    if (this.state === "playing") {
      this.ship.draw(ctx);
    }

    // Particles (explosion)
    if (this.particles) {
      for (const p of this.particles) {
        p.draw(ctx);
      }
    }

    ctx.restore();

    // --- HUD / Overlays (not affected by shake) ---

    if (this.state === "title") {
      this.renderTitle(ctx, W, H);
    } else if (this.state === "playing") {
      this.renderHUD(ctx, W, H);
    } else if (this.state === "gameover") {
      this.renderGameOver(ctx, W, H);
    }
  }

  renderTitle(ctx, W, H) {
    // Title
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Game title
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 42px "Courier New", monospace';
    ctx.fillText("ASTEROID DODGE", W / 2, H * 0.3);

    // Subtitle
    ctx.fillStyle = "#888";
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText("Dodge the rocks. Survive the surges.", W / 2, H * 0.38);

    // Controls
    ctx.fillStyle = "#666";
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText("Arrow keys or WASD to move", W / 2, H * 0.52);

    // Best score
    if (this.bestScore > 0) {
      ctx.fillStyle = "#ffcc00";
      ctx.font = '18px "Courier New", monospace';
      ctx.fillText(`Best: ${this.bestScore.toFixed(1)}s`, W / 2, H * 0.62);
    }

    // Pulsing start prompt
    const pulse = 0.5 + 0.5 * Math.sin(this.globalTime * 3);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.6})`;
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText("Press ENTER or SPACE to start", W / 2, H * 0.75);
  }

  renderHUD(ctx, W, H) {
    // Time survived
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText(`${this.elapsedTime.toFixed(1)}s`, 15, 15);

    // Best score
    ctx.textAlign = "right";
    ctx.fillStyle = "#666";
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText(`Best: ${this.bestScore.toFixed(1)}s`, W - 15, 17);

    // Surge active indicator
    if (this.surgeActive) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff3322";
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillText("SURGE!", W / 2, 15);
    }
  }

  renderGameOver(ctx, W, H) {
    // Dim overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // GAME OVER
    ctx.fillStyle = "#ff4444";
    ctx.font = 'bold 40px "Courier New", monospace';
    ctx.fillText("GAME OVER", W / 2, H * 0.2);

    // Score
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillText(`${this.finalScore.toFixed(1)}s`, W / 2, H * 0.3);

    // New best?
    if (this.finalScore >= this.bestScore) {
      ctx.fillStyle = "#ffcc00";
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillText("NEW BEST!", W / 2, H * 0.36);
    }

    // Top scores
    ctx.fillStyle = "#888";
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText("— TOP SCORES —", W / 2, H * 0.46);

    ctx.fillStyle = "#ccc";
    ctx.font = '15px "Courier New", monospace';
    const scores = this.topScores || [];
    for (let i = 0; i < scores.length; i++) {
      const highlight = scores[i] === this.finalScore && i === scores.indexOf(this.finalScore);
      ctx.fillStyle = highlight ? "#ffcc00" : "#aaa";
      ctx.fillText(`${(i + 1).toString().padStart(2, " ")}. ${scores[i].toFixed(1)}s`, W / 2, H * 0.52 + i * 22);
    }

    // Restart prompt
    if (this.gameOverReady) {
      const pulse = 0.5 + 0.5 * Math.sin(this.globalTime * 3);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.6})`;
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillText("Press ENTER or SPACE to retry", W / 2, H * 0.92);
    }
  }
}

// ============================================================
// Boot
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  new Game();
});
