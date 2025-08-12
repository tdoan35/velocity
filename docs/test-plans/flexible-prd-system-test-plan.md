# Test Plan: Flexible PRD System with Multi-Agent Collaboration

## Test Overview
**Feature:** Flexible PRD System with Multi-Agent Collaboration and Real-time Sync  
**Date:** January 12, 2025  
**Version:** 1.0  
**Test Environment:** Local development with Supabase

## Test Objectives
- Verify flexible JSONB sections structure works correctly
- Validate multi-agent ownership and handoff flow
- Test real-time synchronization between editor and conversation
- Ensure backward compatibility with existing PRDs
- Verify default sections display properly for new PRDs

---

## 1. Database & Migration Tests

### 1.1 Migration Application
**Precondition:** Fresh database or rollback to pre-migration state

**Test Steps:**
1. Run migration: `npx supabase db push`
2. Verify columns dropped from `prds` table:
   - `overview`, `core_features`, `additional_features`, `technical_requirements`, `success_metrics`
3. Verify `sections` JSONB column exists
4. Check helper functions created:
   - `initialize_prd_with_default_sections()`
   - `get_current_prd_agent()`
   - `are_agent_sections_complete()`

**Expected Result:** All migrations apply successfully without errors

### 1.2 Trigger Verification
**Test Steps:**
1. Create a new PRD via API
2. Query the PRD's sections field
3. Verify default sections are auto-initialized

**Expected Result:** 7 default sections created automatically with correct agent assignments

---

## 2. PRD Creation & Initialization Tests

### 2.1 New PRD Creation
**Test Steps:**
1. Navigate to a project without a PRD
2. Open PRD Editor
3. Verify default sections appear
4. Check placeholder content is displayed

**Expected Result:**
- 7 default sections shown (Overview, Core Features, Additional Features, UI Design Patterns, UX Flows, Technical Architecture, Tech Integrations)
- Each section shows helpful placeholder text
- Sections display correct agent assignment badges

### 2.2 PRD Creation via API
**Test Steps:**
```bash
# Call edge function
curl -X POST https://[project-ref].supabase.co/functions/v1/prd-management \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "projectId": "[test-project-id]"
  }'
```

**Expected Result:**
- PRD created with default sections
- Response includes `sections` array with 7 items
- `currentAgent` returns "project_manager"

---

## 3. Section Management Tests

### 3.1 Update Section Content
**Test Steps:**
1. Open PRD Editor
2. Click on "Overview" section
3. Add content:
   - Vision: "Build a revolutionary app"
   - Problem: "Current solutions are inadequate"
   - Target Users: ["Developers", "Designers"]
4. Wait for auto-save indicator
5. Refresh page

**Expected Result:**
- Content persists after refresh
- Section status changes to "completed"
- Completion percentage updates

### 3.2 Add Custom Section
**Test Steps:**
1. In PRD Editor, click "+" button in sections panel
2. Enter:
   - Title: "Security Requirements"
   - Agent: Engineering Assistant
   - Required: Yes
3. Click "Add"

**Expected Result:**
- New section appears in list
- Section is draggable/reorderable
- Section appears in editor with placeholder

### 3.3 Section Reordering (Drag & Drop)
**Test Steps:**
1. Open Section Manager in PRD Editor
2. Drag "Tech Integrations" section
3. Drop it after "Core Features"
4. Verify new order in editor

**Expected Result:**
- Section moves to new position
- Order persists after refresh
- Editor content reflects new order

### 3.4 Remove Custom Section
**Test Steps:**
1. Add a custom section (if not already present)
2. Hover over the custom section
3. Click trash icon
4. Confirm deletion

**Expected Result:**
- Section removed from list
- Cannot remove default required sections
- Completion percentage recalculates

---

## 4. Multi-Agent Flow Tests

### 4.1 Agent Handoff Sequence
**Test Steps:**
1. Start new conversation with PRD
2. Complete Overview section content
3. Complete Core Features section
4. Verify handoff message appears

**Expected Result:**
- After Project Manager sections complete: "Great! We've defined the project vision..."
- Current agent changes to Design Assistant
- Next section (UI Design Patterns) becomes active

### 4.2 Agent Status Tracking
**Test Steps:**
```bash
# Call edge function
curl -X POST https://[project-ref].supabase.co/functions/v1/prd-management \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getAgentStatus",
    "prdId": "[test-prd-id]",
    "agent": "project_manager"
  }'
```

**Expected Result:**
```json
{
  "agent": "project_manager",
  "sections": [...],
  "requiredCount": 2,
  "completedCount": 0,
  "isComplete": false,
  "nextAgent": "design_assistant",
  "prompts": {...}
}
```

### 4.3 Agent Section Completion
**Test Steps:**
1. Complete all Project Manager required sections
2. Check agent status
3. Verify next agent activation

**Expected Result:**
- `isComplete: true` for project_manager
- Next agent (design_assistant) becomes current
- Appropriate handoff message displayed

---

## 5. Real-time Sync Tests

### 5.1 Editor to Conversation Sync
**Test Steps:**
1. Open PRD Editor in one tab
2. Open conversation in another tab
3. Update section content in editor
4. Check conversation tab

**Expected Result:**
- Changes appear in conversation within 2-3 seconds
- No page refresh required
- Sync indicator shows briefly

### 5.2 Conversation to Editor Sync
**Test Steps:**
1. Open PRD Editor in one tab
2. In conversation, provide content for a section
3. AI updates section via API
4. Check editor tab

**Expected Result:**
- Editor updates automatically
- Section marked as completed
- Progress bar updates

### 5.3 Multiple User Sync
**Test Steps:**
1. Open PRD in two different browser sessions
2. Make changes in session 1
3. Observe session 2

**Expected Result:**
- Changes propagate to all sessions
- No conflicts or data loss
- Last write wins for simultaneous edits

---

## 6. UI/UX Tests

### 6.1 Table of Contents Navigation
**Test Steps:**
1. Open PRD Editor
2. Click TOC button (panel icon)
3. Click on different sections
4. Verify smooth scrolling

**Expected Result:**
- TOC panel slides in smoothly
- Clicking section scrolls to it
- Completed sections show green indicators

### 6.2 Auto-save Functionality
**Test Steps:**
1. Make changes to PRD content
2. Watch for "Saving..." indicator
3. Check network tab for API calls
4. Verify 2-second debounce

**Expected Result:**
- Auto-save triggers after 2 seconds of inactivity
- Visual feedback during save
- No save on every keystroke

### 6.3 Markdown Export
**Test Steps:**
1. Create PRD with content in multiple sections
2. Click Export button
3. Open downloaded markdown file

**Expected Result:**
- All sections exported correctly
- Proper markdown formatting
- Agent metadata included
- Section status preserved

---

## 7. Error Handling Tests

### 7.1 Network Failure During Save
**Test Steps:**
1. Open browser DevTools
2. Set network to "Offline"
3. Make changes to PRD
4. Observe error handling

**Expected Result:**
- Error toast notification appears
- Changes preserved locally
- Retry mechanism on reconnection

### 7.2 Invalid Section Operations
**Test Steps:**
1. Try to remove required default section
2. Try to add section with empty title
3. Try to reorder to invalid position

**Expected Result:**
- Appropriate error messages
- Operations prevented
- UI remains stable

### 7.3 Concurrent Edit Conflicts
**Test Steps:**
1. Open same PRD in two tabs
2. Make different changes simultaneously
3. Observe conflict resolution

**Expected Result:**
- Last write wins
- No data corruption
- Both sessions stay synchronized

---

## 8. Performance Tests

### 8.1 Large PRD Loading
**Test Steps:**
1. Create PRD with 20+ sections
2. Add substantial content to each
3. Measure load time
4. Test editor responsiveness

**Expected Result:**
- Load time < 3 seconds
- Smooth scrolling
- No UI freezing

### 8.2 Real-time Sync Latency
**Test Steps:**
1. Measure time between update and sync
2. Test with varying content sizes
3. Test with multiple concurrent users

**Expected Result:**
- Sync latency < 500ms on local network
- Graceful degradation under load
- No message loss

---

## 9. Backward Compatibility Tests

### 9.1 Legacy PRD Migration
**Test Steps:**
1. Create PRD with old structure (if available)
2. Load in new system
3. Verify data mapping

**Expected Result:**
- Old fields mapped to new sections
- No data loss
- Can edit and save normally

### 9.2 API Backward Compatibility
**Test Steps:**
1. Use old API format to update PRD
2. Verify section mapping works
3. Check response format

**Expected Result:**
- Legacy API calls still work
- Automatic mapping to new structure
- Deprecation warnings in logs

---

## 10. Security Tests

### 10.1 RLS Policy Verification
**Test Steps:**
1. Try to access another user's PRD
2. Try to modify without permission
3. Verify data isolation

**Expected Result:**
- Access denied for unauthorized PRDs
- Cannot modify other users' content
- Proper error messages returned

### 10.2 Input Validation
**Test Steps:**
1. Try XSS in section content: `<script>alert('XSS')</script>`
2. Try SQL injection in titles
3. Try oversized content (>1MB)

**Expected Result:**
- XSS sanitized or escaped
- SQL injection prevented
- Size limits enforced

---

## Test Execution Checklist

### Phase 1: Setup & Migration
- [ ] Database migrations applied
- [ ] Edge functions deployed
- [ ] Frontend components updated

### Phase 2: Core Functionality
- [ ] PRD creation with defaults
- [ ] Section CRUD operations
- [ ] Agent flow and handoffs
- [ ] Auto-save functionality

### Phase 3: Advanced Features
- [ ] Real-time synchronization
- [ ] Drag-and-drop reordering
- [ ] Multi-user collaboration
- [ ] Export functionality

### Phase 4: Edge Cases & Errors
- [ ] Network failure handling
- [ ] Concurrent edit resolution
- [ ] Performance under load
- [ ] Security validations

### Phase 5: Integration
- [ ] Conversation integration
- [ ] Project management integration
- [ ] Backward compatibility
- [ ] Cross-browser testing

---

## Bug Report Template

**Bug ID:** PRD-[number]  
**Date Found:** [date]  
**Severity:** Critical | High | Medium | Low  
**Component:** Database | API | Frontend | Sync  

**Description:**
[Clear description of the issue]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happens]

**Screenshots/Logs:**
[Attach relevant evidence]

**Environment:**
- Browser: [Chrome/Firefox/Safari]
- OS: [Windows/Mac/Linux]
- Network: [Local/Production]

---

## Sign-off Criteria

- [ ] All test cases pass
- [ ] No critical or high severity bugs
- [ ] Performance meets requirements
- [ ] Security tests pass
- [ ] Documentation updated
- [ ] Code review completed

**Tested By:** _______________  
**Date:** _______________  
**Approved By:** _______________