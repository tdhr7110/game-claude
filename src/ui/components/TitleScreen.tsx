import { useState } from 'react';
import { useGame } from '../GameContext';
import { ChimeraGalleryModal } from './ChimeraGalleryModal';
import { SettingsModal } from './SettingsModal';

const GAME_VERSION_LABEL = 'v0.1.0-test13';

export function TitleScreen() {
  const { hasSavedRun, goToCoreSelect, continueRun } = useGame();
  const [showGallery, setShowGallery] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [continueFailed, setContinueFailed] = useState(false);

  function handleContinue() {
    const ok = continueRun();
    if (!ok) setContinueFailed(true);
  }

  return (
    <div className="screen title-screen">
      <div className="title-screen__hero">
        <div className="title-screen__emblem">🧬</div>
        <h1 className="title-screen__name">キメラバトル</h1>
        <p className="title-screen__catch">部位を集め、キメラを育て、最終ボスを倒せ</p>
      </div>

      <div className="title-screen__menu">
        <button className="btn btn--primary btn--large btn--block" onClick={goToCoreSelect}>
          ▶ はじめから
        </button>
        <button className="btn btn--large btn--block" disabled={!hasSavedRun} onClick={handleContinue}>
          ⏯ つづきから
        </button>
        {continueFailed && <p className="title-screen__error">セーブデータの読み込みに失敗しました。「はじめから」をお試しください。</p>}
        <button className="btn btn--block" onClick={() => setShowGallery(true)}>
          🏛️ 図鑑
        </button>
        <button className="btn btn--block" onClick={() => setShowSettings(true)}>
          🔊 音量設定
        </button>
      </div>

      <div className="title-screen__version">{GAME_VERSION_LABEL}</div>

      {showGallery && <ChimeraGalleryModal onClose={() => setShowGallery(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
