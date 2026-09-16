'use client';

import React from 'react';
import { Check, Palette } from 'lucide-react';
import {
  ALL_READING_ART_STYLES,
  type ReadingArtStyleId,
  type ReadingArtStyle,
} from '@/lib/reading/art-styles';
import { Badge } from '@/components/ui/badge';

interface ArtStylePickerProps {
  value: ReadingArtStyleId;
  onChange: (id: ReadingArtStyleId) => void;
  disabled?: boolean;
  className?: string;
}

export function ArtStylePicker({
  value,
  onChange,
  disabled = false,
  className = '',
}: ArtStylePickerProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-600" />
          <span>Illustration Art Style</span>
        </label>
        <span className="text-xs text-gray-500">
          Applied across all book pages for visual unity
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Illustration Art Style"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {ALL_READING_ART_STYLES.map((style) => {
          const isSelected = value === style.id;
          return (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(style.id)}
              className={`text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'border-purple-600 bg-purple-50/50 shadow-sm ring-2 ring-purple-600/20'
                  : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-gray-50/70'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" role="img" aria-label={style.label}>
                      {style.badgeEmoji}
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900 leading-tight">
                        {style.label}
                      </h4>
                      <p className="text-[11px] text-purple-700 font-medium leading-tight">
                        {style.tagline}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <p className="text-xs text-gray-600 line-clamp-2 mt-1 mb-2">
                  {style.description}
                </p>
              </div>

              <div className="pt-2 border-t border-gray-100/80 mt-auto flex items-center justify-between text-[11px]">
                <span className="text-gray-400 truncate pr-1">
                  Ideal for: <span className="text-gray-600 font-normal">{style.bestFor}</span>
                </span>
                {style.id === 'watercolor' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-50 text-gray-500 border-gray-200 shrink-0">
                    Default
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
