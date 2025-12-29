
import React from 'react';
import GameView from './components/GameView';

const App: React.FC = () => {
  return (
    <div className="w-full h-full bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border-4 border-slate-700">
        <GameView />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-8 text-sm text-slate-400">
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">Q / D</span>
          <span>Move / Swing</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">Z / S</span>
          <span>Aim / Climb</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">1-4</span>
          <span>Weapons</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">Space</span>
          <span>Jump / Detach</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">Shift</span>
          <span>Fire / Release</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">E</span>
          <span>End Turn</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-slate-200">Enter</span>
          <span>Pause</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-bold text-orange-400">Esc</span>
          <span>Reset</span>
        </div>
      </div>
    </div>
  );
};

export default App;
