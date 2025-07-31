# Velocity Preview System FAQ

## General Questions

### What is Velocity Preview?
Velocity Preview is a real-time mobile app preview system that allows you to see your React Native applications running on actual iOS and Android devices directly in your browser. It provides instant feedback as you code with hot reload support.

### Which devices are supported?
We support a wide range of iOS and Android devices including:
- **iOS**: iPhone 15 Pro, iPhone 14, iPhone 13, iPhone SE, iPad Pro, iPad Air, iPad Mini
- **Android**: Pixel 8 Pro, Pixel 7, Pixel 6, Samsung Galaxy S23, Galaxy S22

Device availability may vary based on your subscription plan.

### Do I need to install anything?
No! Velocity Preview runs entirely in your browser. No SDKs, emulators, or physical devices required. Just click "Mobile Preview" and start testing.

### Is preview available on all plans?
Yes, preview is available on all plans with different quotas:
- **Free**: 60 minutes/month
- **Pro**: 500 minutes/month
- **Team**: 2,000 minutes/month
- **Enterprise**: Unlimited

## Technical Questions

### How does hot reload work?
Hot reload uses WebSocket connections to push code changes instantly to your preview device. When you save a file, Velocity:
1. Detects the change
2. Builds a delta bundle
3. Pushes it to the device
4. Updates the app without losing state

### Why is my preview slow?
Several factors can affect preview performance:
- **Internet speed**: Previews stream over the internet
- **Browser resources**: Close unused tabs
- **App complexity**: Large apps take longer to build
- **Device type**: Newer devices may be slightly slower

Try enabling Performance Mode in preview settings for faster updates.

### Can I debug my app in preview?
Yes! Velocity Preview includes debugging features:
- Console logs appear in the preview panel
- React DevTools integration
- Network request monitoring
- Performance profiling
- Error tracking with stack traces

### Does preview work with native modules?
Most React Native core modules are supported. Custom native modules require special handling. Check our [Native Module Guide](./technical/native-modules.md) for details.

### Can I test push notifications?
Push notifications can be simulated in preview. Real push notifications require additional configuration. See our [Push Notification Guide](./user-guides/push-notifications.md).

## Usage Questions

### How are preview minutes calculated?
Preview minutes are counted when a device is actively running:
- Time starts when preview loads
- Pauses during inactivity (after 5 minutes)
- Stops when you close the preview
- Shared sessions count against the session creator

### Can multiple people preview simultaneously?
Yes, with team plans:
- **Pro**: 2 concurrent sessions
- **Team**: 5 concurrent sessions  
- **Enterprise**: Unlimited concurrent sessions

### Can I share my preview with others?
Yes! Click the Share button to:
- Generate a public preview link
- Set expiration time
- Add password protection
- Limit interactions (view-only mode)

### How do I test different screen sizes?
Simply select a different device from the device selector. Each device has accurate screen dimensions and pixel density. You can also rotate devices to test landscape orientation.

### Can I test offline functionality?
Yes, you can simulate offline mode:
1. Click the network indicator
2. Select "Offline" mode
3. Your app will behave as if there's no internet connection

## Troubleshooting

### Preview won't load
1. Check your internet connection
2. Ensure your project builds successfully
3. Try refreshing the page (Cmd/Ctrl + R)
4. Clear browser cache
5. Check browser console for errors

### Hot reload not working
1. Check the WebSocket connection indicator (should be green)
2. Look for syntax errors in your code  
3. Ensure you're saving files in the project directory
4. Try manual refresh (Cmd/Ctrl + R in preview)
5. Restart the preview session

### "Session Creation Failed" error
This usually means:
- You've exceeded your monthly quota
- All preview servers are busy (rare)
- Network connectivity issues
- Authentication problems

Try again in a few moments or check your usage.

### Preview is pixelated or blurry
1. Check your internet speed
2. Disable "Performance Mode" for full quality
3. Ensure browser zoom is at 100%
4. Try a different browser
5. Check display scaling settings

### Can't interact with the app
- Ensure preview status is green (ready)
- Check if the app has crashed (see console)
- Try refreshing the preview
- Verify your code doesn't have runtime errors

## Features & Limitations

### What's NOT supported in preview?
- Bluetooth functionality
- Native camera (simulated only)
- Biometric authentication (Face ID/Touch ID)
- Apple Pay / Google Pay
- Background tasks
- Deep system integrations

### Can I use custom fonts?
Yes, custom fonts are supported. Upload them to your project and reference them normally. Note that system fonts may vary between iOS and Android.

### Is preview data persistent?
No, preview sessions are ephemeral:
- AsyncStorage is cleared between sessions
- Files are temporary
- Database changes don't persist
- Use mock data for testing

### Can I test in-app purchases?
In-app purchases can be simulated with test mode. Real transactions are not possible in preview. Configure test products in your preview settings.

### Does preview support tablet layouts?
Yes! Select iPad or Android tablet devices to test tablet-specific layouts and orientations. Responsive designs work automatically.

## Performance & Optimization

### How can I speed up preview loading?
1. **Enable session warming**: Pre-allocates devices
2. **Optimize your bundle**: Remove unused dependencies
3. **Use performance mode**: Reduces quality for speed
4. **Cache assets**: Enable asset caching in settings
5. **Choose closer regions**: Select preview servers near you

### What affects build time?
- Number of dependencies
- Code complexity
- Asset sizes
- Transform plugins
- Source map generation

### How do I reduce preview lag?
- Use a wired internet connection
- Close other browser tabs
- Disable browser extensions
- Use a modern browser (Chrome/Edge recommended)
- Reduce console.log statements

## Security & Privacy

### Is my code secure during preview?
Yes, we take security seriously:
- All connections are encrypted (TLS 1.3)
- Preview sessions are isolated
- Code is not stored on preview servers
- Sessions are terminated after use
- No data persists between sessions

### Can others access my preview?
Only if you explicitly share it. By default:
- Previews require authentication
- Sessions are tied to your account
- URLs are randomly generated
- Shared links can be revoked anytime

### What data does Velocity collect?
We collect minimal data for service operation:
- Usage metrics (minutes, device types)
- Error logs (anonymized)
- Performance metrics (aggregated)
- No source code is stored
- No app data is retained

## Billing & Quotas

### What happens when I exceed my quota?
- Preview will stop working for the remainder of the billing period
- You can upgrade your plan for immediate access
- Or wait until the next billing cycle
- Unused minutes don't roll over

### How can I monitor my usage?
Check your usage in:
- Dashboard usage widget
- Account settings → Usage
- Preview panel shows remaining minutes
- Email alerts at 80% and 100% usage

### Can I buy additional minutes?
Yes, you can purchase minute add-ons:
- 100 minutes: $10
- 500 minutes: $40
- 1000 minutes: $70
Add-ons expire after 90 days.

## Advanced Usage

### Can I automate preview testing?
Yes, using our API:
```javascript
const preview = await velocity.createPreview({
  device: 'iphone15pro',
  automationScript: './test-script.js'
});
```

### Is CI/CD integration possible?
Yes! See our [CI/CD Integration Guide](./tutorials/ci-cd.md) for:
- GitHub Actions integration
- Preview on pull requests
- Automated screenshot tests
- Performance regression testing

### Can I extend preview functionality?
Yes, through our plugin system:
- Custom controls
- Additional metrics
- Third-party integrations
- Custom device profiles

See the [Extension Guide](./developer/extending.md).

## Getting Help

### Where can I get support?
1. **Documentation**: https://docs.velocity.dev
2. **Discord Community**: https://discord.gg/velocity
3. **Email Support**: support@velocity.dev
4. **Status Page**: https://status.velocity.dev

### How do I report bugs?
1. Click "Report Issue" in preview panel
2. Include session ID and error details
3. Or email bugs@velocity.dev
4. Critical issues: use Discord #urgent-help

### Are there video tutorials?
Yes! Check our [YouTube channel](https://youtube.com/velocity-dev) for:
- Getting started guides
- Feature deep-dives
- Tips and tricks
- Live coding sessions

---

Still have questions? Join our [Discord community](https://discord.gg/velocity) or contact support@velocity.dev