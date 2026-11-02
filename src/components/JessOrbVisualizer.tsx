import React, { useEffect, useRef } from 'react';
import { JessState } from '../services/liveAudioClient';

export function JessOrbVisualizer({ state, inputLevel, outputLevel, connected }: { state: JessState; inputLevel: number; outputLevel: number; connected: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let phase = 0;

    const render = () => {
      phase += 0.04;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.clearRect(0, 0, width, height);

      const speaking = state === 'speaking';
      const listening = state === 'listening';
      const thinking = state === 'thinking';
      const interrupted = state === 'interrupted';
      const error = state === 'error';
      const intensity = speaking
        ? Math.min(1.2, outputLevel * 2.8 + 0.15)
        : listening
        ? Math.min(1, inputLevel * 2.5 + 0.08)
        : thinking
        ? 0.35 + Math.sin(phase * 2) * 0.15
        : interrupted || error ? 0.18 : 0.12;
      const baseRadius = Math.min(width, height) * 0.24 + intensity * Math.min(width, height) * 0.11;

      const ambient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.4, centerX, centerY, baseRadius * 2.2);
      if (error) {
        ambient.addColorStop(0, 'rgba(244,63,94,.40)');
        ambient.addColorStop(1, 'rgba(0,0,0,0)');
      } else if (speaking) {
        ambient.addColorStop(0, 'rgba(234,179,8,.45)');
        ambient.addColorStop(.5, 'rgba(217,119,6,.20)');
        ambient.addColorStop(1, 'rgba(0,0,0,0)');
      } else if (listening) {
        ambient.addColorStop(0, 'rgba(45,212,191,.40)');
        ambient.addColorStop(.5, 'rgba(14,165,233,.18)');
        ambient.addColorStop(1, 'rgba(0,0,0,0)');
      } else if (thinking) {
        ambient.addColorStop(0, 'rgba(168,85,247,.40)');
        ambient.addColorStop(.5, 'rgba(234,179,8,.20)');
        ambient.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        ambient.addColorStop(0, 'rgba(212,175,55,.15)');
        ambient.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = ambient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      const rings = connected ? 3 : 1;
      for (let ring = 0; ring < rings; ring++) {
        ctx.beginPath();
        const ringRadius = baseRadius + (ring + 1) * (14 + intensity * 12);
        for (let i = 0; i <= 64; i++) {
          const angle = i / 64 * Math.PI * 2;
          const harmonic = Math.sin(angle * (4 + ring) + phase * (ring % 2 === 0 ? 1.5 : -1.5));
          const radius = ringRadius + harmonic * intensity * (10 + ring * 6);
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.lineWidth = speaking ? 2.5 : 1.5;
        ctx.strokeStyle = error ? `rgba(244,63,94,${0.45 - ring * .12})` : speaking ? `rgba(250,204,21,${0.45 - ring * .12})` : listening ? `rgba(94,234,212,${0.45 - ring * .12})` : thinking ? `rgba(192,132,252,${0.4 - ring * .1})` : `rgba(212,175,55,${0.2 - ring * .05})`;
        ctx.stroke();
      }

      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const angle = i / 48 * Math.PI * 2;
        const wave1 = Math.sin(angle * 3 + phase * 2) * (8 * intensity);
        const wave2 = Math.cos(angle * 5 - phase * 1.5) * (5 * intensity);
        const radius = baseRadius * .85 + wave1 + wave2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();

      const core = ctx.createLinearGradient(centerX - baseRadius, centerY - baseRadius, centerX + baseRadius, centerY + baseRadius);
      if (error) { core.addColorStop(0,'#fecdd3'); core.addColorStop(.6,'#e11d48'); core.addColorStop(1,'#881337'); }
      else if (speaking) { core.addColorStop(0,'#fef08a'); core.addColorStop(.4,'#eab308'); core.addColorStop(.8,'#b45309'); core.addColorStop(1,'#78350f'); }
      else if (listening) { core.addColorStop(0,'#99f6e4'); core.addColorStop(.4,'#14b8a6'); core.addColorStop(.8,'#0f766e'); core.addColorStop(1,'#115e59'); }
      else if (thinking) { core.addColorStop(0,'#e9d5ff'); core.addColorStop(.5,'#a855f7'); core.addColorStop(1,'#581c87'); }
      else { core.addColorStop(0,'#d4af37'); core.addColorStop(.5,'#785b12'); core.addColorStop(1,'#1c1917'); }
      ctx.fillStyle = core;
      ctx.shadowColor = error ? '#fb7185' : speaking ? '#facc15' : listening ? '#2dd4bf' : '#d4af37';
      ctx.shadowBlur = connected ? 25 + intensity * 20 : 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      const highlight = ctx.createRadialGradient(centerX - baseRadius*.25, centerY - baseRadius*.25, 2, centerX - baseRadius*.2, centerY - baseRadius*.2, baseRadius*.5);
      highlight.addColorStop(0,'rgba(255,255,255,.7)');
      highlight.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = highlight;
      ctx.beginPath();
      ctx.arc(centerX - baseRadius*.2, centerY - baseRadius*.2, baseRadius*.45, 0, Math.PI*2);
      ctx.fill();

      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [state, inputLevel, outputLevel, connected]);

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      <canvas ref={canvasRef} className="w-full h-full object-contain" aria-label="Jess" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-[clamp(10px,18%,28px)] tracking-[0.18em] text-amber-100/90 font-light drop-shadow-md">JESS</span>
      </div>
    </div>
  );
}
