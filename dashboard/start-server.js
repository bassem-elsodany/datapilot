#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

console.log('🚀 [SERVER] Starting DataPilot Dashboard Server...');
console.log('📁 [SERVER] Working directory:', process.cwd());
console.log('📦 [SERVER] Node version:', process.version);
console.log('🌐 [SERVER] Environment:', process.env.NODE_ENV || 'development');

// Check if dist directory exists
const fs = require('fs');
const distPath = path.join(process.cwd(), 'dist');

if (fs.existsSync(distPath)) {
  console.log('✅ [SERVER] Dist directory found');
  const files = fs.readdirSync(distPath);
  console.log('📄 [SERVER] Built files:', files);
} else {
  console.error('❌ [SERVER] Dist directory not found!');
  process.exit(1);
}

// Create logs directory and frontend log file
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('📁 [SERVER] Created logs directory');
}

const frontendLogFile = path.join(logsDir, 'frontend.log');
// Create empty log file if it doesn't exist
if (!fs.existsSync(frontendLogFile)) {
  fs.writeFileSync(frontendLogFile, '');
  console.log('📝 [SERVER] Created frontend log file');
}



// Start the serve process
console.log('🔍 [SERVER] Starting serve process...');
const serveProcess = spawn('serve', ['-s', 'dist', '-l', '5178', '--debug'], {
  stdio: 'pipe',
  shell: true
});

// Log serve process output
serveProcess.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    console.log(`📡 [SERVE] ${output}`);
  }
});

serveProcess.stderr.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    console.error(`❌ [SERVE] ${output}`);
  }
});

serveProcess.on('close', (code) => {
  console.log(`🔚 [SERVER] Serve process exited with code ${code}`);
});

serveProcess.on('error', (error) => {
  console.error(`💥 [SERVER] Failed to start serve:`, error);
});



// Handle process termination
process.on('SIGINT', () => {
  console.log('🛑 [SERVER] Received SIGINT, shutting down...');
  serveProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 [SERVER] Received SIGTERM, shutting down...');
  serveProcess.kill('SIGTERM');
  process.exit(0);
});

console.log('✅ [SERVER] Server startup complete, waiting for requests...');
