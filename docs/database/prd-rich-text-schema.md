# PRD Rich Text Database Schema Documentation

**Date**: January 15, 2025  
**Version**: 1.0.0

## Overview

This document describes the database schema for PRD (Product Requirements Document) rich text content storage in the Velocity platform. The schema is designed to support a unified rich text content model from the start, with no legacy data migration requirements.

## Table Structure

### `prds` Table

The main PRDs table stores Product Requirements Documents with the following key columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `project_id` | `uuid` | Associated project |
| `user_id` | `uuid` | Owner of the PRD |
| `title` | `text` | PRD title |
| `status` | `text` | Status: draft, in_progress, review, finalized, archived |
| `sections` | `jsonb` | Array of section objects with rich text content |
| `completion_percentage` | `integer` | Calculated completion percentage |
| `created_at` | `timestamp` | Creation timestamp |
| `updated_at` | `timestamp` | Last update timestamp |
| `finalized_at` | `timestamp` | Finalization timestamp (nullable) |

### Section Object Structure

Each section in the `sections` JSONB array follows this structure:

```json
{
  "id": "string",
  "title": "string",
  "order": 1,
  "agent": "project_manager|design_assistant|engineering_assistant|config_helper",
  "required": true,
  "content": {
    "html": "<h2>Vision</h2><p>Content here...</p>",
    "text": "Vision: Content here..."
  },
  "status": "pending|in_progress|completed",
  "isCustom": false,
  "description": "Optional section description",
  "template": {
    "html": "<p class='template-placeholder'>Template content</p>",
    "text": "Template content"
  }
}
```

## Indexes

The following indexes are created for optimal performance:

1. **GIN Index on sections**: `idx_prds_sections_gin`
   - Enables efficient JSONB queries within sections array

2. **Text Search Index**: `idx_prds_sections_content_text`
   - Supports full-text search across PRD content

3. **Project ID Index**: `idx_prds_project_id`
   - Fast lookups by project

4. **User ID Index**: `idx_prds_user_id`
   - Fast user-specific queries

5. **Composite User-Status Index**: `idx_prds_user_status`
   - Optimizes filtered queries by user and status

## Views

### `prd_sections_expanded`

A materialized view that flattens the sections array for easier querying:

```sql
SELECT 
  prd_id,
  project_id,
  user_id,
  section_id,
  section_title,
  content_html,
  content_text,
  section_status,
  ...
```

This view makes it easy to:
- Query individual sections
- Search across content
- Generate reports
- Filter by section properties

## Functions

### `search_prd_content(search_query, user_id_filter)`

Searches PRD content using full-text search:

```sql
SELECT * FROM search_prd_content('mobile app', auth.uid());
```

Returns matching sections with relevance scores.

### `get_prd_completion_stats(prd_id)`

Calculates completion statistics for a PRD:

```sql
SELECT * FROM get_prd_completion_stats('prd-uuid-here');
```

Returns:
- Total sections count
- Required sections count
- Completed sections count
- Completion percentage

### `validate_prd_section_content()`

Trigger function that validates section structure on insert/update (optional, disabled by default).

## Row Level Security (RLS)

The following RLS policies are implemented:

1. **View Policy**: Users can only view their own PRDs
2. **Update Policy**: Users can only update their own PRDs
3. **Insert Policy**: Users can only create PRDs for themselves

## Performance Optimizations

1. **TOAST Tuning**: `toast_tuple_target = 8160`
   - Optimized for large JSONB content storage

2. **GIN Indexes**: 
   - Enable fast JSONB queries without full table scans

3. **Selective Indexing**:
   - Indexes on frequently queried columns only

## Query Examples

### Get all sections for a PRD
```sql
SELECT * FROM prd_sections_expanded 
WHERE prd_id = 'uuid-here'
ORDER BY section_order;
```

### Search for content
```sql
SELECT * FROM search_prd_content('authentication', auth.uid())
WHERE relevance > 0.1;
```

### Update a section's content
```sql
UPDATE prds 
SET sections = jsonb_set(
  sections,
  '{0,content}',
  '{"html": "<p>New content</p>", "text": "New content"}'::jsonb
)
WHERE id = 'prd-uuid' AND user_id = auth.uid();
```

### Get completion stats
```sql
SELECT * FROM get_prd_completion_stats('prd-uuid');
```

## Migration Notes

Since this is a pre-launch implementation:
- No data migration required
- Schema designed for rich text from the start
- All new PRDs will use this structure
- No backward compatibility needed

## Future Enhancements

Potential future improvements:
1. Versioning system for PRD content
2. Collaborative editing with operational transforms
3. Real-time subscriptions for section updates
4. AI-powered content suggestions cache
5. Section-level permissions for team collaboration

## Monitoring

Key metrics to monitor:
- Query performance on `sections` JSONB column
- Index usage statistics
- Table size growth
- Search function performance
- Completion calculation performance