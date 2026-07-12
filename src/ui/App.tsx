import { useState } from 'react';
import type { JSX } from 'react';
import type { GameConfig } from '../engine/types';
import { Game } from './Game';
import { NewGame } from './NewGame';
import { Rules } from './Rules';
import { clearSave, loadSave, useGame } from './useGame';

export function App(): JSX.Element {
  const [initialSave] = useState(() => loadSave());
  const store = useGame(initialSave);
  const [screen, setScreen] = useState<'menu' | 'game'>(store.state ? 'game' : 'menu');
  const [showRules, setShowRules] = useState(false);

  const start = (config: GameConfig): void => {
    store.startGame(config);
    setScreen('game');
  };

  const exit = (): void => {
    clearSave();
    store.resign();
    setScreen('menu');
  };

  return (
    <>
      {screen === 'game' && store.state ? (
        <Game store={store} onExit={exit} onShowRules={() => setShowRules(true)} />
      ) : (
        <NewGame
          onStart={start}
          canResume={store.state !== null}
          onResume={() => setScreen('game')}
        />
      )}
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </>
  );
}
