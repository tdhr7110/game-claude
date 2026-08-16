import { GameProvider, useGame } from './ui/GameContext';
import { PrepScreen } from './ui/components/PrepScreen';
import { BattleScreen } from './ui/components/BattleScreen';
import { DropScreen } from './ui/components/DropScreen';
import { ResultScreen } from './ui/components/ResultScreen';
import { DebugPanel } from './ui/components/DebugPanel';

function Root() {
  const { state } = useGame();
  return (
    <div className="app-root">
      {state.phase === 'prep' && <PrepScreen />}
      {state.phase === 'battle' && <BattleScreen />}
      {state.phase === 'drop' && <DropScreen />}
      {state.phase === 'result' && <ResultScreen />}
      <DebugPanel />
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Root />
    </GameProvider>
  );
}
