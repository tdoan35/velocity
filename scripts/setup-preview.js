#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setupPreview() {
  console.log('\n🚀 Velocity Mobile Preview Setup\n');
  
  // Check if .env exists
  const envPath = path.join(__dirname, '../frontend/.env');
  const envExamplePath = path.join(__dirname, '../frontend/.env.example');
  
  if (!fs.existsSync(envPath)) {
    console.log('Creating .env file from .env.example...');
    fs.copyFileSync(envExamplePath, envPath);
  }
  
  // Read current .env
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  console.log('\nPlease provide the following configuration:\n');
  
  // Supabase Configuration
  if (!envContent.includes('VITE_SUPABASE_URL=https://')) {
    const supabaseUrl = await question('Supabase Project URL: ');
    envContent = envContent.replace(
      'VITE_SUPABASE_URL=your_supabase_project_url',
      `VITE_SUPABASE_URL=${supabaseUrl}`
    );
  }
  
  if (!envContent.includes('VITE_SUPABASE_ANON_KEY=eyJ')) {
    const supabaseKey = await question('Supabase Anon Key: ');
    envContent = envContent.replace(
      'VITE_SUPABASE_ANON_KEY=your_supabase_anon_key',
      `VITE_SUPABASE_ANON_KEY=${supabaseKey}`
    );
  }
  
  // Appetize.io Configuration
  console.log('\n📱 Appetize.io Configuration\n');
  console.log('Get your API keys from: https://appetize.io/dashboard\n');
  
  if (!envContent.includes('VITE_APPETIZE_API_KEY=') || envContent.includes('your_appetize_api_key_here')) {
    const appetizeKey = await question('Appetize.io API Key: ');
    envContent = envContent.replace(
      'VITE_APPETIZE_API_KEY=your_appetize_api_key_here',
      `VITE_APPETIZE_API_KEY=${appetizeKey}`
    );
  }
  
  if (!envContent.includes('VITE_APPETIZE_PUBLIC_KEY=') || envContent.includes('your_appetize_public_key_here')) {
    const appetizePublicKey = await question('Appetize.io Public Key: ');
    envContent = envContent.replace(
      'VITE_APPETIZE_PUBLIC_KEY=your_appetize_public_key_here',
      `VITE_APPETIZE_PUBLIC_KEY=${appetizePublicKey}`
    );
  }
  
  // Write updated .env
  fs.writeFileSync(envPath, envContent);
  
  console.log('\n✅ Configuration saved to frontend/.env\n');
  
  // Show next steps
  console.log('Next steps:');
  console.log('1. Deploy Supabase functions:');
  console.log('   supabase functions deploy appetize-api');
  console.log('   supabase functions deploy preview-sessions\n');
  console.log('2. Set Appetize API key secret in Supabase:');
  console.log('   supabase secrets set APPETIZE_API_KEY=your-api-key\n');
  console.log('3. Run database migrations:');
  console.log('   supabase db push\n');
  console.log('4. Start the development server:');
  console.log('   cd frontend && npm run dev\n');
  
  rl.close();
}

// Run setup
setupPreview().catch(console.error);