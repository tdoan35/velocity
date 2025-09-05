-- Simplify project policies to avoid any potential recursion

-- Drop potentially problematic policies
DROP POLICY IF EXISTS "Users can create projects" ON projects;
DROP POLICY IF EXISTS "Team projects visible to all authenticated" ON projects;
DROP POLICY IF EXISTS "Users access own projects" ON projects;

-- Create super simple project policies

-- 1. Users can create their own projects (no team check)
CREATE POLICY "Users create own projects" ON projects
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id
    );

-- 2. Users can view their own projects
CREATE POLICY "Users view own projects" ON projects
    FOR SELECT USING (
        owner_id = auth.uid()
    );

-- 3. Users can update their own projects  
CREATE POLICY "Users update own projects" ON projects
    FOR UPDATE USING (
        owner_id = auth.uid()
    );

-- 4. Users can delete their own projects
CREATE POLICY "Users delete own projects" ON projects
    FOR DELETE USING (
        owner_id = auth.uid()
    );

-- Also ensure conversations table has simple policies
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

-- Create simple conversation policies
CREATE POLICY "Users manage own conversations" ON conversations
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Check if conversation_messages table exists and add policies
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_messages') THEN
        -- Drop any existing policies
        DROP POLICY IF EXISTS "Users can create messages in their conversations" ON conversation_messages;
        DROP POLICY IF EXISTS "Users can view messages in their conversations" ON conversation_messages;
        
        -- Create simple message policies
        EXECUTE 'CREATE POLICY "Users manage messages in own conversations" ON conversation_messages
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM conversations c
                    WHERE c.id = conversation_messages.conversation_id
                    AND c.user_id = auth.uid()
                )
            )';
    END IF;
END $$;