/**
 * 本地无 Docker 体验入口：启动内存版 MongoDB（真实 mongod 进程）后启动后端。
 * 数据在进程存活期间持久，页面刷新可回读；进程退出后数据清空。
 *
 * 运行：npm run dev:local
 */
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.DATABASE_URL = mongod.getUri("lpboardgame_local");
  console.log(`[lpboardgame] in-memory MongoDB ready at ${process.env.DATABASE_URL}`);
  await import("../src/index");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
