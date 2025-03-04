import { Client } from "@notionhq/client";
import * as dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const LOG_FILE_PATH = process.env.LATEST_LOG_PATH;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_SESSIONS_DB_ID = process.env.NOTION_SESSIONS_DB_ID;

if (!LOG_FILE_PATH || !NOTION_API_KEY || !NOTION_SESSIONS_DB_ID) {
  console.error("❌ 必要な環境変数が設定されていません。");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

const getFormattedDate = (time: string): string => {
  const now = new Date();
  const [hour, minute, second] = time.split(":").map(Number);
  now.setHours(hour, minute, second);
  return now.toISOString();
};

const processLogLine = async (line: string): Promise<void> => {
  const joinMatch = line.match(/\[(.*?)\] \[.*\]: (.*?) joined the game/);
  const leftMatch = line.match(/\[(.*?)\] \[.*\]: (.*?) left the game/);

  if (joinMatch) {
    const [, timestamp, player] = joinMatch;
    await saveEventToNotion(player, "join", getFormattedDate(timestamp));
  }

  if (leftMatch) {
    const [, timestamp, player] = leftMatch;
    await saveEventToNotion(player, "left", getFormattedDate(timestamp));
  }
};

const saveEventToNotion = async (player: string, eventType: string, timestamp: string): Promise<void> => {
  try {
    await notion.pages.create({
      parent: { database_id: NOTION_SESSIONS_DB_ID },
      properties: {
        Name: { title: [{ text: { content: player } }] },
        Event: { select: { name: eventType } },
        Timestamp: { date: { start: timestamp } },
      },
    });
    console.log(`✅ ${player} ${eventType} event saved to Notion.`);
  } catch (error) {
    console.error("❌ Error saving to Notion:", error);
  }
};

const watchLogFile = () => {
  console.log(`📖 Watching log file: ${LOG_FILE_PATH} using tail -F`);

  const tail = spawn("tail", ["-F", LOG_FILE_PATH]);

  tail.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line: string) => {
      if (line.trim() !== "") {
        processLogLine(line);
      }
    });
  });

  tail.stderr.on("data", (data) => {
    console.error(`❌ tail error: ${data.toString()}`);
  });

  tail.on("close", (code) => {
    console.error(`❌ tail process exited with code ${code}, restarting...`);
    setTimeout(watchLogFile, 5000);
  });
};

watchLogFile();
