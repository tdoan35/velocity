# Root Cause Analysis: Code Editor vs. Preview Mismatch

This document investigates the root cause of the discrepancy between the code displayed in the Monaco editor and the content rendered in the preview session container.

## 1. Problem Description

- **Symptom**: The code editor displays a React Native application (`App.js`), but the preview iframe shows a default Vite + React project (`App.jsx`).
- **Location**: Project Editor page (`/project/:id/editor`).
- **Expected Behavior**: The preview iframe should render the React Native application code shown in the editor.
- **Actual Behavior**: The preview iframe renders a boilerplate React application.

## 2. Initial Hypothesis

The preview container is being initialized with a default React template instead of the correct React Native project template associated with the project. This could be due to a failure in the project type detection logic or a misconfiguration in the container setup process.

## 3. Investigation Steps

1.  **`orchestrator/preview-container/entrypoint.js`**: This is the main script that runs inside the preview container. It's responsible for setting up the environment, syncing files, and starting the development server.
2.  **`orchestrator/preview-container/detect-project-type.js`**: This script is called by the entrypoint to analyze the project files and determine which development server to run (e.g., Vite, Expo, Next.js).

### 4. Analysis of `entrypoint.js`

Upon reviewing `entrypoint.js`, the key logic is in the `performInitialFileSync` function. This function attempts to download the project's files from a Supabase Storage bucket corresponding to the `PROJECT_ID`.

A critical section of the code is as follows:

```javascript
if (!files || files.length === 0) {
  console.log('📄 No existing files found, creating default project structure...');
  await createDefaultProject();
  return;
}
```

If no files are found in the storage bucket, the script proceeds to call `createDefaultProject()`.

### 5. Analysis of `createDefaultProject()`

The `createDefaultProject()` function generates a new, boilerplate **React + Vite** project from scratch. It creates a `package.json` with Vite dependencies, an `index.html`, and the default `App.jsx` and `main.jsx` files. This generated project is what the preview container ends up running.

## 6. Root Cause

The root cause of the issue is that **the project files for the React Native application do not exist in the Supabase Storage bucket for this project** (`af219acf-30d5-45c5-83a9-1f70205877ac`).

Because the `performInitialFileSync` function finds no files to download, it falls back to the `createDefaultProject()` function. This function creates a default Vite project, which is then correctly detected by `detect-project-type.js` and served to the iframe.

The code shown in the Monaco editor is the *intended* state of the project, but it has not been successfully synced or uploaded to the backend storage that the preview container relies on.

## 7. Recommended Solution

To resolve this issue, the project creation workflow must be updated. When a new project is created, the selected template files (in this case, the React Native template) must be uploaded to the corresponding Supabase Storage bucket (`project-files/<project_id>/`).

This will ensure that when the preview container starts, it finds the correct project files during the initial file sync and boots up the correct development environment (Expo for React Native) instead of generating a default Vite project.
