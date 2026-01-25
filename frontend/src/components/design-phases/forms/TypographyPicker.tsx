/**
 * TypographyPicker Component
 * Font picker with Google Fonts for selecting typography in design system
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import type { TypographyDefinition } from '../../../types/design-phases';

interface TypographyPickerProps {
  label: string;
  value: TypographyDefinition | null;
  onChange: (font: TypographyDefinition) => void;
  category: 'heading' | 'body' | 'mono';
  disabled?: boolean;
}

// Font category types
type FontCategory = 'sans-serif' | 'serif' | 'monospace' | 'display';

interface GoogleFont {
  family: string;
  category: FontCategory;
  weights: number[];
  popular?: boolean;
}

// Curated list of popular Google Fonts
const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-serif fonts
  { family: 'Inter', category: 'sans-serif', weights: [400, 500, 600, 700, 800], popular: true },
  { family: 'Roboto', category: 'sans-serif', weights: [400, 500, 700], popular: true },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 500, 600, 700], popular: true },
  { family: 'Lato', category: 'sans-serif', weights: [400, 700], popular: true },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 500, 600, 700], popular: true },
  { family: 'Montserrat', category: 'sans-serif', weights: [400, 500, 600, 700], popular: true },
  { family: 'Source Sans Pro', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Nunito', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Nunito Sans', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Raleway', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Work Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { family: 'Outfit', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Manrope', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Sora', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Figtree', category: 'sans-serif', weights: [400, 500, 600, 700] },

  // Serif fonts
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700], popular: true },
  { family: 'Merriweather', category: 'serif', weights: [400, 700], popular: true },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], popular: true },
  { family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { family: 'Source Serif Pro', category: 'serif', weights: [400, 600, 700] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { family: 'Crimson Text', category: 'serif', weights: [400, 600, 700] },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Fraunces', category: 'serif', weights: [400, 500, 600, 700] },

  // Display fonts
  { family: 'Oswald', category: 'display', weights: [400, 500, 600, 700], popular: true },
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Anton', category: 'display', weights: [400] },
  { family: 'Abril Fatface', category: 'display', weights: [400] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Fredoka One', category: 'display', weights: [400] },
  { family: 'Pacifico', category: 'display', weights: [400] },
  { family: 'Lobster', category: 'display', weights: [400] },
  { family: 'Comfortaa', category: 'display', weights: [400, 500, 600, 700] },

  // Monospace fonts
  { family: 'JetBrains Mono', category: 'monospace', weights: [400, 500, 600, 700], popular: true },
  { family: 'Fira Code', category: 'monospace', weights: [400, 500, 600, 700], popular: true },
  { family: 'Source Code Pro', category: 'monospace', weights: [400, 500, 600, 700], popular: true },
  { family: 'Roboto Mono', category: 'monospace', weights: [400, 500, 700] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [400, 500, 600, 700] },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { family: 'Ubuntu Mono', category: 'monospace', weights: [400, 700] },
  { family: 'Inconsolata', category: 'monospace', weights: [400, 500, 600, 700] },
  { family: 'Anonymous Pro', category: 'monospace', weights: [400, 700] },
  { family: 'Cousine', category: 'monospace', weights: [400, 700] },
];

// Available weights for selection
const AVAILABLE_WEIGHTS = [400, 500, 600, 700];

// Category labels
const CATEGORY_LABELS: Record<FontCategory, string> = {
  'sans-serif': 'Sans Serif',
  'serif': 'Serif',
  'monospace': 'Monospace',
  'display': 'Display',
};

// Generate Google Fonts URL
function generateGoogleFontsUrl(family: string, weights: number[]): string {
  const encodedFamily = encodeURIComponent(family);
  const weightStr = weights.sort((a, b) => a - b).join(';');
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightStr}&display=swap`;
}

export function TypographyPicker({
  label,
  value,
  onChange,
  category,
  disabled = false,
}: TypographyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWeights, setSelectedWeights] = useState<number[]>(value?.weights || [400, 700]);
  const [categoryFilter, setCategoryFilter] = useState<FontCategory | 'all'>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Determine which categories to show based on the category prop
  const allowedCategories = useMemo((): FontCategory[] => {
    switch (category) {
      case 'mono':
        return ['monospace'];
      case 'heading':
        return ['sans-serif', 'serif', 'display'];
      case 'body':
        return ['sans-serif', 'serif'];
      default:
        return ['sans-serif', 'serif', 'monospace', 'display'];
    }
  }, [category]);

  // Filter fonts based on search, category filter, and allowed categories
  const filteredFonts = useMemo(() => {
    let fonts = GOOGLE_FONTS.filter((font) => allowedCategories.includes(font.category));

    if (categoryFilter !== 'all') {
      fonts = fonts.filter((font) => font.category === categoryFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      fonts = fonts.filter((font) => font.family.toLowerCase().includes(query));
    }

    // Sort: popular first, then alphabetically
    return fonts.sort((a, b) => {
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return a.family.localeCompare(b.family);
    });
  }, [searchQuery, categoryFilter, allowedCategories]);

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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Load font for preview
  useEffect(() => {
    if (value?.family) {
      const link = document.createElement('link');
      link.href = generateGoogleFontsUrl(value.family, value.weights);
      link.rel = 'stylesheet';
      document.head.appendChild(link);

      return () => {
        document.head.removeChild(link);
      };
    }
  }, [value?.family, value?.weights]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;

    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target === containerRef.current?.querySelector('button')) {
        event.preventDefault();
        setIsOpen(!isOpen);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  // Handle font selection
  const handleSelectFont = (font: GoogleFont) => {
    // Determine which weights to use
    const weightsToUse = selectedWeights.filter((w) => font.weights.includes(w));
    // If no selected weights are available, use the font's default weights
    const finalWeights = weightsToUse.length > 0 ? weightsToUse : [font.weights[0]];

    onChange({
      family: font.family,
      weights: finalWeights,
    });

    setIsOpen(false);
    setSearchQuery('');
  };

  // Handle weight toggle
  const handleWeightToggle = (weight: number) => {
    const currentFont = GOOGLE_FONTS.find((f) => f.family === value?.family);
    if (!currentFont || !currentFont.weights.includes(weight)) return;

    const newWeights = selectedWeights.includes(weight)
      ? selectedWeights.filter((w) => w !== weight)
      : [...selectedWeights, weight].sort((a, b) => a - b);

    // Ensure at least one weight is selected
    if (newWeights.length === 0) return;

    setSelectedWeights(newWeights);

    if (value) {
      onChange({
        ...value,
        weights: newWeights,
      });
    }
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setSearchQuery('');
        setCategoryFilter('all');
      }
    }
  };

  // Get the current font object
  const currentFont = value ? GOOGLE_FONTS.find((f) => f.family === value.family) : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>

      {/* Font Preview Button */}
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
        {/* Font Preview */}
        <div className="flex-1 min-w-0">
          {value ? (
            <>
              <span
                className="block text-lg font-medium text-gray-900 dark:text-gray-100 truncate"
                style={{ fontFamily: `"${value.family}", ${currentFont?.category || 'sans-serif'}` }}
              >
                {value.family}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Weights: {value.weights.join(', ')}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Select a font
            </span>
          )}
        </div>

        {/* Dropdown Arrow */}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Weight Selection (when font is selected) */}
      {value && currentFont && (
        <div className="mt-2 flex flex-wrap gap-2">
          {AVAILABLE_WEIGHTS.map((weight) => {
            const isAvailable = currentFont.weights.includes(weight);
            const isSelected = selectedWeights.includes(weight);

            return (
              <button
                key={weight}
                type="button"
                onClick={() => handleWeightToggle(weight)}
                disabled={disabled || !isAvailable}
                className={`
                  px-2 py-1 text-xs rounded-md border transition-colors
                  ${!isAvailable
                    ? 'opacity-30 cursor-not-allowed border-gray-200 dark:border-gray-700 text-gray-400'
                    : isSelected
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500'
                  }
                `}
              >
                {weight}
              </button>
            );
          })}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[300px] max-h-[400px]
            bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
            rounded-lg shadow-lg overflow-hidden"
          role="listbox"
        >
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fonts..."
                className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-600
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          {allowedCategories.length > 1 && (
            <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`
                  px-2 py-1 text-xs rounded-md transition-colors
                  ${categoryFilter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }
                `}
              >
                All
              </button>
              {allowedCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`
                    px-2 py-1 text-xs rounded-md transition-colors
                    ${categoryFilter === cat
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {/* Font List */}
          <div className="max-h-[280px] overflow-y-auto">
            {filteredFonts.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No fonts found
              </div>
            ) : (
              filteredFonts.map((font) => {
                const isSelected = value?.family === font.family;

                return (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelectFont(font)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 text-left
                      transition-colors
                      ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <span
                        className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                        style={{ fontFamily: `"${font.family}", ${font.category}` }}
                      >
                        {font.family}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span className="capitalize">{font.category.replace('-', ' ')}</span>
                        {font.popular && (
                          <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[10px]">
                            Popular
                          </span>
                        )}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
