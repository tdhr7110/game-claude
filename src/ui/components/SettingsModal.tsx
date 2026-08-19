import { useState } from 'react';
import { useGame } from '../GameContext';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setVolume, resetHints } = useGame();
  const [hintResetDone, setHintResetDone] = useState(false);

  function handleResetHints() {
    resetHints();
    setHintResetDone(true);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 style={{ margin: 0, fontSize: '1.1em' }}>⚙️ 設定</h2>
          <button className="modal-card__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section__label">🔊 音量</div>
          <div className="sound-settings">
            <input
              type="range"
              className="sound-settings__volume"
              min={0}
              max={100}
              value={settings.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <span className="settings-section__value">{settings.volume}</span>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section__label">💡 場面別ヒント</div>
          <p className="muted settings-section__desc">一度読んだヒントは自動的に再表示されません。もう一度見たい場合はリセットできます。</p>
          <button className="btn btn--block" onClick={handleResetHints}>
            ヒントをリセットする
          </button>
          {hintResetDone && <p className="settings-section__done">✅ ヒントをリセットしました。該当する場面で再び表示されます。</p>}
        </div>
      </div>
    </div>
  );
}
