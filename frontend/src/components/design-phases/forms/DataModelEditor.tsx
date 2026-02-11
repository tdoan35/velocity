/**
 * DataModelEditor Component
 * Visual editor for defining entities and relationships
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  AlertCircle,
  Database,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import type {
  DataModel,
  DataModelEntity,
  DataModelField,
  DataModelRelationship,
} from '../../../types/design-phases';

interface DataModelEditorProps {
  dataModel: DataModel | null;
  onChange: (dataModel: DataModel) => void;
  disabled?: boolean;
}

// Field type options
const FIELD_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'uuid', label: 'UUID' },
  { value: 'json', label: 'JSON' },
  { value: 'array', label: 'Array' },
] as const;

// Relationship type options
const RELATIONSHIP_TYPES = [
  { value: 'one-to-one', label: 'One to One' },
  { value: 'one-to-many', label: 'One to Many' },
  { value: 'many-to-many', label: 'Many to Many' },
] as const;

const DEBOUNCE_MS = 500;

const DEFAULT_DATA: DataModel = {
  entities: [],
  relationships: [],
};

// ============================================================================
// Entity Editor Modal
// ============================================================================

interface EntityEditorProps {
  entity: DataModelEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (entity: DataModelEntity) => void;
  existingNames: string[];
}

function EntityEditor({
  entity,
  isOpen,
  onClose,
  onSave,
  existingNames,
}: EntityEditorProps) {
  const [name, setName] = useState(entity?.name || '');
  const [fields, setFields] = useState<DataModelField[]>(entity?.fields || []);
  const [error, setError] = useState<string | null>(null);

  // Reset form when entity changes
  useEffect(() => {
    setName(entity?.name || '');
    setFields(entity?.fields || []);
    setError(null);
  }, [entity, isOpen]);

  const handleSave = () => {
    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Entity name is required');
      return;
    }

    // Check for duplicate names (excluding current entity)
    const isDuplicate = existingNames.some(
      (n) => n.toLowerCase() === trimmedName.toLowerCase() && n !== entity?.name
    );
    if (isDuplicate) {
      setError('An entity with this name already exists');
      return;
    }

    // Validate fields have names
    const invalidFields = fields.filter((f) => !f.name.trim());
    if (invalidFields.length > 0) {
      setError('All fields must have a name');
      return;
    }

    onSave({
      name: trimmedName,
      fields: fields.filter((f) => f.name.trim()),
    });
  };

  const addField = () => {
    setFields([...fields, { name: '', type: 'string', required: false }]);
  };

  const updateField = (index: number, updates: Partial<DataModelField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {entity ? 'Edit Entity' : 'New Entity'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Entity Name */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Entity Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., User, Product, Order"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Fields
              </label>
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400
                  hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Field
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No fields defined. Click "Add Field" to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    {/* Field Name */}
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      placeholder="Field name"
                      className="flex-1 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                        placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />

                    {/* Field Type */}
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value })}
                      className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                        focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>

                    {/* Required Checkbox */}
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600
                          text-blue-600 focus:ring-blue-500"
                      />
                      Req
                    </label>

                    {/* Remove Button */}
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700
              rounded-lg transition-colors"
          >
            {entity ? 'Save Changes' : 'Create Entity'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main DataModelEditor Component
// ============================================================================

export function DataModelEditor({
  dataModel,
  onChange,
  disabled = false,
}: DataModelEditorProps) {
  // Normalize incoming data — AI responses may omit arrays
  const normalize = (data: DataModel | null): DataModel => ({
    ...DEFAULT_DATA,
    ...data,
    entities: (data?.entities ?? []).map(e => ({ ...e, fields: e.fields ?? [] })),
    relationships: data?.relationships ?? [],
  });

  // Local state
  const [localModel, setLocalModel] = useState<DataModel>(normalize(dataModel));
  const [editingEntity, setEditingEntity] = useState<DataModelEntity | null>(null);
  const [isEntityEditorOpen, setIsEntityEditorOpen] = useState(false);
  const [deleteConfirmEntity, setDeleteConfirmEntity] = useState<string | null>(null);
  const [deleteConfirmRelationship, setDeleteConfirmRelationship] = useState<number | null>(null);

  // New relationship form
  const [newRelFrom, setNewRelFrom] = useState('');
  const [newRelTo, setNewRelTo] = useState('');
  const [newRelType, setNewRelType] = useState<DataModelRelationship['type']>('one-to-many');

  // Debounce ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize local state when prop changes
  useEffect(() => {
    if (dataModel) {
      setLocalModel(normalize(dataModel));
    }
  }, [dataModel]);

  // Debounced onChange handler
  const debouncedOnChange = useCallback(
    (model: DataModel) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        onChange(model);
      }, DEBOUNCE_MS);
    },
    [onChange]
  );

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Update model and trigger onChange
  const updateModel = useCallback(
    (updates: Partial<DataModel>) => {
      const newModel = { ...localModel, ...updates };
      setLocalModel(newModel);
      debouncedOnChange(newModel);
    },
    [localModel, debouncedOnChange]
  );

  // Entity actions
  const openNewEntityEditor = () => {
    setEditingEntity(null);
    setIsEntityEditorOpen(true);
  };

  const openEditEntityEditor = (entity: DataModelEntity) => {
    setEditingEntity(entity);
    setIsEntityEditorOpen(true);
  };

  const handleSaveEntity = (entity: DataModelEntity) => {
    if (editingEntity) {
      // Update existing entity
      const newEntities = localModel.entities.map((e) =>
        e.name === editingEntity.name ? entity : e
      );

      // Update relationships if entity name changed
      let newRelationships = localModel.relationships;
      if (editingEntity.name !== entity.name) {
        newRelationships = localModel.relationships.map((r) => ({
          ...r,
          from: r.from === editingEntity.name ? entity.name : r.from,
          to: r.to === editingEntity.name ? entity.name : r.to,
        }));
      }

      updateModel({ entities: newEntities, relationships: newRelationships });
    } else {
      // Add new entity
      updateModel({ entities: [...localModel.entities, entity] });
    }

    setIsEntityEditorOpen(false);
    setEditingEntity(null);
  };

  const handleDeleteEntity = (entityName: string) => {
    // Check if entity has relationships
    const hasRelationships = localModel.relationships.some(
      (r) => r.from === entityName || r.to === entityName
    );

    if (hasRelationships && deleteConfirmEntity !== entityName) {
      setDeleteConfirmEntity(entityName);
      return;
    }

    // Remove entity and its relationships
    const newEntities = localModel.entities.filter((e) => e.name !== entityName);
    const newRelationships = localModel.relationships.filter(
      (r) => r.from !== entityName && r.to !== entityName
    );

    updateModel({ entities: newEntities, relationships: newRelationships });
    setDeleteConfirmEntity(null);
  };

  // Relationship actions
  const addRelationship = () => {
    if (!newRelFrom || !newRelTo || newRelFrom === newRelTo) return;

    // Check for duplicate
    const exists = localModel.relationships.some(
      (r) => r.from === newRelFrom && r.to === newRelTo
    );
    if (exists) return;

    const newRelationship: DataModelRelationship = {
      from: newRelFrom,
      to: newRelTo,
      type: newRelType,
      label: `${newRelFrom} → ${newRelTo}`,
    };

    updateModel({ relationships: [...localModel.relationships, newRelationship] });
    setNewRelFrom('');
    setNewRelTo('');
    setNewRelType('one-to-many');
  };

  const handleDeleteRelationship = (index: number) => {
    if (deleteConfirmRelationship !== index) {
      setDeleteConfirmRelationship(index);
      return;
    }

    const newRelationships = localModel.relationships.filter((_, i) => i !== index);
    updateModel({ relationships: newRelationships });
    setDeleteConfirmRelationship(null);
  };

  const existingEntityNames = localModel.entities.map((e) => e.name);

  return (
    <div className="space-y-6">
      {/* Entities Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Entities
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Define the data entities in your application
            </p>
          </div>
          <button
            type="button"
            onClick={openNewEntityEditor}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
              hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add Entity
          </button>
        </div>

        {/* Entity Cards Grid */}
        {localModel.entities.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <Database className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No entities defined yet. Click "Add Entity" to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {localModel.entities.map((entity) => (
              <div
                key={entity.name}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              >
                {/* Entity Header */}
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                    {entity.name}
                  </h4>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditEntityEditor(entity)}
                      disabled={disabled}
                      className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {deleteConfirmEntity === entity.name ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteEntity(entity.name)}
                          className="p-1 text-red-500 hover:text-red-600 rounded"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmEntity(null)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteEntity(entity.name)}
                        disabled={disabled}
                        className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Fields List */}
                {entity.fields.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    No fields defined
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {entity.fields.map((field, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <span className="font-mono">{field.name}</span>
                        <span className="text-gray-400 dark:text-gray-500">
                          ({field.type})
                        </span>
                        {field.required && (
                          <span className="text-red-500 text-[10px]">*</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Relationships Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Relationships
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Define how entities relate to each other
          </p>
        </div>

        {/* Add Relationship Form */}
        {localModel.entities.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <select
              value={newRelFrom}
              onChange={(e) => setNewRelFrom(e.target.value)}
              disabled={disabled}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-1 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">From entity...</option>
              {localModel.entities.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>

            <ArrowRight className="w-4 h-4 text-gray-400" />

            <select
              value={newRelTo}
              onChange={(e) => setNewRelTo(e.target.value)}
              disabled={disabled}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-1 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">To entity...</option>
              {localModel.entities
                .filter((e) => e.name !== newRelFrom)
                .map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.name}
                  </option>
                ))}
            </select>

            <select
              value={newRelType}
              onChange={(e) => setNewRelType(e.target.value as DataModelRelationship['type'])}
              disabled={disabled}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-1 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {RELATIONSHIP_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={addRelationship}
              disabled={disabled || !newRelFrom || !newRelTo || newRelFrom === newRelTo}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700
                rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        )}

        {/* Relationships List */}
        {localModel.relationships.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {localModel.entities.length < 2
                ? 'Add at least 2 entities to define relationships'
                : 'No relationships defined yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {localModel.relationships.map((rel, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {rel.from}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {rel.to}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                    {rel.type}
                  </span>
                </div>

                {deleteConfirmRelationship === index ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteRelationship(index)}
                      className="p-1 text-red-500 hover:text-red-600 rounded"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmRelationship(null)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDeleteRelationship(index)}
                    disabled={disabled}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {(localModel.entities.length > 0 || localModel.relationships.length > 0) && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
          {localModel.entities.length} entit{localModel.entities.length !== 1 ? 'ies' : 'y'},{' '}
          {localModel.relationships.length} relationship{localModel.relationships.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Entity Editor Modal */}
      <EntityEditor
        entity={editingEntity}
        isOpen={isEntityEditorOpen}
        onClose={() => {
          setIsEntityEditorOpen(false);
          setEditingEntity(null);
        }}
        onSave={handleSaveEntity}
        existingNames={existingEntityNames}
      />
    </div>
  );
}
