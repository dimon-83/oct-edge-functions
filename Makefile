# ============================================
# oct-edge-functions Makefile
# 用于构建、运行和导出 Docker 镜像
# ============================================

# 默认环境
ENV ?= dev
IMAGE_NAME = oct-edge-functions
CONTAINER_NAME = $(IMAGE_NAME)-$(ENV)

# 从 .env.$(ENV) 加载 IMAGE_TAG
IMAGE_TAG := $(shell grep "^IMAGE_TAG=" .env.$(ENV) 2>/dev/null | cut -d'=' -f2 || echo $(ENV))
FULL_IMAGE_NAME = $(IMAGE_NAME):$(IMAGE_TAG)
EXPORT_FILE = $(IMAGE_NAME)-$(IMAGE_TAG).tar

# 检测 docker compose 命令
DOCKER_COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

# ============================================
# 帮助信息
# ============================================
.PHONY: help
help:
	@echo "oct-edge-functions 构建工具"
	@echo ""
	@echo "用法: make [目标] [ENV=dev|prod]"
	@echo ""
	@echo "目标:"
	@echo "  make build          构建镜像 (默认 dev)"
	@echo "  make build ENV=prod 构建生产镜像"
	@echo "  make up             启动服务 (默认 dev)"
	@echo "  make up ENV=prod    启动生产服务"
	@echo "  make down           停止服务"
	@echo "  make export         导出镜像为 tar 文件"
	@echo "  make logs           查看日志"
	@echo "  make clean          清理容器和镜像"
	@echo "  make status         查看容器状态"

# ============================================
# 构建镜像
# ============================================
.PHONY: build
build:
	@echo "========================================"
	@echo "环境: $(ENV)"
	@echo "镜像名称: $(FULL_IMAGE_NAME)"
	@echo "容器名称: $(CONTAINER_NAME)"
	@echo "========================================"
	DENO_ENV=$(ENV) IMAGE_TAG=$(IMAGE_TAG) $(DOCKER_COMPOSE) build
	@echo ""
	@echo "✅ 镜像构建完成: $(FULL_IMAGE_NAME)"

# ============================================
# 启动服务
# ============================================
.PHONY: up
up:
	@echo "========================================"
	@echo "环境: $(ENV)"
	@echo "镜像名称: $(FULL_IMAGE_NAME)"
	@echo "容器名称: $(CONTAINER_NAME)"
	@echo "========================================"
	DENO_ENV=$(ENV) IMAGE_TAG=$(IMAGE_TAG) $(DOCKER_COMPOSE) up -d
	@echo ""
	@echo "✅ 服务已启动: $(CONTAINER_NAME)"
	@echo "查看日志: make logs ENV=$(ENV)"

# ============================================
# 停止服务
# ============================================
.PHONY: down
down:
	$(DOCKER_COMPOSE) down
	@echo "✅ 服务已停止"

# ============================================
# 查看日志
# ============================================
.PHONY: logs
logs:
	$(DOCKER_COMPOSE) logs -f

# ============================================
# 导出镜像
# ============================================
.PHONY: export
export: build
	@echo "导出镜像: $(FULL_IMAGE_NAME)"
	docker save -o $(EXPORT_FILE) $(FULL_IMAGE_NAME)
	@echo ""
	@echo "✅ 镜像导出完成: $(EXPORT_FILE)"
	@echo "文件大小: $$(du -h $(EXPORT_FILE) | cut -f1)"
	@echo ""
	@echo "无网环境导入命令:"
	@echo "  docker load -i $(EXPORT_FILE)"

# ============================================
# 清理容器和镜像
# ============================================
.PHONY: clean
clean:
	$(DOCKER_COMPOSE) down --rmi all --volumes --remove-orphans 2>/dev/null || true
	docker rmi $(FULL_IMAGE_NAME) 2>/dev/null || true
	@echo "✅ 清理完成"

# ============================================
# 查看状态
# ============================================
.PHONY: status
status:
	@echo "容器状态:"
	@docker ps --filter "name=oct-edge-functions" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "镜像列表:"
	@docker images --filter "reference=oct-edge-functions*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
