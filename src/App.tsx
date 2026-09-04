import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame, {
    EventBus,
    EVT_SCENE_READY,
    EVT_PHASE_CHANGED,
    EVT_CHARACTER_POS,
    EVT_TOGGLE_PAUSE,
    EVT_RESET_CHARACTER,
    EVT_SET_TOUCH,
    EVT_TOUCH_JUMP,
} from './game/main';

interface PosTelemetry {
    x: number;
    y: number;
    state: string;
    grounded: boolean;
}

function App() {
    const gameRef = useRef<Phaser.Game | null>(null);
    const [phase, setPhase] = useState<'BOOT' | 'PLAYING' | 'PAUSED'>('BOOT');
    const [pos, setPos] = useState<PosTelemetry>({ x: 150, y: 350, state: 'idle', grounded: false });

    useLayoutEffect(() => {
        if (gameRef.current === null) {
            gameRef.current = StartGame('game-container');
        }
        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, []);

    useEffect(() => {
        const onPhase = (p: 'PLAYING' | 'PAUSED') => setPhase(p);
        const onPos = (data: PosTelemetry) => setPos(data);
        EventBus.on(EVT_PHASE_CHANGED, onPhase);
        EventBus.on(EVT_CHARACTER_POS, onPos);
        return () => {
            EventBus.off(EVT_PHASE_CHANGED, onPhase);
            EventBus.off(EVT_CHARACTER_POS, onPos);
        };
    }, []);

    const togglePause = () => EventBus.emit(EVT_TOGGLE_PAUSE);
    const resetCharacter = () => EventBus.emit(EVT_RESET_CHARACTER);

    const hold = (side: 'left' | 'right', down: boolean) =>
        () => EventBus.emit(EVT_SET_TOUCH, { side, down });
    const touchJump = () => EventBus.emit(EVT_TOUCH_JUMP);

    return (
        <div id="app">
            <div id="game-container"></div>

            <div id="hud">
                <div className="hud-top">
                    <div className="hud-title">2D Character Test Scene</div>
                    <div className="hud-telemetry">
                        <span>X: {pos.x}</span>
                        <span>Y: {pos.y}</span>
                        <span>State: {pos.state}</span>
                        <span>Grounded: {pos.grounded ? 'yes' : 'no'}</span>
                    </div>
                    <div className="hud-buttons">
                        <button className="hud-btn" onClick={resetCharacter}>Reset (R)</button>
                        <button className="hud-btn" onClick={togglePause}>
                            {phase === 'PAUSED' ? 'Resume (P)' : 'Pause (P)'}
                        </button>
                    </div>
                </div>

                <div className="controls-legend">
                    <span>A / ← : Left</span>
                    <span>D / → : Right</span>
                    <span>W / ↑ / Space : Jump &amp; Double Jump</span>
                    <span>R : Reset</span>
                    <span>P / Esc : Pause</span>
                </div>

                <div className="touch-controls">
                    <div className="touch-left-group">
                        <button
                            className="touch-btn"
                            onPointerDown={hold('left', true)}
                            onPointerUp={hold('left', false)}
                            onPointerLeave={hold('left', false)}
                            onPointerCancel={hold('left', false)}
                        >◀</button>
                        <button
                            className="touch-btn"
                            onPointerDown={hold('right', true)}
                            onPointerUp={hold('right', false)}
                            onPointerLeave={hold('right', false)}
                            onPointerCancel={hold('right', false)}
                        >▶</button>
                    </div>
                    <button className="touch-btn touch-jump" onPointerDown={touchJump}>JUMP</button>
                </div>

                {phase === 'PAUSED' && (
                    <div className="pause-overlay">
                        <div className="pause-card">
                            <div className="pause-title">Paused</div>
                            <button className="hud-btn hud-btn-big" onClick={togglePause}>Resume</button>
                            <button className="hud-btn" onClick={resetCharacter}>Reset Character</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
