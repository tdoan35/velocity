# Database Migration Instructions

## Migration Order

The migrations must be applied in the following order:

1. **20240725000000_base_schema.sql** - Creates the base `projects` table
2. **20240725000001_ai_integration_schema.sql** - Creates AI integration tables
3. **20240725000002_context_assembly_schema.sql** - Creates context assembly tables

## Applying Migrations via Supabase Dashboard

1. Go to the SQL Editor: https://supabase.com/dashboard/project/ozjipxxukgrvjxlefslq/sql
2. Click "New query"
3. Copy and paste each migration file in order
4. Click "Run" for each migration

## Important Notes

- The pgvector extension must be enabled first (included in the AI integration schema)
- Each migration depends on the previous ones, so order is important
- The base schema creates the `projects` table that other tables reference

## Troubleshooting

If you encounter errors:
- Make sure you're running migrations in the correct order
- Check that the pgvector extension is available in your Supabase plan
- Verify that no tables already exist with the same names

## Testing After Migration

Once migrations are applied, you can test by:
1. Creating a test user in the Authentication section
2. Using the test user's token to call the Edge Functions
3. Checking that tables were created in the Table Editor