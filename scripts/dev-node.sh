#!/bin/bash

# Stop any existing processes
stop_processes() {
  echo "Stopping development processes..."
  
  # Stop Hardhat node (port 8545)
  if lsof -ti:8545; then
    echo "Stopping existing Hardhat node..."
    kill -9 $(lsof -ti:8545)
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

# Stop any existing processes first
stop_processes

echo ""
echo "//---- Compiling and deploying contracts ----//"
# Compile contracts and copy the ERC20FlashLender.json to the app directory
npx hardhat compile
cp artifacts/contracts/ERC20FlashLender.sol/ERC20FlashLender.json app/src/contracts/ERC20FlashLender.json

echo ""
echo "//---- Starting Hardhat node ----//"
# Start the Hardhat node in the background
npx hardhat node &
HARDHAT_PID=$!

# Wait a moment for Hardhat to start
sleep 1

# Run the Hardhat dev script
npx hardhat --network localhost run scripts/deploy-dev.ts

echo ""
echo "✅ Development environment started!"
echo ""
echo "📊 Services running:"
echo "  • Hardhat Node:     http://localhost:8545"
echo ""
echo "Press Ctrl+C to stop all services..."

# Wait for all background processes
wait