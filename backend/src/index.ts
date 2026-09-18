import { app } from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./config/database";
import { logger } from "./common/logger";
import { seedBookingData } from "./modules/booking/seed";

async function bootstrap() {
  await connectDatabase();
  await seedBookingData();
  app.listen(env.port, "0.0.0.0", () => {
    logger.info(`API listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
