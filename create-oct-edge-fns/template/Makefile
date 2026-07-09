# ============================================
# oct-edge-functions Makefile
# 用于构建、运行和导出 Docker 镜像
# ============================================

# 默认环境
ENV ?= dev
IMAGE_NAME = {{PROJECT_NAME}}
CONTAINER_NAME = $(IMAGE_NAME)-$(ENV)

# 从 .env.$(ENV) 加载 IMAGE_TAG
IMAGE_TAG := $(shell grep "^IMAGE_TAG=" .env.$(ENV) 2>/dev/null | cut -d'=' -f2 || echo $(ENV))
FULL_IMAGE_NAME = $(IMAGE_NAME):$(IMAGE_TAG)
EXPORT_FILE = $(IMAGE_NAME)-$(IMAGE_TAG).tar

# 检测 docker compose 命令
DOCKER_COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

# 默认端口（可通过 PORT=xxx 覆盖）
DEFAULT_PORT := $(shell grep "^HOST_PORT=" .env.dev 2>/dev/null | cut -d'=' -f2 || echo 18080)

# ============================================
# 帮助信息
# ============================================
.PHONY: help
help:
	@echo "oct-edge-functions 构建工具"
	@echo ""
	@echo "用法: make [目标] [ENV=dev|prod] [PORT=xxxx]"
	@echo ""
	@echo "目标:"
	@echo "  make build          构建镜像 (默认 dev)"
	@echo "  make build ENV=prod 构建生产镜像"
	@echo "  make up             启动服务 (dev 含 --watch 热加载)"
	@echo "  make up ENV=prod    启动生产服务 (无 --watch)"
	@echo "  make down           停止服务"
	@echo "  make export         导出镜像为 tar 文件"
	@echo "  make logs           查看日志"
	@echo "  make clean          清理容器和镜像"
	@echo "  make status         查看容器状态"
	@echo "  make test           运行所有测试"
	@echo "  make lint           运行代码检查"
	@echo "  make upgrade-core   升级 @oct-edge-fns/core 到新版"
	@echo "  make cache          缓存远程依赖"
	@echo "  make set-port       一键修改端口映射（.env.* + docker-compose.yml）"
	@echo "  make get-port       查看当前端口配置"

# ============================================
# 一键修改端口
# ============================================
.PHONY: set-port
set-port:
	@if [ -z "$(PORT)" ]; then \
		echo "❌ 错误: 请指定端口，例如: make set-port PORT=18080"; \
		exit 1; \
	fi
	@echo "========================================"
	@echo "修改端口为: $(PORT)"
	@echo "========================================"
	@# 修改 .env.dev
	@if [ -f .env.dev ]; then \
		sed -i.bak "s/^HOST_PORT=.*/HOST_PORT=$(PORT)/" .env.dev && rm -f .env.dev.bak; \
		echo "✅ 已更新 .env.dev -> HOST_PORT=$(PORT)"; \
	fi
	@# 修改 .env.prod（生产环境端口默认 +1，避免冲突）
	@if [ -f .env.prod ]; then \
		PROD_PORT=$$(( $(PORT) + 1 )); \
		sed -i.bak "s/^HOST_PORT=.*/HOST_PORT=$${PROD_PORT}/" .env.prod && rm -f .env.prod.bak; \
		echo "✅ 已更新 .env.prod -> HOST_PORT=$${PROD_PORT}"; \
	fi
	@# 修改 .env.example
	@if [ -f .env.example ]; then \
		sed -i.bak "s/^PORT=.*/PORT=$(PORT)/" .env.example && rm -f .env.example.bak; \
		echo "✅ 已更新 .env.example -> PORT=$(PORT)"; \
	fi
	@# 修改 docker-compose.yml
	@if [ -f docker-compose.yml ]; then \
		sed -i.bak "s/\$${HOST_PORT:-[0-9]*}/\$${HOST_PORT:-$(PORT)}/g" docker-compose.yml && rm -f docker-compose.yml.bak; \
		echo "✅ 已更新 docker-compose.yml -> HOST_PORT=$(PORT)"; \
	fi
	@# 修改 opencode.json
	@if [ -f opencode.json ]; then \
		sed -i.bak "s|localhost:[0-9]*|localhost:$(PORT)|g" opencode.json && rm -f opencode.json.bak; \
		echo "✅ 已更新 opencode.json -> localhost:$(PORT)"; \
	fi
	@# 修改 mcp-proxy.ts
	@if [ -f mcp-proxy.ts ]; then \
		sed -i.bak "s|localhost:[0-9]*|localhost:$(PORT)|g" mcp-proxy.ts && rm -f mcp-proxy.ts.bak; \
		echo "✅ 已更新 mcp-proxy.ts -> localhost:$(PORT)"; \
	fi
	@echo ""
	@echo "🎉 端口修改完成！"
	@echo "   开发环境: http://localhost:$(PORT)"
	@PROD_PORT=$$(( $(PORT) + 1 )); echo "   生产环境: http://localhost:$${PROD_PORT}"
	@echo ""
	@echo "提示: 如果容器正在运行，请先执行 make down 再 make up"

.PHONY: get-port
get-port:
	@echo "当前端口配置:"
	@if [ -f .env.dev ]; then \
		DEV_PORT=$$(grep "^HOST_PORT=" .env.dev 2>/dev/null | cut -d'=' -f2 || echo "未设置"); \
		echo "  .env.dev    HOST_PORT=$${DEV_PORT}"; \
	fi
	@if [ -f .env.prod ]; then \
		PROD_PORT=$$(grep "^HOST_PORT=" .env.prod 2>/dev/null | cut -d'=' -f2 || echo "未设置"); \
		echo "  .env.prod   HOST_PORT=$${PROD_PORT}"; \
	fi
	@if [ -f docker-compose.yml ]; then \
		DC_PORT=$$(grep -oP '\$\{HOST_PORT:-\K[0-9]+' docker-compose.yml 2>/dev/null || echo "未设置"); \
		echo "  docker-compose.yml 默认端口=$${DC_PORT}"; \
	fi
	@if [ -f opencode.json ]; then \
		OC_PORT=$$(grep -oP 'localhost:\K[0-9]+' opencode.json 2>/dev/null || echo "未设置"); \
		echo "  opencode.json  MCP URL端口=$${OC_PORT}"; \
	fi

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
	@echo "   dev 环境: 热加载已启用 (deno run --watch)"
	@echo "   prod 环境: 正常启动 (deno run)"
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
# 升级 core 依赖
# ============================================
.PHONY: upgrade-core
upgrade-core:
	deno run --allow-net --allow-read --allow-write --allow-run --allow-env scripts/upgrade-core.ts

# ============================================
# 缓存远程依赖
# ============================================
.PHONY: cache
cache:
	deno cache main.ts

# ============================================
# 运行测试
# ============================================
.PHONY: test
test:
	deno test --allow-all

# ============================================
# 代码检查
# ============================================
.PHONY: lint
lint:
	deno lint

# ============================================
# 查看状态
# ============================================
.PHONY: status
status:
	@echo "容器状态:"
	@docker ps --filter "name=$(IMAGE_NAME)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "镜像列表:"
	@docker images --filter "reference=$(IMAGE_NAME)*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
