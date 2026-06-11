#!/bin/bash

# ============================================
# oct-edge-functions 启动脚本
# 用法: ./start.sh [dev|prod|build|export] [选项]
#
# 模式:
#   dev    - 开发模式启动（镜像标签: dev）
#   prod   - 生产模式启动（镜像标签: prod）
#   build  - 仅构建镜像，不启动服务
#   export - 导出镜像为 tar 文件，方便无网环境导入
#
# 示例:
#   ./start.sh dev                # 开发模式启动
#   ./start.sh prod               # 生产模式启动
#   ./start.sh dev --build        # 开发模式重新构建后启动
#   ./start.sh build dev          # 仅构建开发镜像
#   ./start.sh build prod         # 仅构建生产镜像
#   ./start.sh export prod        # 导出生产镜像为 tar 文件
# ============================================

set -e

# 检测 docker compose 命令（新版 docker 使用 'docker compose'，旧版使用 'docker-compose'）
if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "错误: 未找到 docker compose 命令"
    echo "请确保 Docker 和 Docker Compose 已安装"
    exit 1
fi

# 解析命令
COMMAND=${1:-dev}
shift || true

# 根据命令设置模式
case "$COMMAND" in
    build)
        BUILD_ONLY=true
        EXPORT_ONLY=false
        ENV=${1:-dev}
        shift || true
        ;;
    export)
        BUILD_ONLY=false
        EXPORT_ONLY=true
        ENV=${1:-dev}
        shift || true
        ;;
    dev|prod)
        BUILD_ONLY=false
        EXPORT_ONLY=false
        ENV=$COMMAND
        ;;
    *)
        echo "错误: 未知命令 '$COMMAND'"
        echo "用法: ./start.sh [dev|prod|build|export]"
        exit 1
        ;;
esac

# 验证环境参数
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
    echo "错误: 环境必须是 'dev' 或 'prod'"
    echo "用法: ./start.sh [dev|prod|build|export]"
    exit 1
fi

# 检查对应的 .env 文件是否存在
if [[ ! -f ".env.$ENV" ]]; then
    echo "错误: 配置文件 .env.$ENV 不存在"
    exit 1
fi

# 导出环境变量
export DENO_ENV=$ENV

# 从 .env 和 .env.$ENV 加载 IMAGE_TAG
if [[ -f ".env.$ENV" ]]; then
    IMAGE_TAG=$(grep "^IMAGE_TAG=" ".env.$ENV" | cut -d'=' -f2 || echo "$ENV")
else
    IMAGE_TAG=$ENV
fi
export IMAGE_TAG

IMAGE_NAME="oct-edge-functions:$IMAGE_TAG"
EXPORT_FILE="oct-edge-functions-${IMAGE_TAG}.tar"

echo "========================================"
echo "环境: $ENV"
echo "镜像名称: $IMAGE_NAME"
echo "容器名称: oct-edge-functions-$ENV"
echo "Docker 命令: $DOCKER_COMPOSE"
echo "========================================"

if [[ "$BUILD_ONLY" == "true" ]]; then
    echo "执行: $DOCKER_COMPOSE build"
    $DOCKER_COMPOSE build "$@"
    echo ""
    echo "✅ 镜像构建完成: $IMAGE_NAME"
    echo ""
    echo "查看镜像: docker images | grep oct-edge-functions"
    
elif [[ "$EXPORT_ONLY" == "true" ]]; then
    # 检查镜像是否存在
    if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^$IMAGE_NAME$"; then
        echo "镜像 $IMAGE_NAME 不存在，先执行构建..."
        $DOCKER_COMPOSE build
    fi
    
    echo "导出镜像: $IMAGE_NAME"
    docker save -o "$EXPORT_FILE" "$IMAGE_NAME"
    echo ""
    echo "✅ 镜像导出完成: $EXPORT_FILE"
    echo ""
    echo "文件大小: $(du -h "$EXPORT_FILE" | cut -f1)"
    echo ""
    echo "无网环境导入命令:"
    echo "  docker load -i $EXPORT_FILE"
    
else
    echo "执行: $DOCKER_COMPOSE up"
    $DOCKER_COMPOSE up "$@"
fi
