/**
 * ShellEditor Component
 * Editor for defining app shell - navigation items and layout pattern
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  Menu,
  ChevronDown,
  Home,
  Settings,
  User,
  Search,
  Bell,
  Mail,
  Calendar,
  FileText,
  Folder,
  Image,
  ShoppingCart,
  Heart,
  Star,
  Bookmark,
  MessageSquare,
  Phone,
  Map,
  Globe,
  Zap,
  Shield,
  Lock,
  Key,
  CreditCard,
  Package,
  Truck,
  BarChart,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  UserPlus,
  Layers,
  Grid,
  List,
  Check,
} from 'lucide-react';
import type { ShellSpec, NavigationItem, RoadmapSection } from '../../../types/design-phases';

interface ShellEditorProps {
  shellSpec: ShellSpec | null;
  sections: RoadmapSection[];
  onChange: (shellSpec: ShellSpec) => void;
  disabled?: boolean;
}

interface ValidationErrors {
  overview?: string;
  navigationItems?: { [index: number]: { label?: string; route?: string } };
}

// Layout pattern options
type LayoutPattern = 'sidebar-left' | 'sidebar-right' | 'top-nav' | 'bottom-nav' | 'no-nav';

interface LayoutOption {
  id: LayoutPattern;
  label: string;
  description: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'sidebar-left',
    label: 'Left Sidebar',
    description: 'Navigation sidebar on the left',
  },
  {
    id: 'sidebar-right',
    label: 'Right Sidebar',
    description: 'Navigation sidebar on the right',
  },
  {
    id: 'top-nav',
    label: 'Top Navigation',
    description: 'Horizontal navigation bar at top',
  },
  {
    id: 'bottom-nav',
    label: 'Bottom Navigation',
    description: 'Mobile-style tab bar at bottom',
  },
  {
    id: 'no-nav',
    label: 'No Navigation',
    description: 'Full-screen content without nav',
  },
];

// Available icons for navigation items
const AVAILABLE_ICONS: { name: string; icon: React.ElementType }[] = [
  { name: 'Home', icon: Home },
  { name: 'Settings', icon: Settings },
  { name: 'User', icon: User },
  { name: 'Users', icon: Users },
  { name: 'UserPlus', icon: UserPlus },
  { name: 'Search', icon: Search },
  { name: 'Bell', icon: Bell },
  { name: 'Mail', icon: Mail },
  { name: 'MessageSquare', icon: MessageSquare },
  { name: 'Phone', icon: Phone },
  { name: 'Calendar', icon: Calendar },
  { name: 'FileText', icon: FileText },
  { name: 'Folder', icon: Folder },
  { name: 'Image', icon: Image },
  { name: 'ShoppingCart', icon: ShoppingCart },
  { name: 'Heart', icon: Heart },
  { name: 'Star', icon: Star },
  { name: 'Bookmark', icon: Bookmark },
  { name: 'Map', icon: Map },
  { name: 'Globe', icon: Globe },
  { name: 'Zap', icon: Zap },
  { name: 'Shield', icon: Shield },
  { name: 'Lock', icon: Lock },
  { name: 'Key', icon: Key },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'Package', icon: Package },
  { name: 'Truck', icon: Truck },
  { name: 'BarChart', icon: BarChart },
  { name: 'PieChart', icon: PieChart },
  { name: 'Activity', icon: Activity },
  { name: 'TrendingUp', icon: TrendingUp },
  { name: 'Layers', icon: Layers },
  { name: 'Grid', icon: Grid },
  { name: 'List', icon: List },
];

const MAX_LABEL_LENGTH = 50;
const MAX_ROUTE_LENGTH = 100;
const MAX_OVERVIEW_LENGTH = 1000;
const DEBOUNCE_MS = 500;

// Default shell spec
const DEFAULT_SHELL_SPEC: ShellSpec = {
  overview: '',
  navigationItems: [],
  layoutPattern: 'sidebar-left',
  raw: '',
};

/**
 * Convert a string to a valid route path
 */
function toRoutePath(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Icon Picker Dropdown Component
 */
function IconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (iconName: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find current icon
  const currentIcon = AVAILABLE_ICONS.find((i) => i.name === value) || AVAILABLE_ICONS[0];
  const IconComponent = currentIcon.icon;

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-lg border
          bg-white dark:bg-gray-800 text-left
          transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500
          ${disabled
            ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700'
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 cursor-pointer'
          }
        `}
        aria-label="Select icon"
      >
        <IconComponent className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        <ChevronDown
          className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 max-h-60 overflow-y-auto
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
          rounded-lg shadow-lg p-2">
          <div className="grid grid-cols-6 gap-1">
            {AVAILABLE_ICONS.map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setIsOpen(false);
                }}
                className={`
                  p-2 rounded-md transition-colors
                  ${value === name
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }
                `}
                title={name}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ShellEditor({
  shellSpec,
  sections,
  onChange,
  disabled = false,
}: ShellEditorProps) {
  // Local form state
  // Normalize incoming data — AI responses may omit arrays
  const normalizeSpec = (data: ShellSpec | null): ShellSpec => ({
    ...DEFAULT_SHELL_SPEC,
    ...data,
    navigationItems: data?.navigationItems ?? [],
  });

  const [localSpec, setLocalSpec] = useState<ShellSpec>(normalizeSpec(shellSpec));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Ref for debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize local state when shellSpec prop changes
  useEffect(() => {
    setLocalSpec(normalizeSpec(shellSpec));
  }, [shellSpec]);

  // Validate spec
  const validate = useCallback((data: ShellSpec): ValidationErrors => {
    const newErrors: ValidationErrors = {};
    const navErrors: ValidationErrors['navigationItems'] = {};

    if (data.overview && data.overview.length > MAX_OVERVIEW_LENGTH) {
      newErrors.overview = `Overview must be ${MAX_OVERVIEW_LENGTH} characters or less`;
    }

    data.navigationItems.forEach((item, index) => {
      const itemErrors: { label?: string; route?: string } = {};

      if (!item.label.trim()) {
        itemErrors.label = 'Label is required';
      } else if (item.label.length > MAX_LABEL_LENGTH) {
        itemErrors.label = `Label must be ${MAX_LABEL_LENGTH} characters or less`;
      }

      if (!item.route.trim()) {
        itemErrors.route = 'Route is required';
      } else if (item.route.length > MAX_ROUTE_LENGTH) {
        itemErrors.route = `Route must be ${MAX_ROUTE_LENGTH} characters or less`;
      }

      if (Object.keys(itemErrors).length > 0) {
        navErrors[index] = itemErrors;
      }
    });

    if (Object.keys(navErrors).length > 0) {
      newErrors.navigationItems = navErrors;
    }

    return newErrors;
  }, []);

  // Debounced onChange handler
  const debouncedOnChange = useCallback(
    (data: ShellSpec) => {
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

  // Update spec and trigger debounced onChange
  const updateSpec = useCallback(
    (newSpec: ShellSpec) => {
      setLocalSpec(newSpec);
      debouncedOnChange(newSpec);
    },
    [debouncedOnChange]
  );

  // Mark field as touched
  const markTouched = (field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  };

  // Helper to check if error should be shown
  const shouldShowError = (field: string) => touched.has(field);

  // Handle layout pattern change
  const handleLayoutChange = (pattern: LayoutPattern) => {
    updateSpec({ ...localSpec, layoutPattern: pattern });
  };

  // Handle overview change
  const handleOverviewChange = (overview: string) => {
    updateSpec({ ...localSpec, overview });
  };

  // Add new navigation item
  const addNavItem = () => {
    const newItem: NavigationItem = {
      label: '',
      icon: 'Home',
      route: '',
      sectionId: '',
    };

    updateSpec({
      ...localSpec,
      navigationItems: [...localSpec.navigationItems, newItem],
    });
  };

  // Update navigation item
  const updateNavItem = (
    index: number,
    field: keyof NavigationItem,
    value: string
  ) => {
    const newItems = [...localSpec.navigationItems];
    const item = { ...newItems[index] };

    if (field === 'label') {
      item.label = value;
      // Auto-generate route from label if route is empty
      if (!item.route) {
        item.route = '/' + toRoutePath(value);
      }
    } else if (field === 'route') {
      item.route = value;
    } else if (field === 'icon') {
      item.icon = value;
    } else if (field === 'sectionId') {
      item.sectionId = value;
    }

    newItems[index] = item;
    updateSpec({ ...localSpec, navigationItems: newItems });
  };

  // Remove navigation item
  const removeNavItem = (index: number) => {
    const newItems = localSpec.navigationItems.filter((_, i) => i !== index);
    updateSpec({ ...localSpec, navigationItems: newItems });
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

    const newItems = [...localSpec.navigationItems];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(dropIndex, 0, removed);

    updateSpec({ ...localSpec, navigationItems: newItems });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-8">
      {/* Layout Pattern Selector */}
      <section>
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Layout Pattern
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Choose how navigation will be structured in your app
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {LAYOUT_OPTIONS.map((option) => {
            const isSelected = localSpec.layoutPattern === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleLayoutChange(option.id)}
                disabled={disabled}
                className={`
                  relative p-4 rounded-lg border-2 transition-all
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-blue-500" />
                  </div>
                )}

                {/* Layout preview */}
                <div className="flex justify-center mb-3">
                  <div className="w-16 h-12 border border-gray-300 dark:border-gray-600 rounded relative overflow-hidden bg-white dark:bg-gray-800">
                    {option.id === 'sidebar-left' && (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gray-200 dark:bg-gray-600" />
                        <div className="absolute left-5 right-1 top-1 bottom-1 bg-gray-100 dark:bg-gray-700" />
                      </>
                    )}
                    {option.id === 'sidebar-right' && (
                      <>
                        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gray-200 dark:bg-gray-600" />
                        <div className="absolute left-1 right-5 top-1 bottom-1 bg-gray-100 dark:bg-gray-700" />
                      </>
                    )}
                    {option.id === 'top-nav' && (
                      <>
                        <div className="absolute left-0 right-0 top-0 h-3 bg-gray-200 dark:bg-gray-600" />
                        <div className="absolute left-1 right-1 top-4 bottom-1 bg-gray-100 dark:bg-gray-700" />
                      </>
                    )}
                    {option.id === 'bottom-nav' && (
                      <>
                        <div className="absolute left-0 right-0 bottom-0 h-3 bg-gray-200 dark:bg-gray-600" />
                        <div className="absolute left-1 right-1 top-1 bottom-4 bg-gray-100 dark:bg-gray-700" />
                      </>
                    )}
                    {option.id === 'no-nav' && (
                      <div className="absolute left-1 right-1 top-1 bottom-1 bg-gray-100 dark:bg-gray-700" />
                    )}
                  </div>
                </div>

                {/* Label */}
                <div className="text-center">
                  <p className={`text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Navigation Items */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Navigation Items
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Define the navigation menu items. Drag to reorder.
            </p>
          </div>
          <button
            type="button"
            onClick={addNavItem}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
              hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        {/* Empty State */}
        {localSpec.navigationItems.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <Menu className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No navigation items defined yet.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Click "Add Item" to create your navigation menu.
            </p>
          </div>
        ) : (
          /* Navigation Items List */
          <div className="space-y-3">
            {localSpec.navigationItems.map((item, index) => (
              <div
                key={index}
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

                  {/* Icon Picker */}
                  <div className="flex-shrink-0 mt-1">
                    <IconPicker
                      value={item.icon}
                      onChange={(iconName) => updateNavItem(index, 'icon', iconName)}
                      disabled={disabled}
                    />
                  </div>

                  {/* Form Fields */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Label */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Label
                      </label>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateNavItem(index, 'label', e.target.value)}
                        onBlur={() => markTouched(`nav-${index}-label`)}
                        disabled={disabled}
                        placeholder="e.g., Dashboard"
                        maxLength={MAX_LABEL_LENGTH}
                        className={`
                          w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent
                          text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                          disabled:opacity-50 disabled:cursor-not-allowed
                          ${
                            shouldShowError(`nav-${index}-label`) &&
                            errors.navigationItems?.[index]?.label
                              ? 'border-red-500'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                          }
                        `}
                      />
                      {shouldShowError(`nav-${index}-label`) &&
                        errors.navigationItems?.[index]?.label && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.navigationItems[index].label}
                          </p>
                        )}
                    </div>

                    {/* Route */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Route
                      </label>
                      <input
                        type="text"
                        value={item.route}
                        onChange={(e) => updateNavItem(index, 'route', e.target.value)}
                        onBlur={() => markTouched(`nav-${index}-route`)}
                        disabled={disabled}
                        placeholder="/dashboard"
                        maxLength={MAX_ROUTE_LENGTH}
                        className={`
                          w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent
                          text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                          disabled:opacity-50 disabled:cursor-not-allowed
                          ${
                            shouldShowError(`nav-${index}-route`) &&
                            errors.navigationItems?.[index]?.route
                              ? 'border-red-500'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                          }
                        `}
                      />
                      {shouldShowError(`nav-${index}-route`) &&
                        errors.navigationItems?.[index]?.route && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.navigationItems[index].route}
                          </p>
                        )}
                    </div>

                    {/* Section Link */}
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Linked Section
                      </label>
                      <select
                        value={item.sectionId}
                        onChange={(e) => updateNavItem(index, 'sectionId', e.target.value)}
                        disabled={disabled}
                        className={`
                          w-full px-3 py-1.5 text-sm rounded-lg border bg-transparent
                          text-gray-900 dark:text-gray-100
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                          disabled:opacity-50 disabled:cursor-not-allowed
                          border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500
                        `}
                      >
                        <option value="">None</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <div className="flex-shrink-0">
                    {deleteConfirmIndex === index ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeNavItem(index)}
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
                        aria-label={`Delete nav item ${index + 1}`}
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

        {/* Item Count */}
        {localSpec.navigationItems.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-right mt-2">
            {localSpec.navigationItems.length} item{localSpec.navigationItems.length !== 1 ? 's' : ''}
          </div>
        )}
      </section>

      {/* Overview / Notes */}
      <section>
        <div className="mb-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Overview / Notes
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Additional notes about the app shell structure (optional)
          </p>
        </div>

        <div className="space-y-1">
          <textarea
            value={localSpec.overview}
            onChange={(e) => handleOverviewChange(e.target.value)}
            onBlur={() => markTouched('overview')}
            disabled={disabled}
            placeholder="Describe the overall navigation structure, user flows, or special requirements..."
            maxLength={MAX_OVERVIEW_LENGTH}
            rows={4}
            className={`
              w-full px-3 py-2 text-sm rounded-lg border bg-transparent
              text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed resize-none
              ${
                shouldShowError('overview') && errors.overview
                  ? 'border-red-500'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }
            `}
          />
          {shouldShowError('overview') && errors.overview && (
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
    </div>
  );
}
