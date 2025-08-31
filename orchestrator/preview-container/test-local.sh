#!/bin/bash

# Local Testing Script for Preview Container
# Tests the container locally with mock environment

set -e

echo "🧪 Testing Velocity Preview Container Locally"

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "⚠️ Setting up test environment variables..."
    export PROJECT_ID="local-test-$(date +%s)"
    export SUPABASE_URL="https://test.supabase.co"
    export SUPABASE_ANON_KEY="test-key-local-development"
    export PORT="8080"
    export NODE_ENV="development"
    
    echo "🔧 Test Environment:"
    echo "   PROJECT_ID: ${PROJECT_ID}"
    echo "   SUPABASE_URL: ${SUPABASE_URL}"
    echo "   PORT: ${PORT}"
    echo ""
    echo "⚠️  Note: This will use mock Supabase credentials and may not work with real-time features"
fi

# Install dependencies
echo "📦 Installing container dependencies..."
npm install

# Create a test project directory
echo "📁 Setting up test project..."
mkdir -p /tmp/test-project
cd /tmp/test-project

# Create a simple test project
cat > package.json << EOF
{
  "name": "test-project",
  "version": "1.0.0",
  "scripts": {
    "dev": "python3 -m http.server 3000",
    "start": "python3 -m http.server 3000"
  }
}
EOF

cat > index.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Test Project</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .status { padding: 20px; background: #f0f8ff; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Velocity Preview Container Test</h1>
        <div class="status">
            <h3>✅ Container is running successfully!</h3>
            <p><strong>Project ID:</strong> ${PROJECT_ID}</p>
            <p><strong>Timestamp:</strong> <span id="time"></span></p>
        </div>
        <h2>Test Features</h2>
        <ul>
            <li>✅ Container initialization</li>
            <li>✅ Project structure creation</li>
            <li>✅ Development server startup</li>
            <li>⚠️ Real-time sync (requires valid Supabase credentials)</li>
        </ul>
    </div>
    
    <script>
        document.getElementById('time').textContent = new Date().toLocaleString();
        
        // Update time every second
        setInterval(() => {
            document.getElementById('time').textContent = new Date().toLocaleString();
        }, 1000);
    </script>
</body>
</html>
EOF

cd - > /dev/null

echo "🚀 Starting container in test mode..."
echo "📍 Test project created at: /tmp/test-project"
echo "🌐 Container will be available at: http://localhost:${PORT}"
echo ""
echo "Press Ctrl+C to stop the container"
echo ""

# Export the test project path
export PROJECT_DIR="/tmp/test-project"

# Run the entrypoint script
node entrypoint.js