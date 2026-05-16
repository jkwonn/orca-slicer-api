import express from "express";
import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import cors from "cors";
import { errorHandler } from "./middleware/error";
import { loadEnv, getPort } from "./core/env";
import health from "./routes/health/route";
import profiles from "./routes/profiles/route";
import asyncSlicing from "./routes/slicing/async.route";
import slicing from "./routes/slicing/route";
import tools from "./routes/tools/route";
import presets from "./routes/presets/route";

/** Build the Express application with every route mounted. */
export const configureApp = (): Express => {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGINS ?? "*", // if not set, allow all origins
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: [
        "Content-Disposition",
        "ETag",
        "Last-Modified",
        "Content-Length",
        "X-Filament-Used-G",
        "X-Filament-Used-Mm",
        "X-Print-Time-Seconds",
        "X-Layer-Count",
      ],
    })
  );

  app.use(express.json());

  app.use("/health", health);
  app.use("/profiles", profiles);
  app.use("/presets", presets);
  app.use("/slice", slicing);
  app.use("/slice-async", asyncSlicing);
  app.use("/tools", tools);

  app.use(errorHandler);

  return app;
};

/**
 * Start the HTTP server. Used by `src/index.ts` as a standalone process and by
 * the CLI's `serve` command.
 */
export async function startServer(port = getPort()): Promise<void> {
  const app = configureApp();

  if (process.env.NODE_ENV !== "production") {
    try {
      const swaggerDocument = await import("../swagger.json", {
        with: { type: "json" },
      });
      app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerDocument.default)
      );
    } catch (err) {
      console.error("Failed to load swagger.json:", err);
    }
  }

  app.listen(port, () => {
    console.log(`OrcaSlicer API listening on port ${port}`);
  });
}

// Auto-start only when executed directly (not when imported by tests/CLI).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  loadEnv();
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
