// All sound is synthesised with WebAudio: short oscillator blips for metal and
// filtered noise bursts for gunfire and the gate blast. No audio files are loaded,
// which keeps the game fully offline. The context is created lazily on the first
// user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function noiseBuffer() {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  let sharedNoise = null;

  function burst({ dur = 0.12, freq = 1800, gain = 0.5, type = 'bandpass', sweepTo = null }) {
    if (!ensure()) return;
    if (!sharedNoise) sharedNoise = noiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = sharedNoise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  function tone({ freq = 440, dur = 0.09, gain = 0.25, type = 'square', sweepTo = null, delay = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'sniper') { burst({ dur: 0.28, freq: 900, gain: 0.7, sweepTo: 120 }); tone({ freq: 140, dur: 0.2, gain: 0.4, type: 'triangle', sweepTo: 55 }); }
      else if (kind === 'scatter') { burst({ dur: 0.2, freq: 700, gain: 0.65, sweepTo: 200 }); }
      else if (kind === 'smg') { burst({ dur: 0.07, freq: 2200, gain: 0.4, sweepTo: 700 }); }
      else { burst({ dur: 0.11, freq: 1600, gain: 0.5, sweepTo: 350 }); tone({ freq: 220, dur: 0.06, gain: 0.18, type: 'triangle', sweepTo: 90 }); }
    },
    dryFire() { tone({ freq: 1200, dur: 0.03, gain: 0.12, type: 'square' }); },
    reloadStart() { tone({ freq: 500, dur: 0.05, gain: 0.2, type: 'square' }); tone({ freq: 320, dur: 0.05, gain: 0.2, type: 'square', delay: 0.09 }); },
    reloadEnd() { tone({ freq: 700, dur: 0.05, gain: 0.22, type: 'square' }); tone({ freq: 980, dur: 0.06, gain: 0.22, type: 'square', delay: 0.07 }); },
    hit() { tone({ freq: 1560, dur: 0.05, gain: 0.2, type: 'sine' }); },
    kill() { tone({ freq: 880, dur: 0.08, gain: 0.25, type: 'sine' }); tone({ freq: 1320, dur: 0.12, gain: 0.25, type: 'sine', delay: 0.07 }); },
    hurt() { burst({ dur: 0.1, freq: 300, gain: 0.35, type: 'lowpass' }); },
    buy() { tone({ freq: 1040, dur: 0.06, gain: 0.2, type: 'sine' }); tone({ freq: 1560, dur: 0.09, gain: 0.2, type: 'sine', delay: 0.06 }); },
    denied() { tone({ freq: 180, dur: 0.12, gain: 0.25, type: 'sawtooth' }); },
    plantBeep(final) { tone({ freq: final ? 1760 : 1180, dur: final ? 0.16 : 0.07, gain: 0.28, type: 'sine' }); },
    planting() { tone({ freq: 660, dur: 0.05, gain: 0.15, type: 'sine' }); },
    horn(win) {
      tone({ freq: win ? 523 : 392, dur: 0.16, gain: 0.3, type: 'triangle' });
      tone({ freq: win ? 784 : 311, dur: 0.26, gain: 0.3, type: 'triangle', delay: 0.15 });
    },
    explosion() {
      burst({ dur: 0.9, freq: 400, gain: 0.9, type: 'lowpass', sweepTo: 60 });
      tone({ freq: 90, dur: 0.7, gain: 0.5, type: 'sine', sweepTo: 34 });
    },
    grenade() { burst({ dur: 0.45, freq: 500, gain: 0.7, type: 'lowpass', sweepTo: 90 }); },
    throwWhoosh() { burst({ dur: 0.16, freq: 900, gain: 0.15, sweepTo: 2400 }); },
  };
}
