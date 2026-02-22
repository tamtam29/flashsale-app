import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Worker");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log", "debug"],
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.log("SIGTERM received, shutting down gracefully...");
    void app.close();
  });

  process.on("SIGINT", () => {
    logger.log("SIGINT received, shutting down gracefully...");
    void app.close();
  });

  logger.log("🔧 Worker Service started ");
}

void bootstrap();
