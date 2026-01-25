/**
 * RoadmapEditor Component
 * Editor for managing roadmap sections with drag-and-drop reordering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import type { RoadmapSection } from '../../../types/design-phases';

interface RoadmapEditorProps {
  sections: RoadmapSection[];
  onChange: (sections: RoadmapSection[]) => void;
  disabled?: boolean;
}

interface ValidationErrors {
  sections?: { [index: number]: { title?: string; description?: string } };
}

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const DEBOUNCE_MS = 500;

/**
 * Convert a string to kebab-case for section IDs
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a unique section ID from title
 */
function generateSectionId(title: string, existingIds: string[]): string {
  const baseId = toKebabCase(title) || 'section';
  let id = baseId;
  let counter = 1;

  while (existingIds.includes(id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }

  return id;
}

export function RoadmapEditor({
  sections,
  onChange,
  disabled = false,
}: RoadmapEditorProps) {
  // Local form state
  const [localSections, setLocalSections] = useState<RoadmapSection[]>(sections);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Ref for debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize local state when sections prop changes
  useEffect(() => {
    setLocalSections(sections);
  }, [sections]);

  // Validate sections
  const validate = useCallback((data: RoadmapSection[]): ValidationErrors => {
    const newErrors: ValidationErrors = {};
    const sectionErrors: ValidationErrors['sections'] = {};

    data.forEach((section, index) => {
      const itemErrors: { title?: string; description?: string } = {};

      if (!section.title.trim()) {
        itemErrors.title = 'Section title is required';
      } else if (section.title.length > MAX_TITLE_LENGTH) {
        itemErrors.title = `Title must be ${MAX_TITLE_LENGTH} characters or less`;
      }

      if (section.description && section.description.length > MAX_DESCRIPTION_LENGTH) {
        itemErrors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
      }

      if (Object.keys(itemErrors).length > 0) {
        sectionErrors[index] = itemErrors;
      }
    });

    if (Object.keys(sectionErrors).length > 0) {
      newErrors.sections = sectionErrors;
    }

    return newErrors;
  }, []);

  // Debounced onChange handler
  const debouncedOnChange = useCallback(
    (data: RoadmapSection[]) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const validationErrors = validate(data);
        setErrors(validationErrors);
        onChange(data);
      }, DEBOUNCE_MS);
    },
    [onChange, validate]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Update sections and trigger debounced onChange
  const updateSections = useCallback(
    (newSections: RoadmapSection[]) => {
      setLocalSections(newSections);
      debouncedOnChange(newSections);
    },
    [debouncedOnChange]
  );

  // Mark field as touched
  const markTouched = (field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  };

  // Helper to check if error should be shown
  const shouldShowError = (field: string) => touched.has(field);

  // Add new section
  const addSection = () => {
    const existingIds = localSections.map((s) => s.id);
    const newSection: RoadmapSection = {
      id: generateSectionId('New Section', existingIds),
      title: '',
      description: '',
      order: localSections.length,
    };

    updateSections([...localSections, newSection]);
  };

  // Update section field
  const updateSection = (
    index: number,
    field: keyof RoadmapSection,
    value: string | number
  ) => {
    const newSections = [...localSections];
    const section = { ...newSections[index] };

    if (field === 'title' && typeof value === 'string') {
      section.title = value;
      // Auto-update ID when title changes (only if it was auto-generated or empty)
      const existingIds = localSections
        .filter((_, i) => i !== index)
        .map((s) => s.id);
      section.id = generateSectionId(value, existingIds);
    } else if (field === 'description' && typeof value === 'string') {
      section.description = value;
    }

    newSections[index] = section;
    updateSections(newSections);
  };

  // Remove section
  const removeSection = (index: number) => {
    const newSections = localSections
      .filter((_, i) => i !== index)
      .map((section, i) => ({ ...section, order: i }));
    updateSections(newSections);
    setDeleteConfirmIndex(null);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (disabled || draggedIndex === null) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (dropIndex: number) => {
    if (disabled || draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newSections = [...localSections];
    const [removed] = newSections.splice(draggedIndex, 1);
    newSections.splice(dropIndex, 0, removed);

    // Update order property for all sections
    const reorderedSections = newSections.map((section, i) => ({
      ...section,
      order: i,
    }));

    updateSections(reorderedSections);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Roadmap Sections
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Define the sections of your product. Drag to reorder.
          </p>
        </div>
        <button
          type="button"
          onClick={addSection}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
            hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Add Section
        </button>
      </div>

      {/* Empty State */}
      {localSections.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No sections defined yet. Click "Add Section" to get started.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Sections help break down your product into manageable development phases.
          </p>
        </div>
      ) : (
        /* Sections List */
        <div className="space-y-3">
          {localSections.map((section, index) => (
            <div
              key={section.id || index}
              draggable={!disabled}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`
                relative p-4 border rounded-lg bg-white dark:bg-gray-800
                transition-all duration-200
                ${draggedIndex === index ? 'opacity-50 scale-[0.98]' : ''}
                ${
                  dragOverIndex === index && draggedIndex !== index
                    ? 'border-blue-400 dark:border-blue-500 shadow-md'
                    : 'border-gray-200 dark:border-gray-700'
                }
                ${disabled ? 'cursor-not-allowed' : ''}
              `}
            >
              {/* Drop indicator line */}
              {dragOverIndex === index && draggedIndex !== null && draggedIndex !== index && (
                <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-blue-500 rounded" />
              )}

              <div className="flex items-start gap-3">
                {/* Drag Handle */}
                <div
                  className={`
                    flex-shrink-0 mt-2 cursor-grab active:cursor-grabbing
                    text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300
                    ${disabled ? 'cursor-not-allowed opacity-50' : ''}
                  `}
                >
                  <GripVertical className="w-5 h-5" />
                </div>

                {/* Order Number */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {index + 1}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-3">
                  {/* Title */}
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSection(index, 'title', e.target.value)}
                      onBlur={() => markTouched(`section-${index}-title`)}
                      disabled={disabled}
                      placeholder="Section title"
                      maxLength={MAX_TITLE_LENGTH}
                      className={`
                        w-full px-3 py-2 text-sm font-medium rounded-lg border bg-transparent
                        text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${
                          shouldShowError(`section-${index}-title`) &&
                          errors.sections?.[index]?.title
                            ? 'border-red-500'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        }
                      `}
                    />
                    {shouldShowError(`section-${index}-title`) &&
                      errors.sections?.[index]?.title && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {errors.sections[index].title}
                        </p>
                      )}
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <textarea
                      value={section.description}
                      onChange={(e) => updateSection(index, 'description', e.target.value)}
                      onBlur={() => markTouched(`section-${index}-description`)}
                      disabled={disabled}
                      placeholder="Brief description of this section"
                      maxLength={MAX_DESCRIPTION_LENGTH}
                      rows={2}
                      className={`
                        w-full px-3 py-2 text-sm rounded-lg border bg-transparent
                        text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                        disabled:opacity-50 disabled:cursor-not-allowed resize-none
                        ${
                          shouldShowError(`section-${index}-description`) &&
                          errors.sections?.[index]?.description
                            ? 'border-red-500'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        }
                      `}
                    />
                    {shouldShowError(`section-${index}-description`) &&
                      errors.sections?.[index]?.description && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {errors.sections[index].description}
                        </p>
                      )}
                  </div>

                  {/* Section ID preview */}
                  {section.title.trim() && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      ID: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{section.id}</code>
                    </div>
                  )}
                </div>

                {/* Delete Button */}
                <div className="flex-shrink-0">
                  {deleteConfirmIndex === index ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => removeSection(index)}
                        disabled={disabled}
                        className="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600
                          rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmIndex(null)}
                        disabled={disabled}
                        className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300
                          hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmIndex(index)}
                      disabled={disabled}
                      className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400
                        rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Delete section ${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section Count */}
      {localSections.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
          {localSections.length} section{localSections.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
