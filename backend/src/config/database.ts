import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../common/logger";

export function buildMongoUri(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const credentials = env.dbUser ? `${encodeURIComponent(env.dbUser)}:${encodeURIComponent(env.dbPassword)}@` : "";
  return `mongodb://${credentials}${env.dbHost}:${env.dbPort}/${env.dbName}?authSource=admin`;
}

export async function connectDatabase(): Promise<void> {
  const uri = buildMongoUri();
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info(`MongoDB connected: ${env.dbHost}:${env.dbPort}/${env.dbName}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
