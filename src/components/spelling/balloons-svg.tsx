"use client";

interface BalloonsSVGProps {
    wrongGuesses: number; // 0-10
    className?: string;
}

const BALLOON_COLORS = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f43f5e", // rose
];

// Balloon positions - arranged in a cluster above the person
const BALLOON_POSITIONS = [
    { cx: 60, cy: 55, color: BALLOON_COLORS[0] },
    { cx: 85, cy: 35, color: BALLOON_COLORS[1] },
    { cx: 110, cy: 25, color: BALLOON_COLORS[2] },
    { cx: 135, cy: 35, color: BALLOON_COLORS[3] },
    { cx: 155, cy: 55, color: BALLOON_COLORS[4] },
    { cx: 50, cy: 80, color: BALLOON_COLORS[5] },
    { cx: 75, cy: 65, color: BALLOON_COLORS[6] },
    { cx: 125, cy: 60, color: BALLOON_COLORS[7] },
    { cx: 148, cy: 80, color: BALLOON_COLORS[8] },
    { cx: 100, cy: 48, color: BALLOON_COLORS[9] },
];

/**
 * A person holding balloons that pop one at a time with each wrong guess.
 * When all balloons are gone, the person floats away... or is just sad.
 */
export function BalloonsSVG({ wrongGuesses, className = "" }: BalloonsSVGProps) {
    const balloonsRemaining = 10 - wrongGuesses;
    const allPopped = wrongGuesses >= 10;

    return (
        <svg
            viewBox="0 0 200 280"
            className={`transition-all duration-500 ${className}`}
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Ground */}
            <ellipse cx="100" cy="268" rx="60" ry="8" fill="#86efac" opacity="0.5" />
            <rect x="0" y="270" width="200" height="10" fill="#86efac" opacity="0.3" />

            {/* Balloon strings (drawn first, behind person) */}
            {BALLOON_POSITIONS.map((balloon, i) => {
                if (i >= balloonsRemaining) return null;
                return (
                    <line
                        key={`string-${i}`}
                        x1={100}
                        y1={170}
                        x2={balloon.cx}
                        y2={balloon.cy + 18}
                        stroke="#9ca3af"
                        strokeWidth="1"
                        opacity="0.6"
                    />
                );
            })}

            {/* Person */}
            <g>
                {/* Body */}
                <line x1="100" y1="200" x2="100" y2="245" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />

                {/* Legs */}
                <line x1="100" y1="245" x2="85" y2="265" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />
                <line x1="100" y1="245" x2="115" y2="265" stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />

                {/* Left arm - holding strings up */}
                <line x1="100" y1="210" x2="85" y2={allPopped ? 230 : 175} stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />

                {/* Right arm - holding strings up */}
                <line x1="100" y1="210" x2="115" y2={allPopped ? 230 : 175} stroke="#4a5568" strokeWidth="3" strokeLinecap="round" />

                {/* Head */}
                <circle cx="100" cy="190" r="14" fill="#fcd34d" stroke="#4a5568" strokeWidth="2" />

                {/* Face */}
                {!allPopped ? (
                    <>
                        {/* Happy eyes */}
                        <circle cx="95" cy="188" r="2" fill="#4a5568" />
                        <circle cx="105" cy="188" r="2" fill="#4a5568" />
                        {/* Smile - gets smaller as balloons pop */}
                        {balloonsRemaining > 5 ? (
                            <path d="M93 195 Q100 201 107 195" fill="none" stroke="#4a5568" strokeWidth="1.5" />
                        ) : balloonsRemaining > 2 ? (
                            <line x1="95" y1="196" x2="105" y2="196" stroke="#4a5568" strokeWidth="1.5" />
                        ) : (
                            <path d="M93 198 Q100 194 107 198" fill="none" stroke="#4a5568" strokeWidth="1.5" />
                        )}
                    </>
                ) : (
                    <>
                        {/* Sad face */}
                        <line x1="93" y1="186" x2="97" y2="190" stroke="#4a5568" strokeWidth="1.5" />
                        <line x1="97" y1="186" x2="93" y2="190" stroke="#4a5568" strokeWidth="1.5" />
                        <line x1="103" y1="186" x2="107" y2="190" stroke="#4a5568" strokeWidth="1.5" />
                        <line x1="107" y1="186" x2="103" y2="190" stroke="#4a5568" strokeWidth="1.5" />
                        {/* Big frown */}
                        <path d="M92 199 Q100 193 108 199" fill="none" stroke="#4a5568" strokeWidth="2" />
                        {/* Tear */}
                        <ellipse cx="108" cy="192" rx="2" ry="3" fill="#60a5fa" opacity="0.7" />
                    </>
                )}
            </g>

            {/* Balloons - rendered last so they're on top */}
            {BALLOON_POSITIONS.map((balloon, i) => {
                if (i >= balloonsRemaining) return null;
                return (
                    <g key={`balloon-${i}`} className="animate-in fade-in duration-300">
                        {/* Balloon body */}
                        <ellipse
                            cx={balloon.cx}
                            cy={balloon.cy}
                            rx="16"
                            ry="20"
                            fill={balloon.color}
                            opacity="0.85"
                        />
                        {/* Balloon highlight */}
                        <ellipse
                            cx={balloon.cx - 5}
                            cy={balloon.cy - 6}
                            rx="5"
                            ry="7"
                            fill="white"
                            opacity="0.3"
                        />
                        {/* Balloon tie */}
                        <polygon
                            points={`${balloon.cx - 3},${balloon.cy + 19} ${balloon.cx + 3},${balloon.cy + 19} ${balloon.cx},${balloon.cy + 24}`}
                            fill={balloon.color}
                        />
                    </g>
                );
            })}

            {/* Pop effects for recently popped balloons */}
            {BALLOON_POSITIONS.map((balloon, i) => {
                if (i !== balloonsRemaining) return null; // Only show for the most recently popped
                return (
                    <g key={`pop-${i}`} className="animate-in fade-in duration-200">
                        <text x={balloon.cx} y={balloon.cy} textAnchor="middle" fontSize="16" fill={balloon.color}>
                            POP!
                        </text>
                        {/* Burst lines */}
                        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                            const rad = (angle * Math.PI) / 180;
                            const x1 = balloon.cx + Math.cos(rad) * 12;
                            const y1 = balloon.cy + Math.sin(rad) * 12;
                            const x2 = balloon.cx + Math.cos(rad) * 20;
                            const y2 = balloon.cy + Math.sin(rad) * 20;
                            return (
                                <line
                                    key={angle}
                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={balloon.color}
                                    strokeWidth="1.5"
                                    opacity="0.6"
                                />
                            );
                        })}
                    </g>
                );
            })}

            {/* All popped message */}
            {allPopped && (
                <text x="100" y="140" textAnchor="middle" fontSize="16" fill="#e53e3e" fontWeight="bold">
                    All gone!
                </text>
            )}
        </svg>
    );
}
