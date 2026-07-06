# ============================================
# oct-edge-functions Makefile
# 构建、运行、测试、发布 Docker 镜像 & Deno 包
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

# Deno 路径（如果不在 PATH 中，从用户目录查找）
DENO := $(shell command -v deno 2>/dev/null || echo "$(HOME)/.deno/bin/deno")

# oct-edge-fns-core 版本
CORE_VERSION ?= 0.1.0

# CLI 脚手架版本
CLI_VERSION ?= 0.1.0

# ============================================
# 帮助信息
# ============================================
.PHONY: help
help:
	@echo "oct-edge-functions 构建 & 发布工具"
	@echo ""
	@echo "用法: make [目标] [ENV=dev|prod] [CORE_VERSION=x.y.z]"
	@echo ""
	@echo "Docker 目标:"
	@echo "  make build          构建镜像 (默认 dev)"
	@echo "  make build ENV=prod 构建生产镜像"
	@echo "  make up             启动服务 (dev 含 --watch 热加载)"
	@echo "  make up ENV=prod    启动生产服务 (无 --watch)"
	@echo "  make down           停止服务"
	@echo "  make export         导出镜像为 tar 文件"
	@echo "  make logs           查看日志"
	@echo "  make clean          清理容器和镜像"
	@echo "  make status         查看容器状态"
	@echo ""
	@echo "Deno 目标:"
	@echo "  make dev            本地开发启动 (deno run --watch)"
	@echo "  make test           运行所有测试"
	@echo "  make test FILE=xxx  运行单个测试文件"
	@echo "  make lint           运行代码检查"
	@echo "  make fmt            格式化代码"
	@echo "  make check          类型检查 + lint (CI)"
	@echo ""
	@echo "核心包发布 (@oct-edge-fns/core):"
	@echo "  make core-publish-check  检查 JSR 发布内容 (dry-run)"
	@echo "  make core-publish        发布到 JSR (需 JSR_TOKEN)"
	@echo "  make core-version V=x.y.z  更新版号并 tag"
	@echo "  make core-link DIR=path  链接本地 lib/ 到目标项目的 import map"
	@echo "  make core-unlink DIR=path  移除本地链接，恢复 JSR 引用"
	@echo ""
	@echo "CLI 脚手架发布 (create-oct-edge-fns):"
	@echo "  make cli-pack       构建 npm tarball"
	@echo "  make cli-publish    发布到 npm (需 npm login)"
	@echo "  make cli-version V=x.y.z  更新 CLI 版号"
	@echo ""
	@echo "全部发布:"
	@echo "  make publish-all    core-publish + cli-publish"

# ============================================
# Docker 构建
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
# Deno 开发 (本地)
# ============================================
.PHONY: dev
dev:
	$(DENO) run --watch --allow-net --allow-env --allow-read --allow-write main.ts

# ============================================
# 运行测试
# ============================================
.PHONY: test
test:
ifdef FILE
	$(DENO) test --allow-all $(FILE)
else
	mkdir -p logs && $(DENO) test --allow-all --coverage=coverage lib/ functions/
endif

# ============================================
# 代码检查 & 格式化
# ============================================
.PHONY: lint
lint:
	$(DENO) lint

.PHONY: fmt
fmt:
	$(DENO) fmt

.PHONY: check
check:
	$(DENO) check main.ts lib/mod.ts
	$(DENO) lint

# ============================================
# @oct-edge-fns/core — JSR 发布
# ============================================
.PHONY: core-publish-check
core-publish-check:
	@echo "========================================"
	@echo "检查 @oct-edge-fns/core v$(CORE_VERSION) 发布内容"
	@echo "========================================"
	cd lib && $(DENO) publish --dry-run --allow-dirty --config deno.json
	@echo "✅ 发布内容检查通过"

.PHONY: core-publish
core-publish:
	@echo "========================================"
	@echo "发布 @oct-edge-fns/core v$(CORE_VERSION) 到 JSR"
	@echo "========================================"
	@if [ -n "$(JSR_TOKEN)" ]; then \
		echo "使用 JSR_TOKEN 发布"; \
		cd lib && $(DENO) publish --token $(JSR_TOKEN) --config deno.json; \
	else \
		echo "未设置 JSR_TOKEN，将使用浏览器认证发布"; \
		cd lib && $(DENO) publish --config deno.json; \
	fi
	@echo ""
	@echo "✅ @oct-edge-fns/core v$(CORE_VERSION) 发布完成"
	@echo "   用户引用方式:"
	@echo '     import ... from "jsr:@oct-edge-fns/core@^$(CORE_VERSION)"'

.PHONY: core-version
core-version:
	@if [ -z "$(V)" ]; then echo "用法: make core-version V=x.y.z"; exit 1; fi
	@echo "更新 @oct-edge-fns/core 版本至 v$(V)..."
	sed -i 's/"version": "[0-9.]*"/"version": "$(V)"/' lib/deno.json
	git add lib/deno.json
	git tag -a "core-v$(V)" -m "@oct-edge-fns/core v$(V)"
	@echo "✅ 版本更新至 v$(V)，已创建 tag core-v$(V)"
	@echo "推送: git push --tags"

# ============================================
# core-link / core-unlink — 本地链接核心库到目标项目
# 用法: make core-link DIR=../my-project
#       make core-unlink DIR=../my-project
# ============================================
CORE_LIB_ABS := $(abspath lib)

.PHONY: core-link
core-link:
	@if [ -z "$(DIR)" ]; then echo "用法: make core-link DIR=path/to/project"; exit 1; fi
	@if [ ! -f "$(DIR)/deno.json" ]; then echo "错误: $(DIR)/deno.json 不存在"; exit 1; fi
	@echo "========================================"
	@echo "链接 @oct-edge-fns/core 到 $(DIR)"
	@echo "  本地路径: $(CORE_LIB_ABS)"
	@echo "========================================"
	$(DENO) run --allow-read --allow-write --allow-net scripts/link-core.ts link $(DIR)
	@echo "✅ 本地链接完成: $(DIR)"
	@echo "   @oct-edge-fns/core -> $(CORE_LIB_ABS)/mod.ts"
	@echo "   @oct-edge-fns/core/ -> $(CORE_LIB_ABS)/"
	@echo "恢复: make core-unlink DIR=$(DIR)"

.PHONY: core-unlink
core-unlink:
	@if [ -z "$(DIR)" ]; then echo "用法: make core-unlink DIR=path/to/project"; exit 1; fi
	@if [ ! -f "$(DIR)/deno.json" ]; then echo "错误: $(DIR)/deno.json 不存在"; exit 1; fi
	@echo "========================================"
	@echo "移除 @oct-edge-fns/core 本地链接，恢复 JSR 引用"
	@echo "========================================"
	$(DENO) run --allow-read --allow-write --allow-net scripts/link-core.ts unlink $(DIR)
	@echo "✅ 本地链接已移除，请手动添加 JSR 引用:"
	@echo '   "@oct-edge-fns/core": "jsr:@oct-edge-fns/core@^0.1"'
	@echo '   "@oct-edge-fns/core/": "jsr:@oct-edge-fns/core@^0.1/"'

# ============================================
# create-oct-edge-fns — npm CLI 脚手架发布
# ============================================
.PHONY: cli-pack
cli-pack:
	@echo "========================================"
	@echo "打包 create-oct-edge-fns v$(CLI_VERSION)"
	@echo "========================================"
	cd packages/create-oct-edge-fns && npm pack
	@echo "✅ 打包完成: packages/create-oct-edge-fns/create-oct-edge-fns-$(CLI_VERSION).tgz"

.PHONY: cli-publish
cli-publish:
	@echo "========================================"
	@echo "发布 create-oct-edge-fns v$(CLI_VERSION) 到 npm"
	@echo "========================================"
	cd packages/create-oct-edge-fns && npm publish --access public
	@echo ""
	@echo "✅ create-oct-edge-fns 发布完成"
	@echo "   用法:"
	@echo "     npx create-oct-edge-fns my-project"

.PHONY: cli-version
cli-version:
	@if [ -z "$(V)" ]; then echo "用法: make cli-version V=x.y.z"; exit 1; fi
	@echo "更新 create-oct-edge-fns 版本至 v$(V)..."
	sed -i 's/"version": "[0-9.]*"/"version": "$(V)"/' packages/create-oct-edge-fns/package.json
	git add packages/create-oct-edge-fns/package.json
	git tag -a "cli-v$(V)" -m "create-oct-edge-fns v$(V)"
	@echo "✅ 版本更新至 v$(V)，已创建 tag cli-v$(V)"
	@echo "推送: git push --tags"

# ============================================
# 全部发布
# ============================================
.PHONY: publish-all
publish-all: core-publish cli-publish
	@echo "========================================"
	@echo "全部发布完成!"
	@echo "  @oct-edge-fns/core v$(CORE_VERSION) -> JSR"
	@echo "  create-oct-edge-fns v$(CLI_VERSION) -> npm"
	@echo "========================================"
	@echo "用户快速开始:"
	@echo "  npx create-oct-edge-fns my-project"

# ============================================
# 查看容器状态
# ============================================
.PHONY: status
status:
	@echo "容器状态:"
	@docker ps --filter "name=oct-edge-functions" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "镜像列表:"
	@docker images --filter "reference=oct-edge-functions*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
