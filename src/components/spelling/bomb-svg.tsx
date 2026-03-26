"use client";

interface BombSVGProps {
    wrongGuesses: number; // 0-10
    className?: string;
}

/**
 * A bomb with a fuse that gets shorter with each wrong guess.
 * At 10 wrong guesses, the bomb explodes.
 */
export function BombSVG({ wrongGuesses, className = "" }: BombSVGProps) {
    const fuseLength = Math.max(0, 10 - wrongGuesses); // 10 = full, 0 = exploded
    const isExploded = wrongGuesses >= 10;

    // Fuse path points - from bomb top curving upward
    const fuseStartX = 118;
    const fuseStartY = 78;
    const fuseFullEndX = 160;
    const fuseFullEndY = 20;

    // Interpolate fuse end position based on remaining length
    const fuseFraction = fuseLength / 10;
    const fuseEndX = fuseStartX + (fuseFullEndX - fuseStartX) * fuseFraction;
    const fuseEndY = fuseStartY + (fuseFullEndY - fuseStartY) * fuseFraction;
    const fuseMidX = fuseStartX + (140 - fuseStartX) * fuseFraction;
    const fuseMidY = fuseStartY + (40 - fuseStartY) * fuseFraction;

    return (
        <svg
            viewBox="0 0 200 280"
            className={`transition-all duration-500 ${className}`}
            xmlns="http://www.w3.org/2000/svg"
        >
            {!isExploded ? (
                <>
                    {/* Bomb body */}
                    <ellipse cx="100" cy="160" rx="55" ry="60" fill="#2d3748" />
                    {/* Bomb highlight */}
                    <ellipse cx="85" cy="140" rx="20" ry="25" fill="#4a5568" opacity="0.5" />
                    {/* Small shine */}
                    <ellipse cx="78" cy="132" rx="8" ry="10" fill="#718096" opacity="0.4" />

                    {/* Bomb top nub */}
                    <rect x="95" y="98" width="18" height="12" rx="3" fill="#4a5568" />
                    <rect x="92" y="94" width="24" height="8" rx="3" fill="#718096" />

                    {/* Fuse */}
                    {fuseLength > 0 && (
                        <g>
                            <path
                                d={`M ${fuseStartX} ${fuseStartY} Q ${fuseMidX} ${fuseMidY} ${fuseEndX} ${fuseEndY}`}
                                fill="none"
                                stroke="#A0522D"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                            {/* Spark at end of fuse */}
                            <circle cx={fuseEndX} cy={fuseEndY} r="4" fill="#f6ad55">
                                <animate attributeName="r" values="3;5;3" dur="0.4s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="1;0.6;1" dur="0.3s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={fuseEndX} cy={fuseEndY} r="2" fill="#fc8181">
                                <animate attributeName="r" values="1;3;1" dur="0.3s" repeatCount="indefinite" />
                            </circle>
                        </g>
                    )}

                    {/* Fuse is gone - about to blow */}
                    {fuseLength === 0 && (
                        <g>
                            <circle cx={fuseStartX} cy={fuseStartY} r="6" fill="#fc8181">
                                <animate attributeName="r" values="4;8;4" dur="0.2s" repeatCount="indefinite" />
                            </circle>
                        </g>
                    )}

                    {/* Danger indicators as fuse gets shorter */}
                    {wrongGuesses >= 5 && (
                        <text x="100" y="250" textAnchor="middle" fontSize="14" fill="#e53e3e" fontWeight="bold">
                            <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
                            {wrongGuesses >= 8 ? "DANGER!!!" : "Warning!"}
                        </text>
                    )}

                    {/* Ground shadow */}
                    <ellipse cx="100" cy="225" rx="50" ry="8" fill="#e2e8f0" opacity="0.5" />
                </>
            ) : (
                /* Explosion! */
                <g className="animate-in fade-in duration-300">
                    {/* Explosion bursts */}
                    <polygon points="100,40 115,100 140,50 125,110 170,80 130,125 180,130 130,145 160,180 115,160 130,210 100,170 70,210 85,160 40,180 70,145 20,130 70,125 30,80 75,110 60,50 85,100" fill="#f6ad55" />
                    <polygon points="100,60 112,110 135,70 120,118 158,95 125,130 168,140 125,148 150,175 112,158 125,200 100,168 75,200 88,158 50,175 75,148 32,140 75,130 42,95 80,118 65,70 88,110" fill="#fc8181" />
                    <polygon points="100,80 108,115 128,88 115,122 145,108 120,135 155,140 120,145 140,165 108,155 118,185 100,160 82,185 92,155 60,165 80,145 45,140 80,135 55,108 85,122 72,88 92,115" fill="#fed7d7" />

                    {/* Center flash */}
                    <circle cx="100" cy="140" r="25" fill="white" opacity="0.8">
                        <animate attributeName="r" values="25;35;0" dur="0.8s" fill="freeze" />
                        <animate attributeName="opacity" values="0.8;0.4;0" dur="0.8s" fill="freeze" />
                    </circle>

                    {/* Debris */}
                    <circle cx="60" cy="70" r="5" fill="#2d3748" />
                    <circle cx="150" cy="60" r="4" fill="#2d3748" />
                    <circle cx="40" cy="150" r="6" fill="#2d3748" />
                    <circle cx="165" cy="170" r="3" fill="#2d3748" />
                    <rect x="75" y="210" width="8" height="4" rx="1" fill="#2d3748" transform="rotate(25 79 212)" />
                    <rect x="130" y="200" width="6" height="3" rx="1" fill="#2d3748" transform="rotate(-15 133 201)" />

                    {/* Smoke clouds */}
                    <circle cx="70" cy="100" r="15" fill="#a0aec0" opacity="0.4" />
                    <circle cx="140" cy="90" r="12" fill="#a0aec0" opacity="0.3" />
                    <circle cx="100" cy="70" r="18" fill="#cbd5e0" opacity="0.3" />

                    <text x="100" y="260" textAnchor="middle" fontSize="18" fill="#e53e3e" fontWeight="bold">
                        BOOM!
                    </text>
                </g>
            )}
        </svg>
    );
}
