// Screen-space effects: the digital rain background and the red hit flash.

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:."=*+-<>';

export class DigitalRain {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 16;
    this.acc = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const cols = Math.ceil(this.canvas.width / this.size);
    this.drops = Array.from({ length: cols }, () => Math.random() * -50);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // The rain advances at a fixed ~20 fps, scaled by the game's slow-motion factor.
  update(dt, timeScale = 1) {
    this.acc += dt * timeScale;
    if (this.acc < 0.05) return;
    this.acc = 0;
    const { ctx, size } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${size}px monospace`;
    for (let i = 0; i < this.drops.length; i++) {
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      const y = this.drops[i] * size;
      ctx.fillStyle = Math.random() > 0.96 ? '#d0ffd8' : '#00ff41';
      ctx.fillText(ch, i * size, y);
      if (y > this.canvas.height && Math.random() > 0.975) this.drops[i] = 0;
      this.drops[i]++;
    }
  }
}

const flashEl = document.getElementById('flash');
let flashTimer = null;

export function hitFlash() {
  flashEl.classList.add('on');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flashEl.classList.remove('on'), 80);
}
