#!/bin/bash
# 重启 NapCat Platform 开发服务器

echo "🔄 停止现有服务..."
lsof -ti :8090 | xargs kill -9 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

echo "🚀 启动服务..."
npm run dev
