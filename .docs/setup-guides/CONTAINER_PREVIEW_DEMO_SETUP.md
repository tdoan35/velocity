# Container Preview Demo Setup

## Overview
A comprehensive demo page has been created to test the new Container Preview Panel system that replaces the Snack/Appetize.io preview architecture.

## Demo Page Location
- **URL**: `http://localhost:5173/demo/container-preview`
- **Component**: `ContainerPreviewDemo` in `/frontend/src/components/container-preview-demo.tsx`

## Features Included in Demo

### 1. Control Panel (Left Side)
- **Project ID Configuration**: Editable input field to test different project IDs
- **Status Monitoring**: Real-time status display showing:
  - Preview Status (idle, starting, running, error, stopping)
  - Session Active indicator (green/gray dot)
- **Device Information**: Visual grid showing supported devices (Mobile, Tablet, Desktop)
- **Feature Checklist**: List of all implemented features with green indicators
- **Demo Notes**: Important information about requirements and behavior

### 2. Preview Panel (Right Side)
- **Full ContainerPreviewPanel Integration**: Complete implementation of the new preview system
- **Device Selection**: Buttons for Mobile, Tablet, Desktop with appropriate icons
- **Orientation Control**: Rotate button for mobile and tablet devices
- **Session Management**: Start/Stop buttons with loading states
- **Status Badge**: Color-coded status indicator with detailed tooltips
- **Refresh & External Link**: Buttons for iframe refresh and opening in new tab

## Navigation Integration
- Added to navigation menu as "Container Preview" with Container icon
- Accessible via demo menu dropdown
- Route: `/demo/container-preview`

## Technical Implementation

### Components Created
1. **ContainerPreviewDemo** (`/components/container-preview-demo.tsx`)
   - Full demo page with control panel and preview integration
   - Real-time status monitoring and configuration

2. **ContainerPreviewPanel** (`/components/preview/ContainerPreviewPanel.tsx`)
   - Core preview component with iframe integration
   - Device selection, responsive sizing, security headers
   - Loading states, error handling, session lifecycle management

### Routing Configuration
- Added lazy-loaded route in `lazy-routes.tsx`
- Integrated into main App.tsx routing structure
- Added navigation menu item in `NavbarMenu.tsx`

## Testing Requirements

### Prerequisites
1. **Orchestrator Service**: Must be running on configured endpoint
   - Default: `http://localhost:3001` or set `NEXT_PUBLIC_ORCHESTRATOR_URL`
2. **Supabase Authentication**: User must be authenticated for session creation
3. **Container Registry**: Preview container images must be available in GHCR

### Testing Scenarios

#### 1. Basic Functionality
- [X] Navigate to `/demo/container-preview`
- [X] Page loads without errors
- [X] Control panel displays correctly
- [X] Preview panel shows "No Preview Session" state

#### 2. Session Management
- [ ] Click "Start" button with device selection
- [ ] Status changes to "Starting..." 
- [ ] After container ready, status shows "Running"
- [ ] Preview iframe loads container URL
- [ ] Stop button terminates session

#### 3. Device & Responsive Testing
- [ ] Switch between Mobile, Tablet, Desktop devices
- [ ] Rotate device orientation (mobile/tablet only)
- [ ] Verify responsive iframe sizing
- [ ] Test on different viewport sizes

#### 4. Error Handling
- [ ] Test with orchestrator service offline
- [ ] Test with invalid project ID
- [ ] Verify error messages and retry buttons
- [ ] Test iframe timeout (30s) behavior

#### 5. Security & Performance
- [ ] Inspect iframe security attributes in browser DevTools
- [ ] Verify CORS policies are applied
- [ ] Test iframe loading timeout behavior
- [ ] Verify resource cleanup on component unmount

## Integration with Existing System

### Replacement Strategy
The ContainerPreviewPanel is designed to replace:
- `SnackPreviewPanel` (Expo Snack integration)
- `FullStackPreviewPanel` (wrapper component)
- Appetize.io mobile device simulation

### Migration Path
1. **Phase 1**: Demo and testing (current)
2. **Phase 2**: Optional integration alongside existing system
3. **Phase 3**: Full replacement once orchestrator service is deployed

## Demo Configuration Options

### Environment Variables
- `NEXT_PUBLIC_ORCHESTRATOR_URL`: Orchestrator service endpoint
- Supabase configuration for authentication

### Project ID Testing
- Default: `demo-project-123`
- Can be changed via control panel input
- Use real project IDs for integration testing

## Known Limitations
1. **Orchestrator Dependency**: Requires running orchestrator service
2. **Authentication Required**: Session creation needs authenticated user
3. **Container Images**: Needs GHCR container images to be built and available

## Next Steps
1. Deploy orchestrator service to Fly.io
2. Set up GitHub Actions for container image building
3. Test end-to-end integration with real containers
4. Plan migration from existing preview system