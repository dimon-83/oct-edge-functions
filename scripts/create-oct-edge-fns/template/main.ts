/**
 * oct-edge-fns 應用入口
 *
 * 啟動所有註冊的 cron 定時任務。
 */

import { startCrons } from "@oct/core";

await startCrons();

console.log("[app] All cron tasks started. Press Ctrl+C to exit.");
