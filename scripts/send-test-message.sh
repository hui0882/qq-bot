#!/bin/bash

# NapCat 测试消息注入脚本
# 模拟用户账号发送消息，走完整的消息处理流程
# 用于 dev-tester agent

set -e

# 配置
SERVER_URL="${SERVER_URL:-http://localhost:8090}"
CONFIG_FILE="${CONFIG_FILE:-data/config.json}"
API_ENDPOINT="$SERVER_URL/api/test/inject"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_header() { echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"; }

# 从配置文件读取 auth token
get_auth_token() {
    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "配置文件不存在: $CONFIG_FILE"
        exit 1
    fi

    local token
    token=$(jq -r '.auth.token // empty' "$CONFIG_FILE")

    if [ -z "$token" ]; then
        print_error "配置文件中未找到 auth.token"
        exit 1
    fi

    echo "$token"
}

# 检查服务器状态
check_server() {
    print_info "检查服务器状态..."

    local response
    if ! response=$(curl -s -f "$API_ENDPOINT" 2>/dev/null); then
        print_error "服务器未运行或不可达: $SERVER_URL"
        exit 1
    fi

    local success
    success=$(echo "$response" | jq -r '.success // false')
    local ws_status
    ws_status=$(echo "$response" | jq -r '.data.wsStatus // "unknown"')

    if [ "$success" = "true" ] && [ "$ws_status" = "connected" ]; then
        print_success "服务器运行中，WS已连接"
        return 0
    else
        print_warning "服务器运行中但WS未连接 (状态: $ws_status)"
        return 1
    fi
}

# 发送测试消息（模拟用户发送）
send_message() {
    local text="$1"
    local user_id="${2:-2959411319}"
    local self_id="${3:-2945472749}"

    # 获取认证 token
    local token
    token=$(get_auth_token)

    print_info "模拟用户 $user_id 发送消息: \"$text\""
    print_info "使用token认证..."

    local start_time
    start_time=$(date +%s%N)

    local response
    response=$(curl -s -X POST "$API_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "{
            \"text\": \"$text\",
            \"userId\": $user_id,
            \"selfId\": $self_id
        }")

    local end_time
    end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))

    # 解析响应
    local success
    success=$(echo "$response" | jq -r '.success // false')

    if [ "$success" != "true" ]; then
        local error
        error=$(echo "$response" | jq -r '.error // "未知错误"')
        print_error "请求失败: $error"
        return 1
    fi

    # 输出结果
    print_success "消息注入成功 (${duration_ms}ms)"

    # 显示详细信息
    if [ "${VERBOSE:-false}" = "true" ]; then
        echo ""
        echo "$response" | jq '.data | {
            input: .input,
            duration: .duration,
            message: .message
        }'
    fi

    # 返回响应数据
    echo "$response"
}

# 显示帮助信息
show_help() {
    echo "用法: $0 [选项] <消息内容>"
    echo ""
    echo "模拟用户向 NapCat 服务器发送消息，走完整消息处理流程"
    echo ""
    echo "选项:"
    echo "  -h, --help          显示此帮助信息"
    echo "  -c, --check         检查服务器状态"
    echo "  -v, --verbose       显示详细输出"
    echo "  -u, --user ID       模拟的用户ID (默认: 2959411319)"
    echo "  -s, --self ID       机器人ID (默认: 2945472749)"
    echo ""
    echo "示例:"
    echo "  $0 \"帮我看一下有什么作业\""
    echo "  $0 -v \"你好世界\""
    echo "  $0 -u 123456 \"测试消息\""
    echo "  $0 -c"
    echo ""
    echo "环境变量:"
    echo "  SERVER_URL    服务器地址 (默认: http://localhost:8090)"
    echo "  CONFIG_FILE   配置文件路径 (默认: data/config.json)"
    echo "  VERBOSE       设置为true显示详细输出"
}

# 主函数
main() {
    local message=""
    local user_id="2959411319"
    local self_id="2945472749"
    local check_only=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--check)
                check_only=true
                shift
                ;;
            -v|--verbose)
                export VERBOSE=true
                shift
                ;;
            -u|--user)
                user_id="$2"
                shift 2
                ;;
            -s|--self)
                self_id="$2"
                shift 2
                ;;
            -*)
                print_error "未知选项: $1"
                show_help
                exit 1
                ;;
            *)
                message="$1"
                shift
                ;;
        esac
    done

    # 检查依赖
    if ! command -v jq &> /dev/null; then
        print_error "需要安装 jq: brew install jq"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        print_error "需要安装 curl"
        exit 1
    fi

    # 执行操作
    if [ "$check_only" = true ]; then
        check_server
        exit $?
    fi

    if [ -z "$message" ]; then
        print_error "请提供消息内容"
        show_help
        exit 1
    fi

    check_server || exit 1
    send_message "$message" "$user_id" "$self_id"
    exit $?
}

# 运行主函数
main "$@"
