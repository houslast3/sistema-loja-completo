#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Create initial database tables
node -e "require('./migrations/init-db.js').createTables().catch(console.error)"
