"use client";

interface SnowmanSVGProps {
    wrongGuesses: number; // 0-10
    className?: string;
}

/**
 * SVG Snowman that progressively loses parts as wrong guesses increase.
 * 
 * Removal order:
 * 1. Right arm
 * 2. Left arm
 * 3. Buttons
 * 4. Mouth
 * 5. Nose
 * 6. Eyes
 * 7. Hat
 * 8. Top circle (head)
 * 9. Middle circle (torso)
 * 10. Bottom circle (base) — game over / fully melted
 */
export function SnowmanSVG({ wrongGuesses, className = "" }: SnowmanSVGProps) {
    const show = (threshold: number) => wrongGuesses < threshold;

    const showRightArm = show(1);
    const showLeftArm = show(2);
    const showButtons = show(3);
    const showMouth = show(4);
    const showNose = show(5);
    const showEyes = show(6);
    const showHat = show(7);
    const showHead = show(8);
    const showMiddle = show(9);
    const showBottom = show(10);

    return (
        <svg
            viewBox="0 0 200 280"
            className={`transition-all duration-500 ${className}`}
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Ground / snow */}
            <ellipse cx="100" cy="268" rx="80" ry="12" fill="#e0e7ff" opacity="0.6" />

            {/* Bottom circle (base) */}
            {showBottom && (
                <g className="animate-in fade-in duration-300">
                    <circle cx="100" cy="220" r="50" fill="white" stroke="#cbd5e1" strokeWidth="2" />
                    {/* Snow texture */}
                    <circle cx="80" cy="230" r="3" fill="#e2e8f0" opacity="0.5" />
                    <circle cx="120" cy="210" r="2" fill="#e2e8f0" opacity="0.4" />
                </g>
            )}

            {/* Middle circle (torso) */}
            {showMiddle && (
                <g className="animate-in fade-in duration-300">
                    <circle cx="100" cy="150" r="38" fill="white" stroke="#cbd5e1" strokeWidth="2" />
                    <circle cx="115" cy="140" r="2" fill="#e2e8f0" opacity="0.4" />
                </g>
            )}

            {/* Head (top circle) */}
            {showHead && (
                <g className="animate-in fade-in duration-300">
                    <circle cx="100" cy="90" r="30" fill="white" stroke="#cbd5e1" strokeWidth="2" />
                    <circle cx="90" cy="80" r="2" fill="#e2e8f0" opacity="0.4" />
                </g>
            )}

            {/* Hat */}
            {showHat && showHead && (
                <g className="animate-in fade-in duration-300">
                    {/* Hat brim */}
                    <rect x="68" y="60" width="64" height="6" rx="3" fill="#1e293b" />
                    {/* Hat top */}
                    <rect x="78" y="28" width="44" height="34" rx="4" fill="#1e293b" />
                    {/* Hat band */}
                    <rect x="78" y="48" width="44" height="8" rx="2" fill="#dc2626" />
                </g>
            )}

            {/* Eyes */}
            {showEyes && showHead && (
                <g className="animate-in fade-in duration-300">
                    {/* Left eye */}
                    <circle cx="88" cy="84" r="4" fill="#1e293b" />
                    <circle cx="87" cy="83" r="1.5" fill="white" opacity="0.6" />
                    {/* Right eye */}
                    <circle cx="112" cy="84" r="4" fill="#1e293b" />
                    <circle cx="111" cy="83" r="1.5" fill="white" opacity="0.6" />
                </g>
            )}

            {/* Nose (carrot) */}
            {showNose && showHead && (
                <g className="animate-in fade-in duration-300">
                    <polygon points="100,92 120,97 100,100" fill="#f97316" stroke="#ea580c" strokeWidth="1" />
                </g>
            )}

            {/* Mouth */}
            {showMouth && showHead && (
                <g className="animate-in fade-in duration-300">
                    <circle cx="88" cy="106" r="2" fill="#475569" />
                    <circle cx="94" cy="109" r="2" fill="#475569" />
                    <circle cx="100" cy="110" r="2" fill="#475569" />
                    <circle cx="106" cy="109" r="2" fill="#475569" />
                    <circle cx="112" cy="106" r="2" fill="#475569" />
                </g>
            )}

            {/* Buttons */}
            {showButtons && showMiddle && (
                <g className="animate-in fade-in duration-300">
                    <circle cx="100" cy="133" r="4" fill="#1e293b" />
                    <circle cx="100" cy="150" r="4" fill="#1e293b" />
                    <circle cx="100" cy="167" r="4" fill="#1e293b" />
                </g>
            )}

            {/* Right arm (stick) */}
            {showRightArm && showMiddle && (
                <g className="animate-in fade-in duration-300">
                    <line x1="138" y1="145" x2="178" y2="120" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
                    {/* Fingers/twigs */}
                    <line x1="168" y1="126" x2="175" y2="115" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="172" y1="123" x2="182" y2="118" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
                </g>
            )}

            {/* Left arm (stick) */}
            {showLeftArm && showMiddle && (
                <g className="animate-in fade-in duration-300">
                    <line x1="62" y1="145" x2="22" y2="120" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
                    {/* Fingers/twigs */}
                    <line x1="32" y1="126" x2="25" y2="115" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="28" y1="123" x2="18" y2="118" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" />
                </g>
            )}

            {/* Scarf (always shown if head and middle exist) */}
            {showHead && showMiddle && (
                <g>
                    <path d="M72 112 Q100 125 128 112" fill="none" stroke="#dc2626" strokeWidth="8" strokeLinecap="round" />
                    <rect x="110" y="112" width="8" height="22" rx="3" fill="#dc2626" />
                    <rect x="110" y="112" width="8" height="22" rx="3" fill="#b91c1c" opacity="0.3" />
                </g>
            )}

            {/* Puddle shown when snowman is fully melted */}
            {!showBottom && (
                <g className="animate-in fade-in duration-500">
                    <ellipse cx="100" cy="260" rx="60" ry="10" fill="#bfdbfe" opacity="0.7" />
                    <ellipse cx="100" cy="258" rx="45" ry="6" fill="#93c5fd" opacity="0.5" />
                    {/* Carrot left behind */}
                    <polygon points="95,252 115,257 95,260" fill="#f97316" stroke="#ea580c" strokeWidth="1" />
                    {/* Buttons left behind */}
                    <circle cx="85" cy="256" r="3" fill="#1e293b" />
                    <circle cx="108" cy="260" r="3" fill="#1e293b" />
                </g>
            )}
        </svg>
    );
}
