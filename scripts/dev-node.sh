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

echo "🏄‍♂️ Starting Aloha Token Development Environment..."

# Stop any existing processes first
stop_processes

echo ""
echo "1️⃣  Starting Hardhat node..."
# Start the Hardhat node in the background
npx hardhat node &
HARDHAT_PID=$!

# Wait a moment for Hardhat to start
sleep 1

echo ""
echo "2️⃣  Compiling and deploying contracts..."
# Compile contracts and copy the ERC20FlashLender.json to the app directory
npx hardhat compile
cp artifacts/contracts/ERC20FlashLender.sol/ERC20FlashLender.json app/src/contracts/ERC20FlashLender.json

# Run the Hardhat dev script
npx hardhat --network localhost run scripts/deploy-dev.ts

# Wait a moment for signature server to start
sleep 1

echo ""
echo "4️⃣  Starting React application..."
# Start the React app
cd app
npm start &
REACT_PID=$!

echo ""
echo "✅ Development environment started!"
echo ""
echo "📊 Services running:"
echo "  • Hardhat Node:     http://localhost:8545"
echo "  • React App:        http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services..."

# Wait for all background processes
wait