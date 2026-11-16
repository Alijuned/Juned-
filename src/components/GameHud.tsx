import React from 'react';
import {
  Magnet,
  Pause,
  Rocket,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { HudSnapshot, PowerUpType } from '../types/game';
import { FlutonTokenIcon } from './FlutonTokenIcon';

interface GameHudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onActivateHoverboard: () => void;
  onSkipIntro: () => void;
}

function PowerUpIcon({ type }: { type: PowerUpType }) {
  if (type === 'magnet') return <Magnet className="w-4 h-4 text-purple-300" />;
  if (type === 'shield') return <Shield className="w-4 h-4 text-purple-300" />;
  if (type === 'boost') return <Rocket className="w-4 h-4 text-purple-300" />;
  if (type === 'hoverboard') return <Zap className="w-4 h-4 text-purple-300" />;
  return <Sparkles className="w-4 h-4 text-purple-300" />;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onPause,
  onActivateHoverboard,
  onSkipIntro,
}) => {
  if (hud.phase === 'intro') {
    return (
      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="bg-[#0b0914]/90 border border-white/15 rounded-xl px-4 py-2 text-xs font-display font-bold tracking-widest text-purple-300">
            OPENING CHASE · SCENE {hud.introCaption.sceneIndex}
          </div>
          <button
            type="button"
            onClick={onSkipIntro}
            className="pointer-events-auto h-11 px-4 rounded-xl bg-[#0b0914]/92 border border-white/20 hover:border-purple-400 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            Skip Intro
          </button>
        </div>

        {hud.introCaption.visible && (
          <div className="mx-auto mb-6 max-w-xl w-full bg-[#0b0914]/92 border border-purple-500/40 rounded-2xl px-5 py-4 shadow-2xl">
            <div className="text-xs font-display font-bold tracking-wider text-purple-300">
              {hud.introCaption.speaker}
            </div>
            <div className="text-base sm:text-lg font-semibold text-white mt-1">
              {hud.introCaption.text}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Bar: Score (Left) & Tokens + Pause (Right) */}
      <div className="flex items-start justify-between gap-3">
        {/* Score Cluster */}
        <div className="bg-[#0b0914]/90 border border-white/15 rounded-xl px-4 py-2.5 shadow-xl min-w-[165px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold tracking-wider text-purple-300">
              SCORE
            </span>
            {hud.multiplier > 1 && (
              <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white font-mono-nums text-[11px] font-bold">
                {hud.multiplier}×
              </span>
            )}
          </div>
          <div className="font-mono-nums text-2xl sm:text-3xl font-bold text-white leading-tight">
            {hud.score.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-300 font-mono-nums">
            <span>BEST {hud.bestScore.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>{hud.distance}m</span>
          </div>
        </div>

        {/* Center Event Banner (Transient, non-blocking) */}
        {hud.bannerMessage && (
          <div className="hidden sm:block bg-purple-700/95 border border-purple-300/40 rounded-xl px-5 py-2 text-sm font-display font-bold tracking-wider text-white shadow-xl">
            {hud.bannerMessage}
          </div>
        )}

        {/* Right Cluster: Tokens & Pause */}
        <div className="flex items-center gap-2.5">
          <div className="bg-[#0b0914]/90 border border-purple-500/40 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-xl">
            <FlutonTokenIcon size={28} />
            <div className="text-right">
              <div className="text-[11px] text-purple-200 leading-none">Tokens</div>
              <div className="font-mono-nums text-lg sm:text-xl font-bold text-white mt-0.5">
                {hud.runTokens.toLocaleString()}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause Game"
            className="pointer-events-auto w-12 h-12 rounded-xl bg-[#0b0914]/90 border border-white/15 hover:border-purple-400 flex items-center justify-center text-white transition-colors cursor-pointer shadow-xl"
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Bar: Active Power-Up Timers & Hoverboard Trigger */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2 max-w-[230px] w-full">
          {hud.activePowerUps.map((pu) => {
            const pct = pu.type === 'shield' ? 100 : Math.max(0, Math.min(100, (pu.remaining / pu.duration) * 100));
            return (
              <div
                key={pu.type}
                className="bg-[#0b0914]/90 border border-purple-500/40 rounded-xl px-3 py-2 shadow-lg"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-white">
                  <span className="flex items-center gap-1.5">
                    <PowerUpIcon type={pu.type} />
                    <span>{pu.label}</span>
                  </span>
                  <span className="font-mono-nums text-purple-200">
                    {pu.type === 'shield' ? 'READY' : `${pu.remaining.toFixed(1)}s`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-[width] duration-75"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Manual Hoverboard Button */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onActivateHoverboard}
            disabled={hud.hoverboardActive || hud.hoverboardCharge < 100}
            className={`h-12 px-4 rounded-xl border font-display text-sm font-bold tracking-wide flex items-center gap-2 transition-colors shadow-xl ${
              hud.hoverboardActive
                ? 'bg-purple-600 border-purple-300 text-white'
                : hud.hoverboardCharge >= 100
                ? 'bg-[#0b0914]/92 border-purple-400 hover:bg-purple-600 text-white cursor-pointer'
                : 'bg-[#0b0914]/80 border-white/15 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Zap className="w-4 h-4 text-purple-300" />
            <span>
              {hud.hoverboardActive
                ? 'Board Active'
                : hud.hoverboardCharge >= 100
                ? 'Hoverboard (H)'
                : `Charging ${hud.hoverboardCharge}%`}
            </span>
          </button>
          <div className="hidden sm:block text-[11px] text-white/80 bg-[#0b0914]/75 px-2.5 py-1 rounded-md border border-white/10">
            Arrows / Swipe: Move · Up / Space: Jump · Down: Slide · Double-Tap / H: Board
          </div>
        </div>
      </div>
    </div>
  );
};
