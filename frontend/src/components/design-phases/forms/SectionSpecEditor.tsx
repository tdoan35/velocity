/**
 * SectionSpecEditor Component
 * Form for editing section specification (overview, features, requirements, acceptance)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, AlertCircle, FileText, Lightbulb, CheckSquare, ListChecks } from 'lucide-react';
import type { SectionSpec } from '../../../types/design-phases';

interface SectionSpecEditorProps {
  spec: SectionSpec | null;
  onChange: (spec: SectionSpec) => void;
  disabled?: boolean;
}

const MAX_OVERVIEW_LENGTH = 2000;
const MAX_ITEM_LENGTH = 500;
const DEBOUNCE_MS = 500;

// Default empty spec
const DEFAULT_SPEC: SectionSpec = {
  overview: '',
  keyFeatures: [],
  requirements: [],
  acceptance: [],
};

export function SectionSpecEditor({
  spec,
  onChange,
  disabled = false,
}: SectionSpecEditorProps) {
  // Local form state
  const [localSpec, setLocalSpec] = useState<SectionSpec>(spec || DEFAULT_SPEC);
  const [errors, setErrors] = useState<{ overview?: string }>({});

  // Ref for debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize local state when spec prop changes
  useEffect(() => {
    setLocalSpec(spec || DEFAULT_SPEC);
  }, [spec]);

  // Debounced onChange handler
  const debouncedOnChange = useCallback(
    (data: SectionSpec) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        onChange(data);
      }, DEBOUNCE_MS);
    },
    [onChange]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Update spec and trigger debounced onChange
  const updateSpec = useCallback(
    (updates: Partial<SectionSpec>) => {
      const newSpec = { ...localSpec, ...updates };
      setLocalSpec(newSpec);
      debouncedOnChange(newSpec);
    },
    [localSpec, debouncedOnChange]
  );

  // Handle overview change
  const handleOverviewChange = (value: string) => {
    if (value.length > MAX_OVERVIEW_LENGTH) {
      setErrors({ overview: `Overview must be ${MAX_OVERVIEW_LENGTH} characters or less` });
      return;
    }
    setErrors({});
    updateSpec({ overview: value });
  };

  // Generic list item handlers
  const addListItem = (key: 'keyFeatures' | 'requirements' | 'acceptance') => {
    updateSpec({ [key]: [...localSpec[key], ''] });
  };

  const updateListItem = (
    key: 'keyFeatures' | 'requirements' | 'acceptance',
    index: number,
    value: string
  ) => {
    if (value.length > MAX_ITEM_LENGTH) return;
    const newList = [...localSpec[key]];
    newList[index] = value;
    updateSpec({ [key]: newList });
  };

  const removeListItem = (
    key: 'keyFeatures' | 'requirements' | 'acceptance',
    index: number
  ) => {
    const newList = localSpec[key].filter((_, i) => i !== index);
    updateSpec({ [key]: newList });
  };

  // Render editable list section
  const renderListSection = (
    key: 'keyFeatures' | 'requirements' | 'acceptance',
    title: string,
    icon: React.ElementType,
    placeholder: string,
    emptyText: string
  ) => {
    const Icon = icon;
    const items = localSpec[key];

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {title}
            </h4>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({items.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => addListItem(key)}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400
              hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-8 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                  {index + 1}.
                </span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateListItem(key, index, e.target.value)}
                  disabled={disabled}
                  placeholder={placeholder}
                  maxLength={MAX_ITEM_LENGTH}
                  className="
                    flex-1 px-3 py-1.5 text-sm rounded-lg border bg-transparent
                    text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                    border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                />
                <button
                  type="button"
                  onClick={() => removeListItem(key, index)}
                  disabled={disabled}
                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400
                    rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Section Overview
          </h4>
        </div>

        <div className="space-y-1">
          <textarea
            value={localSpec.overview}
            onChange={(e) => handleOverviewChange(e.target.value)}
            disabled={disabled}
            placeholder="Describe what this section of the app does, its purpose, and key functionality..."
            rows={4}
            maxLength={MAX_OVERVIEW_LENGTH}
            className={`
              w-full px-3 py-2 text-sm rounded-lg border bg-transparent
              text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed resize-none
              ${
                errors.overview
                  ? 'border-red-500'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }
            `}
          />
          {errors.overview && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.overview}
            </p>
          )}
          <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
            {localSpec.overview.length}/{MAX_OVERVIEW_LENGTH}
          </div>
        </div>
      </section>

      {/* Key Features */}
      {renderListSection(
        'keyFeatures',
        'Key Features',
        Lightbulb,
        'e.g., User can search products by name or category',
        'No key features defined. Add features that describe what this section offers.'
      )}

      {/* Requirements */}
      {renderListSection(
        'requirements',
        'Requirements',
        ListChecks,
        'e.g., Must support pagination with 20 items per page',
        'No requirements defined. Add technical or functional requirements.'
      )}

      {/* Acceptance Criteria */}
      {renderListSection(
        'acceptance',
        'Acceptance Criteria',
        CheckSquare,
        'e.g., Search results display within 500ms',
        'No acceptance criteria defined. Add criteria to verify implementation.'
      )}
    </div>
  );
}
