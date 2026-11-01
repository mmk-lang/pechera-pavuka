// Звуки гри. Ми не завантажуємо файли — кожен звук «синтезуємо» з простих хвиль (Web Audio API):
//   осцилятор (генератор тону) → гучність, що швидко згасає → динаміки.
// Браузер дозволяє звук лише після першого кліку чи натискання клавіші, тому AudioContext
// створюємо тоді, коли гравець уперше щось натиснув.
// Увімкнений чи вимкнений звук пам'ятаємо в браузері (localStorage).

export type SoundName =
  | 'step'
  | 'pickup'
  | 'throw'
  | 'install'
  | 'kill'
  | 'capture'
  | 'death'
  | 'rescue'
  | 'enemy'
  | 'fire'
  | 'victory'
  | 'defeat'
  | 'reject'
  | 'undo';

const STORAGE_KEY = 'pechera-pavuka.sound';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled: boolean;

  constructor(private readonly volume: number) {
    this.enabled = readSetting();
    // Перший дотик чи клавіша «розблоковує» звук
    const unlock = () => {
      this.ensureContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
    } catch {
      // приватний режим браузера — просто не запам'ятовуємо
    }
    return this.enabled;
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'step':
        this.tone(t, 260, 200, 0.07, 'sine', 0.35);
        break;
      case 'pickup':
        this.tone(t, 440, 440, 0.07, 'triangle', 0.5);
        this.tone(t + 0.07, 660, 660, 0.09, 'triangle', 0.5);
        break;
      case 'throw':
        this.noise(t, 0.25, 600, 2400, 0.5);
        break;
      case 'install':
        this.tone(t, 220, 220, 0.08, 'square', 0.25);
        this.tone(t + 0.09, 880, 880, 0.25, 'sine', 0.45);
        break;
      case 'kill':
        this.noise(t, 0.15, 1200, 300, 0.7);
        this.tone(t, 300, 60, 0.2, 'sawtooth', 0.3);
        break;
      case 'capture':
        this.tone(t, 220, 70, 0.6, 'sawtooth', 0.35);
        this.tone(t + 0.05, 233, 74, 0.6, 'sawtooth', 0.25);
        break;
      case 'death':
        this.tone(t, 110, 100, 1.2, 'sine', 0.6);
        this.tone(t, 165, 150, 1.0, 'sine', 0.3);
        break;
      case 'rescue':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, f, f, 0.15, 'triangle', 0.45));
        break;
      case 'enemy':
        this.noise(t, 0.4, 300, 120, 0.35);
        this.tone(t, 90, 70, 0.4, 'sine', 0.4);
        break;
      case 'fire':
        this.tone(t, 1400, 90, 0.45, 'sawtooth', 0.45);
        this.noise(t + 0.05, 0.5, 2000, 200, 0.6);
        break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + 0.5 + i * 0.14, f, f, 0.3, 'triangle', 0.5));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone(t + 0.5 + i * 0.2, f, f * 0.98, 0.35, 'sine', 0.5));
        break;
      case 'reject':
        this.tone(t, 130, 120, 0.12, 'square', 0.2);
        break;
      case 'undo':
        this.tone(t, 500, 300, 0.1, 'sine', 0.35);
        break;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null; // дуже старий браузер — граємо без звуку
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  // Тон: частота плавно йде від fromHz до toHz, гучність швидко наростає й згасає за duration секунд
  private tone(start: number, fromHz: number, toHz: number, duration: number, type: OscillatorType, loudness: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(toHz, 1), start + duration);
    osc.connect(this.envelope(start, duration, loudness));
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  // Шум (як «ш-ш-ш»), пропущений крізь фільтр, що ковзає від fromHz до toHz: свист кидка, хлюп, гуркіт
  private noise(start: number, duration: number, fromHz: number, toHz: number, loudness: number): void {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // звук, не правило гри — тут Math.random можна
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + duration);
    source.connect(filter);
    filter.connect(this.envelope(start, duration, loudness));
    source.start(start);
  }

  // Гучність: за 10 мс до максимуму, потім згасання до нуля
  private envelope(start: number, duration: number, loudness: number): GainNode {
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(loudness, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(this.master!);
    return gain;
  }
}

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}
