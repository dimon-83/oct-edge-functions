IMAGE_NAME = example
IMAGE_TAG ?= latest

.PHONY: help
help:
	@echo "用法: make [目标]"
	@echo ""
	@echo "Docker 目标:"
	@echo "  make build      构建镜像"
	@echo "  make up         启动服务"
	@echo "  make down       停止服务"
	@echo "  make logs       查看日志"
	@echo "  make clean      清理容器和镜像"
	@echo "  make status     查看容器状态"
	@echo ""
	@echo "Deno 目标:"
	@echo "  make dev        本地开发启动 (deno run --watch)"
	@echo "  make test       运行所有测试"
	@echo "  make lint       代码检查"
	@echo "  make fmt        格式化代码"

.PHONY: build
build:
	docker compose build

.PHONY: up
up:
	docker compose up -d

.PHONY: down
down:
	docker compose down

.PHONY: logs
logs:
	docker compose logs -f

.PHONY: clean
clean:
	docker compose down --rmi all --volumes --remove-orphans 2>/dev/null || true
	docker rmi $(IMAGE_NAME):$(IMAGE_TAG) 2>/dev/null || true

.PHONY: status
status:
	docker ps --filter "name=example" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

.PHONY: dev
dev:
	deno run --watch --allow-net --allow-env --allow-read --allow-write main.ts

.PHONY: test
test:
	deno test --allow-all

.PHONY: lint
lint:
	deno lint

.PHONY: fmt
fmt:
	deno fmt
