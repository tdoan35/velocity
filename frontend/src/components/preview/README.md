# Mobile Preview System

## Overview

The Mobile Preview system provides real-time mobile app previews using Appetize.io integration. It allows developers to see their React Native applications running on various iOS and Android devices directly in the browser.

## Components

### MobilePreview Component
The main preview component that displays the device frame and controls.

**Features:**
- Device selector with 14 pre-configured devices
- Orientation switching (portrait/landscape)
- Hot reload functionality
- Session management
- Real-time metrics display

### usePreviewSession Hook  
React hook for managing container preview sessions.

**Capabilities:**
- Session lifecycle management
- WebSocket connections for hot reload
- Device switching
- Metrics tracking
- Error handling

## Backend Infrastructure

### Edge Functions

1. **appetize-api**
   - Manages Appetize.io API integration
   - Handles device configurations
   - Creates and manages preview sessions

2. **preview-sessions**
   - Advanced session pooling
   - Usage quota management
   - Session metrics tracking
   - Automatic cleanup

### Database Schema

- `preview_sessions`: Active session tracking
- `preview_session_metrics`: Usage analytics
- `preview_sharing`: Public preview links
- `preview_session_pool`: Pre-warmed sessions

## Configuration

To enable live previews, add your Appetize.io API key to the environment:

```env
APPETIZE_API_KEY=your_api_key_here
```

## Usage

```tsx
import { MobilePreview } from '@/components/preview/MobilePreview';

function MyComponent() {
  return (
    <MobilePreview 
      onShare={() => handleShare()}
      className="h-[800px]"
    />
  );
}
```

## Supported Devices

### iOS
- iPhone 15 Pro (iOS 17)
- iPhone 15 (iOS 17)
- iPhone 14 Pro (iOS 16)
- iPhone 14 (iOS 16)
- iPhone 13 (iOS 15)
- iPhone 12 (iOS 14)
- iPad Pro 13" (iPadOS 17)
- iPad Pro 11" (iPadOS 17)

### Android
- Pixel 8 Pro (Android 14)
- Pixel 7 (Android 13)
- Pixel 6 (Android 12)
- Samsung Galaxy S23 (Android 13)
- Samsung Galaxy S22 (Android 12)
- Samsung Galaxy Tab S8 (Android 13)

## Session Management

The system implements intelligent session pooling to optimize resource usage:

1. **Pre-warming**: Sessions are pre-created for instant access
2. **Pooling**: Reuses sessions to reduce startup time
3. **Quota Management**: Tracks usage per subscription tier
4. **Auto-cleanup**: Removes expired sessions automatically

## Performance Features

- **Hot Reload**: WebSocket-based instant updates
- **Session Pooling**: Pre-warmed sessions for instant access
- **Metrics Tracking**: Monitor usage and performance
- **Resource Optimization**: Automatic cleanup and pooling

## Future Enhancements

- [ ] Physical device testing
- [ ] Collaborative preview sessions
- [ ] Session recording and playback
- [ ] Advanced debugging tools
- [ ] Performance profiling