"use client";

interface HangmanSVGProps {
    wrongGuesses: number; // 0-10
    className?: string;
}

/**
 * Traditional hangman that progressively draws as wrong guesses increase.
 *
 * Drawing order:
 * 1. Base
 * 2. Vertical pole
 * 3. Top beam
 * 4. Rope
 * 5. Head
 * 6. Body
 * 7. Left arm
 * 8. Right arm
 * 9. Left leg
 * 10. Right leg — game over
 */
export function HangmanSVG({ wrongGuesses, className = "" }: HangmanSVGProps) {
    const show = (threshold: number) => wrongGuesses >= threshold;

    return (
        <svg
            viewBox="0 0 200 280"
            className={`transition-all duration-500 ${className}`}
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Ground */}
            <line x1="10" y1="270" x2="190" y2="270" stroke="#8B7355" strokeWidth="4" strokeLinecap="round" />

            {/* 1. Base */}
            {show(1) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="40" y1="270" x2="40" y2="30" stroke="#8B7355" strokeWidth="4" strokeLinecap="round" />
                </g>
            )}

            {/* 2. Top beam */}
            {show(2) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="38" y1="30" x2="120" y2="30" stroke="#8B7355" strokeWidth="4" strokeLinecap="round" />
                    {/* Support brace */}
                    <line x1="40" y1="70" x2="70" y2="30" stroke="#8B7355" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 3. Rope */}
            {show(3) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="120" y1="30" x2="120" y2="65" stroke="#A0522D" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 4. Head */}
            {show(4) && (
                <g className="animate-in fade-in duration-300">
                    <circle cx="120" cy="85" r="20" fill="none" stroke="#4a5568" strokeWidth="3" />
                    {/* Eyes - X marks */}
                    {wrongGuesses >= 10 && (
                        <>
                            <line x1="110" y1="78" x2="116" y2="84" stroke="#e53e3e" strokeWidth="2" />
                            <line x1="116" y1="78" x2="110" y2="84" stroke="#e53e3e" strokeWidth="2" />
                            <line x1="124" y1="78" x2="130" y2="84" stroke="#e53e3e" strokeWidth="2" />
                            <line x1="130" y1="78" x2="124" y2="84" stroke="#e53e3e" strokeWidth="2" />
                            {/* Frown */}
                            <path d="M112 95 Q120 88 128 95" fill="none" stroke="#e53e3e" strokeWidth="2" />
                        </>
                    )}
                    {wrongGuesses < 10 && (
                        <>
                            <circle cx="113" cy="82" r="2" fill="#4a5568" />
                            <circle cx="127" cy="82" r="2" fill="#4a5568" />
                            <path d="M113 93 Q120 98 127 93" fill="none" stroke="#4a5568" strokeWidth="1.5" />
                        </>
                    )}
                </g>
            )}

            {/* 5. Body */}
            {show(5) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="120" y1="105" x2="120" y2="175" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 6. Left arm */}
            {show(6) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="120" y1="125" x2="90" y2="155" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 7. Right arm */}
            {show(7) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="120" y1="125" x2="150" y2="155" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 8. Left leg */}
            {show(8) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="120" y1="175" x2="90" y2="220" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 9. Right leg */}
            {show(9) && (
                <g className="animate-in fade-in duration-300">
                    <line x1="120" y1="175" x2="150" y2="220" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
                </g>
            )}

            {/* 10. Game over indicator */}
            {show(10) && (
                <g className="animate-in fade-in duration-500">
                    {/* Red X overlay */}
                    <text x="100" y="255" textAnchor="middle" fontSize="18" fill="#e53e3e" fontWeight="bold">
                        GAME OVER
                    </text>
                </g>
            )}
        </svg>
    );
}
