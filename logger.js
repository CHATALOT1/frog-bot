const { maxSavedLogs } = require("./config.json");

const { createLogger, format, transports, addColors, debug } = require("winston");
const { combine, colorize, timestamp, padLevels, printf } = format;
const { readdirSync, mkdirSync, rmSync } = require("fs");

let oldLogsDeleted = 0; // Used for logging the number of deleted logs (meta, i know)

function prepareLogDir(dirName) {
  let files = [];
  try {
    files = readdirSync(dirName).filter((fileName) => fileName.endsWith(".log"));
  } catch (err) {
    // If no such file or directory, make it and return
    if (err.code === "ENOENT") {
      mkdirSync(dirName);
      return;
    }
    throw err;
  }

  // If there is a latest.log, remove it to be replaced by new logger.
  const latestLogIndex = files.indexOf("latest.log");
  if (latestLogIndex > -1) {
    files.splice(latestLogIndex, 1);
    rmSync(`${dirName}/latest.log`);
  }

  // Remove excess logs
  if (maxSavedLogs > 0 && files.length >= maxSavedLogs) {
    let fileNamesTimestamps = new Map();
    for (const fileName of files) {
      const fileDate = new Date(
        fileName.slice(0, fileName.length - 4).replace(/-(?!.*T)/g, ":")
      );
      if (isNaN(fileDate)) continue; // If couldn't convert to date, ignore the file
      fileNamesTimestamps.set(fileDate.getTime(), fileName);
    }
    while (files.length >= maxSavedLogs) {
      const smallestTimestamp = Math.min(...fileNamesTimestamps.keys());
      const fileToDelete = fileNamesTimestamps.get(smallestTimestamp);

      rmSync(`${dirName}/${fileToDelete}`);
      files.splice(files.indexOf(fileToDelete), 1);
      fileNamesTimestamps.delete(smallestTimestamp);

      oldLogsDeleted++;
    }
  }
}

prepareLogDir("./log");
if (process.env.NODE_ENV !== "production") prepareLogDir("./log/debug");

const loggerLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  },
  colors: {
    error: "bold red",
    warn: "bold yellow",
    info: "cyan",
    debug: "green",
  },
};
addColors(loggerLevels.colors);

const customPrintf = printf(
  (info) => `${info.timestamp} - ${info.level}:    ${info.message}`
);
const upperCaseLevel = format((info) => {
  info.level = info.level.toUpperCase();
  return info;
})();
const fileFormat = combine(upperCaseLevel, timestamp(), padLevels(), customPrintf);
const consoleFormat = combine(
  upperCaseLevel,
  colorize(),
  timestamp(),
  padLevels(),
  customPrintf
);

// const fileTransportConfig = { level: "info", format: fileFormat }
const consoleTransport = new transports.Console({
  level: "info",
  format: consoleFormat,
});

const now = new Date().toISOString().replace(/:/g, "-");
const logger = createLogger({
  level: "debug",
  levels: loggerLevels.levels,
  transports: [
    new transports.File({
      filename: "./log/latest.log",
      level: "info",
      format: fileFormat,
    }),
    new transports.File({
      filename: `./log/${now}.log`,
      level: "info",
      format: fileFormat,
    }),
    consoleTransport,
  ],
});
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.File({
      filename: "./log/debug/latest.log",
      level: "debug",
      format: fileFormat,
    })
  );
  logger.add(
    new transports.File({
      filename: `./log/debug/${now}.log`,
      level: "debug",
      format: fileFormat,
    })
  );
  consoleTransport.level = "debug";
}

logger.debug(`Deleted ${oldLogsDeleted} logs as part of cleanup`);

module.exports = logger;
