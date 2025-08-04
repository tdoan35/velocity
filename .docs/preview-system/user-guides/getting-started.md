# Getting Started with Velocity Preview

Welcome to Velocity's real-time mobile preview system! This guide will help you get up and running with previewing your React Native applications on real devices in minutes.

## What is Velocity Preview?

Velocity Preview allows you to see your React Native application running on real iOS and Android devices directly in your browser. Changes you make to your code are instantly reflected in the preview through hot reloading.

## Prerequisites

Before you begin, ensure you have:

- A Velocity account with an active subscription
- A React Native project created in Velocity
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- Stable internet connection

## Starting Your First Preview

### Step 1: Open Your Project

1. Log in to your Velocity account
2. Navigate to your project from the dashboard
3. Click on the **Code Editor** tab

### Step 2: Launch Preview

1. Look for the **Mobile Preview** button in the top toolbar
2. Click the button to open the preview panel
3. Wait for the preview to initialize (usually 10-20 seconds)

![Preview Button Location](../images/preview-button.png)

### Step 3: Select a Device

1. Once the preview loads, you'll see a default device (iPhone 15 Pro)
2. To change devices:
   - Click the device selector dropdown
   - Choose from available iOS and Android devices
   - The preview will reload with your selected device

### Step 4: Interact with Your App

- **Click/Tap**: Click anywhere on the device screen to simulate taps
- **Scroll**: Click and drag to scroll through content
- **Type**: Click on text inputs and use your keyboard
- **Rotate**: Use the rotation button to switch between portrait and landscape

## Understanding the Preview Interface

### Preview Controls

The preview panel includes several controls:

- **🔄 Refresh**: Reload the entire app
- **📱 Device Selector**: Switch between different devices
- **🔃 Rotate**: Toggle device orientation
- **📸 Screenshot**: Capture the current screen
- **⚡ Performance**: View performance metrics
- **🐛 Debug**: Access debugging tools

### Status Indicators

- **🟢 Green**: Preview is connected and running
- **🟡 Yellow**: Building or loading
- **🔴 Red**: Error or disconnected

## Making Changes

1. Edit your code in the editor
2. Save your changes (Ctrl/Cmd + S)
3. Watch the preview automatically update
4. If hot reload fails, click the refresh button

## Tips for Best Experience

### Performance Optimization

- Close unused browser tabs to free up memory
- Use a stable internet connection
- Select appropriate device types for your testing needs
- Enable performance mode for faster updates

### Keyboard Shortcuts

- `Ctrl/Cmd + R`: Refresh preview
- `Ctrl/Cmd + D`: Toggle device frame
- `Ctrl/Cmd + O`: Change orientation
- `Ctrl/Cmd + Shift + D`: Open device selector

### Common Actions

#### Testing User Input
```javascript
// Your text input will work seamlessly
<TextInput
  placeholder="Type here..."
  onChangeText={setText}
  value={text}
/>
```

#### Navigation Testing
```javascript
// Navigation gestures are fully supported
<NavigationContainer>
  <Stack.Navigator>
    {/* Your screens */}
  </Stack.Navigator>
</NavigationContainer>
```

## Next Steps

Now that you've got the basics down:

1. Learn about [Advanced Preview Controls](./preview-controls.md)
2. Explore [Device-Specific Features](./device-selection.md)
3. Master [Hot Reload & Debugging](./hot-reload.md)
4. Optimize with [Performance Tips](./performance-tips.md)

## Troubleshooting Quick Tips

### Preview Won't Load
- Check your internet connection
- Ensure your project builds successfully
- Try refreshing the page
- Check the browser console for errors

### Slow Performance
- Reduce the number of active previews
- Close other browser tabs
- Try a different device type
- Check our [Performance Guide](./performance-tips.md)

### Can't Interact with App
- Ensure the preview is fully loaded (green status)
- Try clicking the refresh button
- Check if the app has crashed (see console logs)
- Verify your code doesn't have runtime errors

## Getting Help

If you encounter issues:

1. Check the [Common Issues](../troubleshooting/common-issues.md) guide
2. View error details in the preview console
3. Contact support with your session ID
4. Join our community Discord for real-time help

---

Ready to explore more features? Continue to the [Preview Controls Guide](./preview-controls.md) →