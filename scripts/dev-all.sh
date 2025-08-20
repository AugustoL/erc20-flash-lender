#!/bin/bash

# Stop any existing processes
stop_processes() {
  echo "Stopping development processes..."
  
  # Stop Hardhat node (port 8545)
  if lsof -ti:8545; then
    echo "Stopping existing Hardhat node..."
    kill -9 $(lsof -ti:8545)
  fi
  
  # Stop signature server (port 3001)
  if lsof -ti:3001; then
    echo "Stopping existing signature server..."
    kill -9 $(lsof -ti:3001)
  fi
  
  # Stop React app (port 3000)
  if lsof -ti:3000; then
    echo "Stopping existing React app..."
    kill -9 $(lsof -ti:3000)
  fi
  
  echo "All processes stopped."
}

# Trap EXIT signal to ensure all processes are stopped
trap stop_processes EXIT

echo "Starting Complete Development Environment..."

# Stop any existing processes first
stop_processes

echo ""
echo "1️⃣  Starting Hardhat node and deploying contracts..."
# Run dev-node.sh in the background
./scripts/dev-node.sh &
DEV_NODE_PID=$!

# Wait for deployment to complete
sleep 5

echo ""
echo "2️⃣  Starting React application..."
# Run dev-app.sh in the background
./scripts/dev-app.sh &
DEV_APP_PID=$!

echo ""
echo "✅ Complete development environment started!"
echo ""
echo "📊 Services running:"
echo "  • Hardhat Node:     http://localhost:8545"
echo "  • React App:        http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services..."

# Wait for all background processes
wait