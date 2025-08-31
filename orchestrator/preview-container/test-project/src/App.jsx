import React, { useState, useEffect } from 'react'

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{
      padding: '40px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <h1 style={{ color: '#2563eb', marginBottom: '30px' }}>
        🚀 Velocity Preview Container Test
      </h1>
      
      <div style={{
        background: '#f0f9ff',
        border: '1px solid #0ea5e9',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '30px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#0c4a6e' }}>
          ✅ Container Status: Running
        </h3>
        <p><strong>Current Time:</strong> {currentTime.toLocaleString()}</p>
        <p><strong>Project ID:</strong> {import.meta.env.VITE_PROJECT_ID || 'test-project'}</p>
        <p><strong>Hot Reloading:</strong> Enabled</p>
      </div>

      <h2 style={{ color: '#374151', marginBottom: '20px' }}>Test Features</h2>
      <ul style={{ lineHeight: '1.8', color: '#4b5563' }}>
        <li>✅ React with Vite development server</li>
        <li>✅ Hot module reloading</li>
        <li>✅ Real-time clock updates</li>
        <li>✅ Container health monitoring</li>
        <li>⚠️ File synchronization (requires Supabase connection)</li>
      </ul>

      <div style={{
        marginTop: '40px',
        padding: '20px',
        background: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: '8px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#92400e' }}>
          🧪 Testing Instructions
        </h3>
        <p style={{ margin: 0, color: '#78350f' }}>
          Try editing this file to test hot reloading. Changes should appear instantly!
        </p>
      </div>
    </div>
  )
}

export default App