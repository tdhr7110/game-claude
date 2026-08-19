import { useState } from 'react';
import { GameProvider, useGame } from './ui/GameContext';
import { PrepScreen } from './ui/components/PrepScreen';
import { EnemySelectScreen } from './ui/components/EnemySelectScreen';
import { BattleScreen } from './ui/components/BattleScreen';
import { DropScreen } from './ui/components/DropScreen';
import { ResultScreen } from './ui/components/ResultScreen';
import { DebugPanel } from './ui/components/DebugPanel';
import { BalanceDashboard } from './ui/components/BalanceDashboard';
import { IntroModal } from './ui/components/IntroModal';
import { RewardOverlay } from './ui/components/RewardOverlay';
import { ResumePromptModal } from './ui/components/ResumePromptModal';
import { TurnBattleTestScreen } from './ui/turnTest/TurnBattleTestScreen';

function Root({ onOpenTurnTest }: { onOpenTurnTest: () => void }) {
  const { state } = useGame();
  return (
    // TEST6由来: 戦闘画面は1画面に収め、ページ全体のスクロールが発生しないようにする
    // (app-root--battleでビューポート高に固定し、内部は縮小できるようにする)。
    <div className={`app-root${state.phase === 'battle' ? ' app-root--battle' : ''}`}>
      {state.phase === 'prep' && <PrepScreen />}
      {state.phase === 'enemySelect' && <EnemySelectScreen />}
      {state.phase === 'battle' && <BattleScreen />}
      {state.phase === 'drop' && <DropScreen />}
      {state.phase === 'result' && <ResultScreen />}
      <DebugPanel onOpenTurnTest={onOpenTurnTest} />
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
  return (
    <GameProvider>
      <Root onOpenTurnTest={() => setShowTurnTest(true)} />
      {showTurnTest && <TurnBattleTestScreen onExit={() => setShowTurnTest(false)} />}
    </GameProvider>
  );
}
