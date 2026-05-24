"use client";

import { Gauge } from "lucide-react";

interface PlaybackSpeedSliderProps {
    rate: number;
    onChange: (rate: number) => void;
    className?: string;
}

export function PlaybackSpeedSlider({ rate, onChange, className }: PlaybackSpeedSliderProps) {
    return (
        <div
            className={[
                "flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2",
                className ?? "",
            ].join(" ")}
        >
            <Gauge className="h-4 w-4 text-gray-500" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-700">Speed</span>
            <input
                type="range"
                min={0.5}
                max={1.0}
                step={0.05}
                value={rate}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                aria-label="Playback speed"
                className="flex-1 h-2 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
            />
            <span className="tabular-nums text-sm font-semibold text-gray-800 w-12 text-right">
                {rate.toFixed(2)}×
            </span>
        </div>
    );
}
