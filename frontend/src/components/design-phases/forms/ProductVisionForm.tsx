/**
 * ProductVisionForm Component
 * Form for editing product overview data (name, description, problems/solutions, features)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import type {
  ProductOverview,
  ProductProblem,
  ProductFeature,
} from '../../../types/design-phases';

interface ProductVisionFormProps {
  initialData: ProductOverview | null;
  onChange: (data: ProductOverview) => void;
  disabled?: boolean;
}

interface ValidationErrors {
  name?: string;
  description?: string;
  problems?: { [index: number]: { problem?: string; solution?: string } };
  features?: { [index: number]: { title?: string; description?: string } };
}

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const DEBOUNCE_MS = 500;

const DEFAULT_DATA: ProductOverview = {
  name: '',
  description: '',
  problems: [],
  features: [],
};

export function ProductVisionForm({
  initialData,
  onChange,
  disabled = false,
}: ProductVisionFormProps) {
  // Local form state
  const [formData, setFormData] = useState<ProductOverview>(
    initialData || DEFAULT_DATA
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Ref for debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize form data when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  // Validate form data
  const validate = useCallback((data: ProductOverview): ValidationErrors => {
    const newErrors: ValidationErrors = {};

    // Name validation
    if (!data.name.trim()) {
      newErrors.name = 'Product name is required';
    } else if (data.name.length > MAX_NAME_LENGTH) {
      newErrors.name = `Product name must be ${MAX_NAME_LENGTH} characters or less`;
    }

    // Description validation (optional but has max length)
    if (data.description && data.description.length > MAX_DESCRIPTION_LENGTH) {
      newErrors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
    }

    // Problems validation
    const problemErrors: ValidationErrors['problems'] = {};
    data.problems.forEach((item, index) => {
      const itemErrors: { problem?: string; solution?: string } = {};
      if (!item.problem.trim()) {
        itemErrors.problem = 'Problem is required';
      }
      if (!item.solution.trim()) {
        itemErrors.solution = 'Solution is required';
      }
      if (Object.keys(itemErrors).length > 0) {
        problemErrors[index] = itemErrors;
      }
    });
    if (Object.keys(problemErrors).length > 0) {
      newErrors.problems = problemErrors;
    }

    // Features validation
    const featureErrors: ValidationErrors['features'] = {};
    data.features.forEach((item, index) => {
      const itemErrors: { title?: string; description?: string } = {};
      if (!item.title.trim()) {
        itemErrors.title = 'Feature title is required';
      }
      if (Object.keys(itemErrors).length > 0) {
        featureErrors[index] = itemErrors;
      }
    });
    if (Object.keys(featureErrors).length > 0) {
      newErrors.features = featureErrors;
    }

    return newErrors;
  }, []);

  // Debounced onChange handler
  const debouncedOnChange = useCallback(
    (data: ProductOverview) => {
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

  // Update form data and trigger debounced onChange
  const updateFormData = useCallback(
    (updates: Partial<ProductOverview>) => {
      const newData = { ...formData, ...updates };
      setFormData(newData);
      debouncedOnChange(newData);
    },
    [formData, debouncedOnChange]
  );

  // Mark field as touched
  const markTouched = (field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  };

  // Handle name change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFormData({ name: e.target.value });
  };

  // Handle description change
  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    updateFormData({ description: e.target.value });
  };

  // Problem/Solution handlers
  const addProblem = () => {
    updateFormData({
      problems: [...formData.problems, { problem: '', solution: '' }],
    });
  };

  const updateProblem = (
    index: number,
    field: keyof ProductProblem,
    value: string
  ) => {
    const newProblems = [...formData.problems];
    newProblems[index] = { ...newProblems[index], [field]: value };
    updateFormData({ problems: newProblems });
  };

  const removeProblem = (index: number) => {
    const newProblems = formData.problems.filter((_, i) => i !== index);
    updateFormData({ problems: newProblems });
  };

  // Feature handlers
  const addFeature = () => {
    updateFormData({
      features: [...formData.features, { title: '', description: '' }],
    });
  };

  const updateFeature = (
    index: number,
    field: keyof ProductFeature,
    value: string
  ) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = { ...newFeatures[index], [field]: value };
    updateFormData({ features: newFeatures });
  };

  const removeFeature = (index: number) => {
    const newFeatures = formData.features.filter((_, i) => i !== index);
    updateFormData({ features: newFeatures });
  };

  // Helper to check if error should be shown
  const shouldShowError = (field: string) => touched.has(field);

  return (
    <div className="space-y-8">
      {/* Product Name */}
      <div className="space-y-2">
        <label
          htmlFor="product-name"
          className="block text-sm font-medium text-gray-900 dark:text-gray-100"
        >
          Product Name <span className="text-red-500">*</span>
        </label>
        <input
          id="product-name"
          type="text"
          value={formData.name}
          onChange={handleNameChange}
          onBlur={() => markTouched('name')}
          disabled={disabled}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Enter your product name"
          className={`
            w-full px-4 py-2 rounded-lg border bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              shouldShowError('name') && errors.name
                ? 'border-red-500'
                : 'border-gray-300 dark:border-gray-600'
            }
          `}
        />
        <div className="flex justify-between items-center">
          {shouldShowError('name') && errors.name ? (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.name}
            </p>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formData.name.length}/{MAX_NAME_LENGTH}
          </span>
        </div>
      </div>

      {/* Product Description */}
      <div className="space-y-2">
        <label
          htmlFor="product-description"
          className="block text-sm font-medium text-gray-900 dark:text-gray-100"
        >
          Product Description
        </label>
        <textarea
          id="product-description"
          value={formData.description}
          onChange={handleDescriptionChange}
          onBlur={() => markTouched('description')}
          disabled={disabled}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="Describe what your product does and who it's for"
          rows={4}
          className={`
            w-full px-4 py-2 rounded-lg border bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed resize-none
            ${
              shouldShowError('description') && errors.description
                ? 'border-red-500'
                : 'border-gray-300 dark:border-gray-600'
            }
          `}
        />
        <div className="flex justify-between items-center">
          {shouldShowError('description') && errors.description ? (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.description}
            </p>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formData.description.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
      </div>

      {/* Problems & Solutions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Problems & Solutions
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Define the problems your product solves and how it solves them
            </p>
          </div>
          <button
            type="button"
            onClick={addProblem}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
              hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add Problem
          </button>
        </div>

        {formData.problems.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No problems defined yet. Click "Add Problem" to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {formData.problems.map((item, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Problem {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProblem(index)}
                    disabled={disabled}
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400
                      rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Remove problem ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Problem
                    </label>
                    <textarea
                      value={item.problem}
                      onChange={(e) =>
                        updateProblem(index, 'problem', e.target.value)
                      }
                      onBlur={() => markTouched(`problem-${index}-problem`)}
                      disabled={disabled}
                      placeholder="What problem does your user face?"
                      rows={3}
                      className={`
                        w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800
                        text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                        disabled:opacity-50 disabled:cursor-not-allowed resize-none
                        ${
                          shouldShowError(`problem-${index}-problem`) &&
                          errors.problems?.[index]?.problem
                            ? 'border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                      `}
                    />
                    {shouldShowError(`problem-${index}-problem`) &&
                      errors.problems?.[index]?.problem && (
                        <p className="text-xs text-red-500">
                          {errors.problems[index].problem}
                        </p>
                      )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Solution
                    </label>
                    <textarea
                      value={item.solution}
                      onChange={(e) =>
                        updateProblem(index, 'solution', e.target.value)
                      }
                      onBlur={() => markTouched(`problem-${index}-solution`)}
                      disabled={disabled}
                      placeholder="How does your product solve it?"
                      rows={3}
                      className={`
                        w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800
                        text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                        disabled:opacity-50 disabled:cursor-not-allowed resize-none
                        ${
                          shouldShowError(`problem-${index}-solution`) &&
                          errors.problems?.[index]?.solution
                            ? 'border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                      `}
                    />
                    {shouldShowError(`problem-${index}-solution`) &&
                      errors.problems?.[index]?.solution && (
                        <p className="text-xs text-red-500">
                          {errors.problems[index].solution}
                        </p>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Key Features
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              List the main features of your product
            </p>
          </div>
          <button
            type="button"
            onClick={addFeature}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
              hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add Feature
          </button>
        </div>

        {formData.features.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No features defined yet. Click "Add Feature" to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {formData.features.map((item, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Feature {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    disabled={disabled}
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400
                      rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Remove feature ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Feature Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        updateFeature(index, 'title', e.target.value)
                      }
                      onBlur={() => markTouched(`feature-${index}-title`)}
                      disabled={disabled}
                      placeholder="e.g., Real-time collaboration"
                      className={`
                        w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800
                        text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${
                          shouldShowError(`feature-${index}-title`) &&
                          errors.features?.[index]?.title
                            ? 'border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                      `}
                    />
                    {shouldShowError(`feature-${index}-title`) &&
                      errors.features?.[index]?.title && (
                        <p className="text-xs text-red-500">
                          {errors.features[index].title}
                        </p>
                      )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Description
                    </label>
                    <textarea
                      value={item.description}
                      onChange={(e) =>
                        updateFeature(index, 'description', e.target.value)
                      }
                      disabled={disabled}
                      placeholder="Describe what this feature does"
                      rows={2}
                      className="
                        w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800
                        text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                        border-gray-300 dark:border-gray-600
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                        disabled:opacity-50 disabled:cursor-not-allowed resize-none
                      "
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
