import { GameContainer } from '@/components/game/GameContainer';

export default function GamePage() {
  return (
    <main className="game-page">
      <div className="game-frame">
        <GameContainer />
      </div>
    </main>
  );
}
