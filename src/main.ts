import './style.css';
import { Game } from './game';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui') as HTMLElement | null;
  if (!canvas || !uiRoot) {
    throw new Error('game canvas or ui root is missing');
  }

  const preventGesture = (e: Event): void => {
    e.preventDefault();
  };
  document.addEventListener('gesturestart', preventGesture);
  document.addEventListener('contextmenu', preventGesture);
  document.addEventListener('dblclick', preventGesture);

  // blocks the pull-to-refresh gesture on mobile
  document.body.addEventListener('touchmove', (e) => {
    if ((e.target as HTMLElement)?.closest('.menu, .pause')) return;
    e.preventDefault();
  }, { passive: false });

  const game = new Game({ canvas, uiRoot });
  (window as unknown as { game: Game }).game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
