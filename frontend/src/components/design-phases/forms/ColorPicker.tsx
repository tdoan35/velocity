/**
 * ColorPicker Component
 * Color picker with Tailwind color palette for selecting design system colors
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { ColorDefinition } from '../../../types/design-phases';

interface ColorPickerProps {
  label: string;
  value: ColorDefinition | null;
  onChange: (color: ColorDefinition) => void;
  disabled?: boolean;
}

// Tailwind color palette with hex values
const TAILWIND_COLORS: Record<string, Record<string, string>> = {
  slate: {
    '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1',
    '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155',
    '800': '#1e293b', '900': '#0f172a', '950': '#020617',
  },
  gray: {
    '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '300': '#d1d5db',
    '400': '#9ca3af', '500': '#6b7280', '600': '#4b5563', '700': '#374151',
    '800': '#1f2937', '900': '#111827', '950': '#030712',
  },
  zinc: {
    '50': '#fafafa', '100': '#f4f4f5', '200': '#e4e4e7', '300': '#d4d4d8',
    '400': '#a1a1aa', '500': '#71717a', '600': '#52525b', '700': '#3f3f46',
    '800': '#27272a', '900': '#18181b', '950': '#09090b',
  },
  neutral: {
    '50': '#fafafa', '100': '#f5f5f5', '200': '#e5e5e5', '300': '#d4d4d4',
    '400': '#a3a3a3', '500': '#737373', '600': '#525252', '700': '#404040',
    '800': '#262626', '900': '#171717', '950': '#0a0a0a',
  },
  stone: {
    '50': '#fafaf9', '100': '#f5f5f4', '200': '#e7e5e4', '300': '#d6d3d1',
    '400': '#a8a29e', '500': '#78716c', '600': '#57534e', '700': '#44403c',
    '800': '#292524', '900': '#1c1917', '950': '#0c0a09',
  },
  red: {
    '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5',
    '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c',
    '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a',
  },
  orange: {
    '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74',
    '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c',
    '800': '#9a3412', '900': '#7c2d12', '950': '#431407',
  },
  amber: {
    '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d',
    '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309',
    '800': '#92400e', '900': '#78350f', '950': '#451a03',
  },
  yellow: {
    '50': '#fefce8', '100': '#fef9c3', '200': '#fef08a', '300': '#fde047',
    '400': '#facc15', '500': '#eab308', '600': '#ca8a04', '700': '#a16207',
    '800': '#854d0e', '900': '#713f12', '950': '#422006',
  },
  lime: {
    '50': '#f7fee7', '100': '#ecfccb', '200': '#d9f99d', '300': '#bef264',
    '400': '#a3e635', '500': '#84cc16', '600': '#65a30d', '700': '#4d7c0f',
    '800': '#3f6212', '900': '#365314', '950': '#1a2e05',
  },
  green: {
    '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac',
    '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d',
    '800': '#166534', '900': '#14532d', '950': '#052e16',
  },
  emerald: {
    '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7',
    '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857',
    '800': '#065f46', '900': '#064e3b', '950': '#022c22',
  },
  teal: {
    '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4',
    '400': '#2dd4bf', '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e',
    '800': '#115e59', '900': '#134e4a', '950': '#042f2e',
  },
  cyan: {
    '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9',
    '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490',
    '800': '#155e75', '900': '#164e63', '950': '#083344',
  },
  sky: {
    '50': '#f0f9ff', '100': '#e0f2fe', '200': '#bae6fd', '300': '#7dd3fc',
    '400': '#38bdf8', '500': '#0ea5e9', '600': '#0284c7', '700': '#0369a1',
    '800': '#075985', '900': '#0c4a6e', '950': '#082f49',
  },
  blue: {
    '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd',
    '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8',
    '800': '#1e40af', '900': '#1e3a8a', '950': '#172554',
  },
  indigo: {
    '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc',
    '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca',
    '800': '#3730a3', '900': '#312e81', '950': '#1e1b4b',
  },
  violet: {
    '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd',
    '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9',
    '800': '#5b21b6', '900': '#4c1d95', '950': '#2e1065',
  },
  purple: {
    '50': '#faf5ff', '100': '#f3e8ff', '200': '#e9d5ff', '300': '#d8b4fe',
    '400': '#c084fc', '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce',
    '800': '#6b21a8', '900': '#581c87', '950': '#3b0764',
  },
  fuchsia: {
    '50': '#fdf4ff', '100': '#fae8ff', '200': '#f5d0fe', '300': '#f0abfc',
    '400': '#e879f9', '500': '#d946ef', '600': '#c026d3', '700': '#a21caf',
    '800': '#86198f', '900': '#701a75', '950': '#4a044e',
  },
  pink: {
    '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4',
    '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d',
    '800': '#9d174d', '900': '#831843', '950': '#500724',
  },
  rose: {
    '50': '#fff1f2', '100': '#ffe4e6', '200': '#fecdd3', '300': '#fda4af',
    '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c',
    '800': '#9f1239', '900': '#881337', '950': '#4c0519',
  },
};

// Color hue names for display
const COLOR_HUES = Object.keys(TAILWIND_COLORS);
const SHADE_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

export function ColorPicker({
  label,
  value,
  onChange,
  disabled = false,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHue, setSelectedHue] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse current value to get hue and shade
  const parseColorName = (name: string | undefined): { hue: string; shade: string } | null => {
    if (!name) return null;
    const parts = name.split('-');
    if (parts.length === 2 && TAILWIND_COLORS[parts[0]]) {
      return { hue: parts[0], shade: parts[1] };
    }
    return null;
  };

  const currentColor = value ? parseColorName(value.name) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  // Handle color selection
  const handleSelectColor = (hue: string, shade: string) => {
    const colorName = `${hue}-${shade}`;
    const colorValue = TAILWIND_COLORS[hue][shade];

    onChange({
      name: colorName,
      value: colorValue,
    });

    setIsOpen(false);
    setSelectedHue(null);
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        // Default to showing the currently selected hue, or the first hue
        setSelectedHue(currentColor?.hue || null);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>

      {/* Color Preview Button */}
      <button
        type="button"
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full flex items-center gap-3 px-3 py-2 rounded-lg border
          bg-white dark:bg-gray-800 text-left
          transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500
          ${disabled
            ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700'
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 cursor-pointer'
          }
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {/* Color Swatch */}
        <div
          className="w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 flex-shrink-0"
          style={{ backgroundColor: value?.value || '#e5e7eb' }}
        />

        {/* Color Name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {value?.name || 'Select a color'}
          </span>
          {value?.value && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 uppercase">
              {value.value}
            </span>
          )}
        </div>

        {/* Dropdown Arrow */}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full min-w-[320px] max-h-[400px] overflow-hidden
            bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
            rounded-lg shadow-lg"
          role="listbox"
        >
          <div className="flex h-full max-h-[400px]">
            {/* Hue List */}
            <div className="w-28 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
              {COLOR_HUES.map((hue) => {
                const isSelected = selectedHue === hue;
                const isCurrent = currentColor?.hue === hue;

                return (
                  <button
                    key={hue}
                    type="button"
                    onClick={() => setSelectedHue(hue)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                      transition-colors
                      ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                      }
                    `}
                  >
                    <div
                      className="w-4 h-4 rounded flex-shrink-0 border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: TAILWIND_COLORS[hue]['500'] }}
                    />
                    <span className="capitalize flex-1">{hue}</span>
                    {isCurrent && (
                      <Check className="w-3 h-3 text-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Shade Grid */}
            <div className="flex-1 p-3 overflow-y-auto">
              {selectedHue ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    {selectedHue} shades
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {SHADE_STEPS.map((shade) => {
                      const isSelected = currentColor?.hue === selectedHue && currentColor?.shade === shade;
                      const hexValue = TAILWIND_COLORS[selectedHue][shade];

                      return (
                        <button
                          key={shade}
                          type="button"
                          onClick={() => handleSelectColor(selectedHue, shade)}
                          className={`
                            relative group flex flex-col items-center p-2 rounded-lg
                            transition-all hover:scale-105
                            ${isSelected
                              ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800'
                              : 'hover:ring-1 hover:ring-gray-300 dark:hover:ring-gray-600'
                            }
                          `}
                          title={`${selectedHue}-${shade}`}
                        >
                          <div
                            className="w-10 h-10 rounded-md border border-gray-200 dark:border-gray-600"
                            style={{ backgroundColor: hexValue }}
                          />
                          <span className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            {shade}
                          </span>
                          {isSelected && (
                            <Check className="absolute top-1 right-1 w-3 h-3 text-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
                  Select a color family
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
