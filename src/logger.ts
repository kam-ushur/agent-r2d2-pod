import type { Logger } from "winston";
import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const logger: Logger = createLogger({
  level: "info", // Default logging level
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf((info) => {
      const timestamp = info.timestamp ? String(info.timestamp) : "N/A";
      const level = info.level ? String(info.level).toUpperCase() : "INFO";
      const message =
        typeof info.message === "string"
          ? info.message
          : JSON.stringify(info.message) || "No message provided";

      return `[${timestamp}] ${level}: ${message}`;
    }),
  ),
  transports: [
    new transports.Console(), // Logs to the console
    // Info and general logs
    new DailyRotateFile({
      filename: "logs/info-%DATE%.log", // Include %DATE% in the filename
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      level: "info",
    }),

    // Error logs
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      level: "error",
    }),
  ],
});

export default logger;
