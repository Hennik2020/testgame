const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startButton = document.getElementById('startButton');
const retryButton = document.getElementById('retryButton');
const resumeButton = document.getElementById('resumeButton');
const shopButton = document.getElementById('shopButton');
const menuOverlay = document.getElementById('menuOverlay');
const shopOverlay = document.getElementById('shopOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreText = document.getElementById('finalScoreText');
const waveDisplay = document.getElementById('waveDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const creditDisplay = document.getElementById('creditDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const shopContainer = document.getElementById('shopItems');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const keys = new Set();
let mouse = { x: WIDTH / 2, y: HEIGHT / 2, down: false };
let lastTimestamp = 0;

const state = {
  status: 'menu',
  score: 0,
  credits: 0,
  wave: 1,
  enemiesRemaining: 0,
  countdown: 0,
  highScore: Number(localStorage.getItem('crystalRaidersHighScore') || 0),
};

const rng = {
  randomRange(min, max) {
    return Math.random() * (max - min) + min;
  },
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  },
};

class AudioManager {
  constructor() {
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(options) {
    const { type = 'sine', frequency = 440, duration = 0.2, volume = 0.3, detune = 0, decay = 0.3 } = options;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    oscillator.connect(gain).connect(this.ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}

const audio = new AudioManager();

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.radius = rng.randomRange(2, 4);
    this.color = color;
    const angle = rng.randomRange(0, Math.PI * 2);
    const speed = rng.randomRange(30, 120);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rng.randomRange(0.4, 0.8);
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.98;
    this.vy *= 0.98;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(this.life, 0);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Projectile {
  constructor(x, y, angle, speed, damage, color) {
    this.x = x;
    this.y = y;
    this.radius = 5;
    this.speed = speed;
    this.damage = damage;
    this.color = color;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.6;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    ctx.save();
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(1, this.color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Pickup {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.radius = 12;
    this.value = value;
    this.life = 6;
    this.floatPhase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.life -= dt;
    this.floatPhase += dt * 2;
  }

  draw(ctx) {
    const pulse = Math.sin(this.floatPhase) * 4;
    ctx.save();
    ctx.fillStyle = 'rgba(53, 195, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(this.x, this.y + pulse, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#021225';
    ctx.font = 'bold 14px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${this.value}`, this.x, this.y + pulse);
    ctx.restore();
  }
}

class Enemy {
  constructor(x, y, level) {
    this.x = x;
    this.y = y;
    this.radius = 22 + level * 2;
    this.speed = 60 + level * 12;
    this.health = 40 + level * 12;
    this.maxHealth = this.health;
    this.damage = 12 + level * 4;
    this.color = rng.randomChoice(['#35c3ff', '#62f4c9', '#ff5e8c']);
    this.glow = Math.random() * 5 + 5;
  }

  update(dt, player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const speed = this.speed * dt;
    if (dist > 0) {
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    }
  }

  draw(ctx) {
    const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.2, this.x, this.y, this.radius + this.glow);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, this.color);
    ctx.save();
    ctx.shadowBlur = 25;
    ctx.shadowColor = this.color;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Health bar
    const barWidth = this.radius * 2;
    const barHeight = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth, barHeight);
    ctx.fillStyle = '#35c3ff';
    ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, (this.health / this.maxHealth) * barWidth, barHeight);
  }
}

class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = WIDTH / 2;
    this.y = HEIGHT / 2;
    this.radius = 20;
    this.speed = 220;
    this.maxHealth = 120;
    this.health = this.maxHealth;
    this.damage = 28;
    this.fireRate = 0.3;
    this.bulletSpeed = 460;
    this.multiShot = 1;
    this.projectileSpread = 0.15;
    this.regenRate = 1.5;
    this.fireCooldown = 0;
  }

  update(dt) {
    let moveX = 0;
    let moveY = 0;
    if (keys.has('KeyW')) moveY -= 1;
    if (keys.has('KeyS')) moveY += 1;
    if (keys.has('KeyA')) moveX -= 1;
    if (keys.has('KeyD')) moveX += 1;
    const len = Math.hypot(moveX, moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
    }
    this.x += moveX * this.speed * dt;
    this.y += moveY * this.speed * dt;
    this.x = Math.max(this.radius, Math.min(WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(HEIGHT - this.radius, this.y));

    this.fireCooldown -= dt;
    if (this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.regenRate * dt);
    }
  }

  tryShoot() {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.fireRate;

    const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    const projectilesToCreate = [];
    const count = this.multiShot;
    const spread = this.projectileSpread;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      projectilesToCreate.push(new Projectile(this.x, this.y, angle + offset, this.bulletSpeed, this.damage, '#62f4c9'));
    }
    audio.play({ type: 'sawtooth', frequency: 680, duration: 0.1, volume: 0.25, decay: 0.2 });
    return projectilesToCreate;
  }

  draw(ctx) {
    const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.3, this.x, this.y, this.radius + 8);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#62f4c9');
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#62f4c9';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Health bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(this.x - 32, this.y + this.radius + 14, 64, 8);
    ctx.fillStyle = '#62f4c9';
    ctx.fillRect(this.x - 32, this.y + this.radius + 14, (this.health / this.maxHealth) * 64, 8);
  }
}

const player = new Player();
const projectiles = [];
const enemies = [];
const particles = [];
const pickups = [];

const shopItems = [
  {
    id: 'speed',
    title: 'Velocity Boots',
    desc: 'Increase movement speed by 12%.',
    cost: 120,
    apply: () => (player.speed *= 1.12),
  },
  {
    id: 'firerate',
    title: 'Rapid Core',
    desc: 'Reduce fire cooldown by 15%.',
    cost: 150,
    apply: () => (player.fireRate = Math.max(0.08, player.fireRate * 0.85)),
  },
  {
    id: 'damage',
    title: 'Crystal Lenses',
    desc: 'Increase projectile damage by 20%.',
    cost: 180,
    apply: () => (player.damage *= 1.2),
  },
  {
    id: 'multishot',
    title: 'Refraction Matrix',
    desc: 'Adds +1 projectile per shot.',
    cost: 220,
    apply: () => (player.multiShot = Math.min(player.multiShot + 1, 5)),
  },
  {
    id: 'regen',
    title: 'Nano Medkit',
    desc: 'Doubles passive health regeneration.',
    cost: 160,
    apply: () => (player.regenRate *= 2),
  },
  {
    id: 'maxhealth',
    title: 'Crystal Armor',
    desc: 'Increase maximum health by 25%. Fully heals.',
    cost: 190,
    apply: () => {
      player.maxHealth *= 1.25;
      player.health = player.maxHealth;
    },
  },
  {
    id: 'spread',
    title: 'Gyro Stabilizer',
    desc: 'Tightens projectile spread for better accuracy.',
    cost: 110,
    apply: () => (player.projectileSpread = Math.max(0.05, player.projectileSpread * 0.75)),
  },
];

function renderShop() {
  shopContainer.innerHTML = '';
  shopItems.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'shop__buy';
    button.textContent = `Buy — ${item.cost}c`;
    button.disabled = state.credits < item.cost;
    button.addEventListener('click', () => {
      if (state.credits < item.cost) return;
      state.credits -= item.cost;
      audio.play({ type: 'triangle', frequency: 520, duration: 0.2, volume: 0.2, decay: 0.4 });
      item.apply();
      updateHUD();
      renderShop();
    });

    const card = document.createElement('div');
    card.className = 'shop__item';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const desc = document.createElement('p');
    desc.textContent = item.desc;
    card.append(title, desc, button);
    shopContainer.append(card);
  });
}

function updateHUD() {
  waveDisplay.textContent = state.wave;
  scoreDisplay.textContent = Math.floor(state.score);
  creditDisplay.textContent = Math.floor(state.credits);
  highScoreDisplay.textContent = state.highScore;
}

function resetGame() {
  state.score = 0;
  state.credits = 0;
  state.wave = 1;
  state.enemiesRemaining = 0;
  state.countdown = 0;
  player.reset();
  projectiles.length = 0;
  enemies.length = 0;
  particles.length = 0;
  pickups.length = 0;
  updateHUD();
}

function spawnWave(wave) {
  const enemyCount = Math.min(6 + wave * 2, 40);
  state.enemiesRemaining = enemyCount;
  for (let i = 0; i < enemyCount; i++) {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    const margin = 60;
    if (edge === 0) {
      x = rng.randomRange(margin, WIDTH - margin);
      y = -margin;
    } else if (edge === 1) {
      x = WIDTH + margin;
      y = rng.randomRange(margin, HEIGHT - margin);
    } else if (edge === 2) {
      x = rng.randomRange(margin, WIDTH - margin);
      y = HEIGHT + margin;
    } else {
      x = -margin;
      y = rng.randomRange(margin, HEIGHT - margin);
    }
    enemies.push(new Enemy(x, y, wave * 0.8));
  }
}

function showMenu() {
  state.status = 'menu';
  menuOverlay.classList.remove('overlay--hidden');
  shopOverlay.classList.add('overlay--hidden');
  gameOverOverlay.classList.add('overlay--hidden');
}

function startGame() {
  resetGame();
  state.status = 'playing';
  menuOverlay.classList.add('overlay--hidden');
  gameOverOverlay.classList.add('overlay--hidden');
  renderShop();
  spawnWave(state.wave);
  lastTimestamp = performance.now();
  requestAnimationFrame(loop);
}

function enterShop() {
  if (state.status !== 'between-waves') return;
  state.status = 'shopping';
  shopOverlay.classList.remove('overlay--hidden');
  renderShop();
}

function resumeFromShop() {
  if (state.status !== 'shopping') return;
  shopOverlay.classList.add('overlay--hidden');
  state.status = 'between-waves';
}

function gameOver() {
  state.status = 'gameover';
  finalScoreText.textContent = `Score: ${Math.floor(state.score)}  •  Wave Reached: ${state.wave}`;
  gameOverOverlay.classList.remove('overlay--hidden');
  shopOverlay.classList.add('overlay--hidden');
  if (state.score > state.highScore) {
    state.highScore = Math.floor(state.score);
    localStorage.setItem('crystalRaidersHighScore', state.highScore);
    updateHUD();
  }
}

function handleCollisions() {
  // Projectiles vs enemies
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      const dx = projectile.x - enemy.x;
      const dy = projectile.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist < projectile.radius + enemy.radius) {
        enemy.health -= projectile.damage;
        projectiles.splice(i, 1);
        particles.push(new Particle(enemy.x, enemy.y, enemy.color));
        audio.play({ type: 'square', frequency: 180, duration: 0.2, volume: 0.2, decay: 0.3 });
        if (enemy.health <= 0) {
          enemies.splice(j, 1);
          state.score += 35;
          state.credits += 25;
          state.enemiesRemaining -= 1;
          const dropChance = Math.random();
          if (dropChance > 0.5) {
            pickups.push(new Pickup(enemy.x, enemy.y, Math.floor(rng.randomRange(20, 45))));
          }
          for (let k = 0; k < 12; k++) {
            particles.push(new Particle(enemy.x, enemy.y, enemy.color));
          }
        }
        break;
      }
    }
  }

  // Enemies vs player
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist < player.radius + enemy.radius) {
      const angle = Math.atan2(dy, dx);
      player.x += Math.cos(angle) * 8;
      player.y += Math.sin(angle) * 8;
      enemy.x -= Math.cos(angle) * 8;
      enemy.y -= Math.sin(angle) * 8;
      player.health -= enemy.damage * 0.7;
      audio.play({ type: 'sine', frequency: 120, duration: 0.3, volume: 0.25, decay: 0.3 });
      particles.push(new Particle(player.x, player.y, '#ff5e8c'));
      if (player.health <= 0) {
        gameOver();
      }
    }
  }

  // Pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    const dx = player.x - pickup.x;
    const dy = player.y - pickup.y;
    if (Math.hypot(dx, dy) < player.radius + pickup.radius) {
      state.credits += pickup.value;
      state.score += pickup.value * 0.5;
      pickups.splice(i, 1);
      audio.play({ type: 'triangle', frequency: 720, duration: 0.2, volume: 0.25, decay: 0.4 });
    } else if (pickup.life <= 0) {
      pickups.splice(i, 1);
    }
  }
}

function drawBackground(time) {
  ctx.save();
  ctx.fillStyle = '#040b19';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(53, 195, 255, 0.05)';
  const gridSize = 60;
  const offset = (time * 0.02) % gridSize;
  for (let x = -gridSize; x < WIDTH + gridSize; x += gridSize) {
    ctx.fillRect(x + offset, 0, 2, HEIGHT);
  }
  for (let y = -gridSize; y < HEIGHT + gridSize; y += gridSize) {
    ctx.fillRect(0, y + offset, WIDTH, 2);
  }
  ctx.restore();
}

function loop(timestamp) {
  if (state.status === 'gameover' || state.status === 'menu') {
    return;
  }

  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
  lastTimestamp = timestamp;

  drawBackground(timestamp);

  if (state.status === 'playing') {
    player.update(dt);
    if (mouse.down || keys.has('Space')) {
      const newProjectiles = player.tryShoot();
      if (newProjectiles) {
        projectiles.push(...newProjectiles);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      enemies[i].update(dt, player);
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      projectile.update(dt);
      if (
        projectile.life <= 0 ||
        projectile.x < -50 ||
        projectile.x > WIDTH + 50 ||
        projectile.y < -50 ||
        projectile.y > HEIGHT + 50
      ) {
        projectiles.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.update(dt);
      if (particle.life <= 0) {
        particles.splice(i, 1);
      }
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
      const pickup = pickups[i];
      pickup.update(dt);
      if (pickup.life <= 0) {
        pickups.splice(i, 1);
      }
    }

    handleCollisions();

    if (state.enemiesRemaining <= 0 && enemies.length === 0) {
      state.status = 'between-waves';
      state.wave += 1;
      state.credits += 60 + state.wave * 15;
      state.score += 150;
      audio.play({ type: 'triangle', frequency: 880, duration: 0.4, volume: 0.3, decay: 0.5 });
      updateHUD();
      shopOverlay.classList.remove('overlay--hidden');
      renderShop();
    }
  }

  // Draw Entities
  pickups.forEach((pickup) => pickup.draw(ctx));
  particles.forEach((particle) => particle.draw(ctx));
  projectiles.forEach((projectile) => projectile.draw(ctx));
  enemies.forEach((enemy) => enemy.draw(ctx));
  player.draw(ctx);

  // Wave countdown
  if (state.status === 'between-waves') {
    ctx.save();
    ctx.fillStyle = 'rgba(53, 195, 255, 0.15)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 42px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Wave ${state.wave} Incoming`, WIDTH / 2, HEIGHT / 2 - 20);
    ctx.font = '400 20px Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Spend your credits in the shop and press Resume when ready.', WIDTH / 2, HEIGHT / 2 + 20);
    ctx.restore();
  }

  updateHUD();

  requestAnimationFrame(loop);
}

function startNextWave() {
  if (state.status !== 'between-waves') return;
  shopOverlay.classList.add('overlay--hidden');
  state.status = 'playing';
  spawnWave(state.wave);
}

startButton.addEventListener('click', () => {
  audio.ensureContext();
  startGame();
});

retryButton.addEventListener('click', () => {
  audio.ensureContext();
  startGame();
});

resumeButton.addEventListener('click', () => {
  startNextWave();
});

shopButton.addEventListener('click', () => {
  if (state.status === 'between-waves') {
    shopOverlay.classList.remove('overlay--hidden');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyB' && state.status === 'between-waves') {
    shopOverlay.classList.remove('overlay--hidden');
  }
  if (event.repeat) return;
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space') {
    mouse.down = false;
  }
});

canvas.addEventListener('mousedown', () => {
  mouse.down = true;
});
canvas.addEventListener('mouseup', () => {
  mouse.down = false;
});
canvas.addEventListener('mouseleave', () => {
  mouse.down = false;
});
canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouse.x = (event.clientX - rect.left) * scaleX;
  mouse.y = (event.clientY - rect.top) * scaleY;
});

window.addEventListener('blur', () => {
  keys.clear();
  mouse.down = false;
});

updateHUD();
showMenu();
