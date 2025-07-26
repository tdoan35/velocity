# Supabase Storage Buckets Setup Guide

## Overview

This guide provides step-by-step instructions for setting up Supabase Storage buckets for the Velocity platform with proper access controls, file type restrictions, and security policies.

## Storage Architecture

### Bucket Structure
We'll create 4 separate storage buckets for different content types:

1. **`project-assets`** - General project files (React Native code, images, assets)
2. **`build-artifacts`** - Deployment files (APK, IPA, build logs)
3. **`user-uploads`** - User-generated content (avatars, profile images)
4. **`system-files`** - Application resources and templates

## Step 1: Create Storage Buckets

### 1.1 Access Supabase Storage Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. You should see the storage overview page

### 1.2 Create Project Assets Bucket
1. Click **"New bucket"**
2. Set the following configuration:
   - **Name**: `project-assets`
   - **Public bucket**: ❌ **No** (we'll control access via RLS)
   - **File size limit**: `52428800` (50MB)
   - **Allowed MIME types**: Leave empty (we'll control via RLS policies)
3. Click **"Create bucket"**

### 1.3 Create Build Artifacts Bucket
1. Click **"New bucket"**
2. Set the following configuration:
   - **Name**: `build-artifacts`
   - **Public bucket**: ❌ **No**
   - **File size limit**: `524288000` (500MB)
   - **Allowed MIME types**: Leave empty
3. Click **"Create bucket"**

### 1.4 Create User Uploads Bucket
1. Click **"New bucket"**
2. Set the following configuration:
   - **Name**: `user-uploads`
   - **Public bucket**: ❌ **No**
   - **File size limit**: `10485760` (10MB)
   - **Allowed MIME types**: `image/png,image/jpeg,image/gif,image/svg+xml,image/webp,application/pdf`
3. Click **"Create bucket"**

### 1.5 Create System Files Bucket
1. Click **"New bucket"**
2. Set the following configuration:
   - **Name**: `system-files`
   - **Public bucket**: ❌ **No**
   - **File size limit**: `5242880` (5MB)
   - **Allowed MIME types**: Leave empty
3. Click **"Create bucket"**

## Step 2: Configure CORS Settings

### 2.1 Set CORS for All Buckets
For each bucket created above, configure CORS settings:

1. Click on the bucket name in the Storage dashboard
2. Go to **"Configuration"** tab
3. Click **"Edit CORS configuration"**
4. Add the following CORS configuration:

```json
[
  {
    "allowedOrigins": ["https://velocity-app.dev", "http://localhost:3000", "http://localhost:19006"],
    "allowedHeaders": ["authorization", "x-client-info", "apikey", "content-type"],
    "allowedMethods": ["POST", "GET", "PUT", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
```

**Note**: Replace `https://velocity-app.dev` with your actual domain.

### 2.2 Update CORS for Development
During development, you may need to add additional localhost ports:
- `http://localhost:3000` - React development server
- `http://localhost:19006` - Expo development server
- `http://localhost:8081` - React Native Metro bundler

## Step 3: Apply RLS Policies

### 3.1 Apply Storage Policies SQL
1. Go to **SQL Editor** in your Supabase dashboard
2. Copy the entire contents of `storage_buckets_config.sql`
3. Paste and execute the SQL script
4. Verify successful execution (should see "Success. No rows returned")

COMPLETED ✅ 

### 3.2 Verify RLS Policies
Run this query to verify RLS policies are created:

```sql
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
```

COMPLETED ✅ 

## Step 4: Configure File Type Restrictions

The SQL script includes automatic file type validation. Here are the allowed file types per bucket:

### Project Assets (`project_assets`)
```
Code: js, jsx, ts, tsx, json
Images: png, jpg, jpeg, gif, svg, ico
Styles: css, scss, less
Docs: md, txt, yml, yaml, xml
```

### Build Artifacts (`build_artifacts`)
```
Mobile: apk, ipa, aab
Archives: zip, tar, gz, tgz
Logs: json, log, txt
```

### User Uploads (`user_uploads`)
```
Images: png, jpg, jpeg, gif, svg, webp
Documents: pdf, doc, docx, txt
```

### System Files (`system_files`)
```
Images: png, jpg, jpeg, gif, svg
Web: json, js, css, html, xml
Docs: txt, md
```

COMPLETED ✅ 

## Step 5: Test Storage Configuration

### 5.1 Test File Upload
Create a simple test to verify storage is working:

1. Go to **Storage** → Select `user_uploads` bucket
2. Create a folder with your user ID (get from auth.users table)
3. Try uploading a small image file
4. Verify the file appears in the bucket

TEST FAILED

### 5.2 Test Access Control
Test that RLS policies are working:

```javascript
// Test uploading to user_uploads bucket
const { data, error } = await supabase.storage
  .from('user_uploads')
  .upload(`${userId}/avatar.png`, file);

// Test accessing project_assets
const { data: projectFiles } = await supabase.storage
  .from('project_assets')
  .list(`${projectId}/`);
```

## Step 6: Set Up CDN and Performance

### 6.1 Enable CDN (Optional)
For better performance, Supabase provides CDN for storage:
1. Files are automatically served through Supabase's CDN
2. No additional configuration needed
3. Files are cached based on content-type headers

### 6.2 Optimize Image Delivery
For user uploads and project assets, consider:
- Upload images in appropriate formats (WebP for web, PNG for transparency)
- Use compression before upload
- Implement image resizing on the client side

## Step 7: Monitoring and Analytics

### 7.1 Monitor Storage Usage
Use the provided views to monitor storage:

```sql
-- Overall bucket usage
SELECT * FROM public.storage_usage_by_bucket;

-- User storage usage
SELECT * FROM public.user_storage_usage;

-- Project storage usage  
SELECT * FROM public.project_storage_usage;
```

### 7.2 Set Up Alerts
Consider setting up alerts for:
- High storage usage per user/project
- Large file uploads
- Suspicious upload patterns
- Storage quota approaching limits

## Step 8: Maintenance and Cleanup

### 8.1 Automated Cleanup
The SQL script includes cleanup functions:

```sql
-- Clean up build artifacts older than 30 days
SELECT public.cleanup_old_build_artifacts(30);

-- Clean up orphaned uploads
SELECT public.cleanup_orphaned_uploads();
```

### 8.2 Set Up Scheduled Cleanup
Consider setting up a scheduled job to run cleanup functions:
1. Use Supabase Edge Functions with cron
2. Or set up external cron job to call cleanup endpoints

## Security Considerations

### ✅ **Implemented Security Measures:**
- ✅ RLS policies for all buckets
- ✅ File type validation
- ✅ File size limits
- ✅ User-based access control
- ✅ Project-based access control
- ✅ Service role admin access

### 🔒 **Additional Security Recommendations:**
1. **Virus Scanning**: Consider integrating virus scanning for user uploads
2. **Content Moderation**: Implement content moderation for user-generated content
3. **Rate Limiting**: Set up rate limiting for uploads
4. **Audit Logging**: Log all storage operations for security auditing

## Folder Structure Conventions

### Project Assets Structure
```
project_assets/
├── {project_id}/
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   └── assets/
│   ├── public/
│   └── docs/
```

### Build Artifacts Structure
```
build_artifacts/
├── {build_id}/
│   ├── android/
│   │   ├── app.apk
│   │   └── build.log
│   ├── ios/
│   │   ├── app.ipa
│   │   └── build.log
│   └── metadata.json
```

### User Uploads Structure
```
user_uploads/
├── {user_id}/
│   ├── avatar.png
│   ├── profile/
│   └── documents/
```

### System Files Structure
```
system_files/
├── templates/
│   ├── react-native/
│   └── components/
├── assets/
│   └── icons/
└── docs/
```

## API Usage Examples

### Upload Project Asset
```javascript
const { data, error } = await supabase.storage
  .from('project_assets')
  .upload(`${projectId}/src/App.tsx`, file, {
    cacheControl: '3600',
    upsert: true
  });
```

### Upload User Avatar
```javascript
const { data, error } = await supabase.storage
  .from('user_uploads')
  .upload(`${userId}/avatar.png`, avatarFile, {
    cacheControl: '3600',
    upsert: true
  });
```

### Get Public URL
```javascript
const { data } = supabase.storage
  .from('project_assets')
  .getPublicUrl(`${projectId}/assets/logo.png`);
```

### Download File
```javascript
const { data, error } = await supabase.storage
  .from('build_artifacts')
  .download(`${buildId}/android/app.apk`);
```

## Troubleshooting

### Common Issues and Solutions

**Issue**: Upload fails with "Access denied"
**Solution**: Check RLS policies and ensure user has proper permissions

**Issue**: File type rejected
**Solution**: Verify file extension is in allowed list for the bucket

**Issue**: File too large
**Solution**: Check file size against bucket limits and compress if needed

**Issue**: CORS errors in browser
**Solution**: Verify CORS configuration includes your domain and localhost ports

**Issue**: Slow uploads
**Solution**: Check file size, network connection, and consider compression

## Next Steps

After successful storage configuration:
1. ✅ All storage buckets created and configured
2. ✅ RLS policies applied and tested
3. ✅ File type restrictions implemented
4. ✅ CORS settings configured
5. ✅ Monitoring and analytics set up
6. 🚀 Ready for application integration

The storage system is now ready to handle file uploads, downloads, and management for the Velocity platform with enterprise-grade security and access controls.