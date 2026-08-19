import { useState } from 'react';
import { useGame } from '../GameContext';
import { battleSlotLabelForIndex, getMaxHp, TOTAL_BATTLES } from '../../engine/run';
import '../codex.css';

// ラン途中保存(優先6)の起動時プロンプト。有効な保存が見つかった場合のみ表示し、
// 「続きから」「新しいラン」を選ばせる。新しいランを選んだ場合は誤操作防止のため
// 一段階確認を挟む(途中保存を削除するため)。
export function ResumePromptModal() {
  const { pendingResume, resumeRun, discardResumeAndStartNew } = useGame();
  const [confirmingNew, setConfirmingNew] = useState(false);

  if (!pendingResume) return null;

  const maxHp = getMaxHp(pendingResume);
  const slotLabel = battleSlotLabelForIndex(pendingResume.battleIndex);

  return (
    <div className="intro-overlay resume-prompt-overlay">
      <div className="intro-card resume-prompt-card">
        {!confirmingNew ? (
          <>
            <div className="intro-card__title">💾 途中保存が見つかりました</div>
            <div className="resume-prompt__summary">
              <div>
                第{pendingResume.battleIndex}戦 / 全{TOTAL_BATTLES}戦（{slotLabel}）
              </div>
              <div>
                ❤️ コアHP {pendingResume.coreHp} / {maxHp} ・ 🦴 装着部位 {pendingResume.equipped.length}個
              </div>
            </div>
            <p className="intro-card__hint">前回の続きから再開するか、途中保存を破棄して新しいランを始めるか選んでください。</p>
            <div className="resume-prompt__actions">
              <button className="btn btn--primary btn--large btn--block" onClick={resumeRun}>
                ▶️ 続きから
              </button>
              <button className="btn btn--ghost btn--block" onClick={() => setConfirmingNew(true)}>
                🔄 新しいランを始める
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="intro-card__title">⚠️ 新しいランを始めますか？</div>
            <p className="intro-card__hint">現在の途中保存は削除され、元に戻せません。よろしいですか？</p>
            <div className="resume-prompt__actions">
              <button className="btn btn--danger btn--large btn--block" onClick={discardResumeAndStartNew}>
                はい、新しいランを始める
              </button>
              <button className="btn btn--ghost btn--block" onClick={() => setConfirmingNew(false)}>
                戻る
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
