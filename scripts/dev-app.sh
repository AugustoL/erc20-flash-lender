#!/bin/bash

echo ""
echo "//---- Starting React App ----//"
# Start the React app
cd app
npm start &
REACT_PID=$!

echo ""
echo "✅ Development environment started!"
echo ""
echo "📊 Services running:"
echo "  • React App:        http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services..."

# Wait for all background processes
wait