import { useEffect, useState } from 'react';
import { GameProvider, useGame } from './ui/GameContext';
import { PrepScreen } from './ui/components/PrepScreen';
import { BattleScreen } from './ui/components/BattleScreen';
import { DropScreen } from './ui/components/DropScreen';
import { ResultScreen } from './ui/components/ResultScreen';
import { DebugPanel } from './ui/components/DebugPanel';
import { IntroModal } from './ui/components/IntroModal';
import { AdminScreen } from './ui/admin/AdminScreen';

function Root() {
  const { state } = useGame();
  return (
    <div className="app-root">
      {state.phase === 'prep' && <PrepScreen />}
      {state.phase === 'battle' && <BattleScreen />}
      {state.phase === 'drop' && <DropScreen />}
      {state.phase === 'result' && <ResultScreen />}
      <DebugPanel />
      <IntroModal />
    </div>
  );
}

// BALANCE管理画面は #admin ハッシュでのみアクセスできる、テスト版限定の開発者用画面。
// 専用ルーターは導入せず、既存のSPA構成に最も低コストで馴染む方法としてハッシュ判定のみで切り替える。
function useIsAdminRoute(): boolean {
  const [isAdmin, setIsAdmin] = useState(() => window.location.hash === '#admin');
  useEffect(() => {
    const onHashChange = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return isAdmin;
}

export default function App() {
  const isAdmin = useIsAdminRoute();
  return (
    <GameProvider>
      {isAdmin ? <AdminScreen /> : <Root />}
    </GameProvider>
  );
}
