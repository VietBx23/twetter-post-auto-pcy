// Test script to verify all dependencies and basic functionality
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Twitter Auto Post System...\n');

// Check required files
const requiredFiles = [
  'server.js',
  'package.json',
  'views/twitter.ejs',
  '.env.example'
];

console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING!`);
  }
});

// Check package.json
console.log('\n📦 Checking package.json:');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log(`✅ Name: ${pkg.name}`);
  console.log(`✅ Version: ${pkg.version}`);
  console.log(`✅ Main: ${pkg.main}`);
  console.log(`✅ Start script: ${pkg.scripts.start}`);
  
  // Check dependencies
  const requiredDeps = [
    'express', 'ejs', 'axios', 'twitter-api-v2', 
    'openai', 'node-cron', 'moment', 'dotenv'
  ];
  
  console.log('\n📚 Checking dependencies:');
  requiredDeps.forEach(dep => {
    if (pkg.dependencies[dep]) {
      console.log(`✅ ${dep}: ${pkg.dependencies[dep]}`);
    } else {
      console.log(`❌ ${dep} - MISSING!`);
    }
  });
  
} catch (err) {
  console.log('❌ Error reading package.json:', err.message);
}

// Check environment variables template
console.log('\n🔐 Checking .env.example:');
try {
  const envExample = fs.readFileSync('.env.example', 'utf8');
  const requiredEnvVars = [
    'API_KEY', 'API_KEY_SECRET', 'ACCESS_TOKEN', 
    'ACCESS_TOKEN_SECRET', 'OPENROUTER_API_KEY'
  ];
  
  requiredEnvVars.forEach(envVar => {
    if (envExample.includes(envVar)) {
      console.log(`✅ ${envVar}`);
    } else {
      console.log(`❌ ${envVar} - MISSING!`);
    }
  });
} catch (err) {
  console.log('❌ Error reading .env.example:', err.message);
}

console.log('\n🚀 Ready for deployment!');
console.log('\n📋 Next steps:');
console.log('1. Push code to GitHub');
console.log('2. Create Web Service on Render.com');
console.log('3. Set Environment Variables in Render Dashboard');
console.log('4. Deploy and test!');
console.log('\n🔗 Render Dashboard: https://dashboard.render.com');