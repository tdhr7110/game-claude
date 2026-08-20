import { useState } from 'react';
import { GameProvider, useGame } from './ui/GameContext';
import { TitleScreen } from './ui/components/TitleScreen';
import { PrepScreen } from './ui/components/PrepScreen';
import { EnemySelectScreen } from './ui/components/EnemySelectScreen';
import { BattleScreen } from './ui/components/BattleScreen';
import { CtbBattleScreen } from './ui/components/CtbBattleScreen';
import { DropScreen } from './ui/components/DropScreen';
import { ResultScreen } from './ui/components/ResultScreen';
import { FusionScreen } from './ui/components/FusionScreen';
import { DebugPanel } from './ui/components/DebugPanel';
import { BalanceDashboard } from './ui/components/BalanceDashboard';
import { IntroModal } from './ui/components/IntroModal';
import { RewardOverlay } from './ui/components/RewardOverlay';
import { ResumePromptModal } from './ui/components/ResumePromptModal';
import { TurnBattleTestScreen } from './ui/turnTest/TurnBattleTestScreen';
import { FreeLayerTestScreen } from './ui/freeLayer/FreeLayerTestScreen';
import { STORAGE_NAMESPACE } from './persistence/storageKeys';

// TEST19: CTB(行動順可視化型コマンドバトル)プロトタイプのON/OFF設定。
// このビルド自体がCTB検証用(TEST19)なので既定はON。ただしTEST18(既存の
// オートバトル+コマンド)との比較のため、いつでもOFFへ戻せるようにする
// (要件0: TEST18を壊さない・比較対象として残す)。
const CTB_MODE_KEY = `${STORAGE_NAMESPACE}:ctb-mode:v1`;
function loadCtbModePref(): boolean {
  try {
    const raw = localStorage.getItem(CTB_MODE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}
function saveCtbModePref(v: boolean) {
  try {
    localStorage.setItem(CTB_MODE_KEY, v ? '1' : '0');
  } catch {
    // 保存容量オーバーなどは無視(設定記憶は補助機能のため、ゲーム進行自体には影響させない)
  }
}

function Root({
  onOpenTurnTest,
  onOpenFreeLayerTest,
  ctbMode,
  onToggleCtbMode,
}: {
  onOpenTurnTest: () => void;
  onOpenFreeLayerTest: () => void;
  ctbMode: boolean;
  onToggleCtbMode: () => void;
}) {
  const { state } = useGame();
  // TEST6由来: 戦闘画面は1画面に収め、ページ全体のスクロールが発生しないようにする
  // (app-root--pinnedでビューポート高に固定し、内部は縮小・内部スクロールできるようにする)。
  // TEST18: 戦闘準備画面もタブ切替でページ全体がスクロールしないよう、同じ固定ビューポート方式にする。
  const pinned = state.phase === 'battle' || state.phase === 'prep';
  return (
    <div className={`app-root${pinned ? ' app-root--pinned' : ''}`}>
      {state.phase === 'prep' && <PrepScreen />}
      {state.phase === 'enemySelect' && <EnemySelectScreen />}
      {/* TEST19: CTBモードがONの間だけ戦闘画面をCtbBattleScreenへ差し替える。
          既存のBattleScreen(TEST18・連続時間オートバトル)は削除せず、OFF時はそのまま動く。 */}
      {state.phase === 'battle' && (ctbMode ? <CtbBattleScreen /> : <BattleScreen />)}
      {state.phase === 'fusion' && <FusionScreen />}
      {state.phase === 'drop' && <DropScreen />}
      {state.phase === 'result' && <ResultScreen />}
      <DebugPanel onOpenTurnTest={onOpenTurnTest} onOpenFreeLayerTest={onOpenFreeLayerTest} ctbMode={ctbMode} onToggleCtbMode={onToggleCtbMode} />
      <BalanceDashboard />
      <IntroModal />
      {/* 報酬演出(部位獲得/コマンド獲得/コマンド進化)は画面フェーズに関わらず
          同じオーバーレイとして最前面に重ねる(報酬フロー中に画面遷移させないため)。 */}
      <RewardOverlay />
      {/* ラン途中保存の再開プロンプト(優先6)。有効な保存がある間だけ他の全てより上に表示する。 */}
      <ResumePromptModal />
    </div>
  );
}

export default function App() {
  // コマンドバトルTESTは既存のラン進行(GameProvider/RunState)を一切変更しない
  // 独立したオーバーレイ画面として重ねて表示する（既存のオートバトルは裏で維持されたまま）。
  const [showTurnTest, setShowTurnTest] = useState(false);
  // TEST11: 自由合体レイヤー表示TESTも同様に、既存のラン進行を一切変更しない独立オーバーレイとして重ねる。
  const [showFreeLayerTest, setShowFreeLayerTest] = useState(false);
  // TEST18: タイトル画面はRunState/GameContextとは独立したローカルUI状態として持つ。
  // ゲーム進行ロジック・セーブ機構には一切影響させず、「GAME START」を押すまで
  // 既存の戦闘準備画面(Root)を表示しないだけのシンプルな出し分けにする。
  const [showTitle, setShowTitle] = useState(true);
  const [ctbMode, setCtbModeState] = useState(loadCtbModePref);
  function toggleCtbMode() {
    setCtbModeState((v) => {
      const next = !v;
      saveCtbModePref(next);
      return next;
    });
  }
  return (
    <GameProvider>
      {showTitle ? (
        <TitleScreen onStart={() => setShowTitle(false)} />
      ) : (
        <Root
          onOpenTurnTest={() => setShowTurnTest(true)}
          onOpenFreeLayerTest={() => setShowFreeLayerTest(true)}
          ctbMode={ctbMode}
          onToggleCtbMode={toggleCtbMode}
        />
      )}
      {showTurnTest && <TurnBattleTestScreen onExit={() => setShowTurnTest(false)} />}
      {showFreeLayerTest && <FreeLayerTestScreen onExit={() => setShowFreeLayerTest(false)} />}
    </GameProvider>
  );
}
