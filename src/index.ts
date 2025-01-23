import { WebClient } from "@slack/web-api";
import type { Application } from "express";
import express from "express";
import JiraApi from "jira-client";
import cron from "node-cron";
import Holidays from "date-holidays";

import { getCredentials } from "./credentials.js";
import JiraProcessor from "./jira.js";
import logger from "./logger.js";

const PORT = 50052;
let SLACK_CHANNEL = "C03V9AM9Y4C"; // #kam-slack-testing by default
if (process.env.NODE_ENV === "production") {
  logger.info("Running in production mode");
  // r2d2 pod channel
  SLACK_CHANNEL = "C0856K5G2BB";
}

// Initialize holiday instances for US and Bangalore (India, Karnataka)
const hdUS = new Holidays("US");
const hdIN = new Holidays("IN", "KA"); // 'KA' for Karnataka, Bangalore

function calculateDaysLeft(targetDate: Date): {
  businessDaysWithHolidays: number;
  businessDaysWithoutHolidays: number;
  totalDays: number;
  holidayDetails: { date: string; name: string; type: string }[];
} {
  const today = new Date();
  const dayDiff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let businessDaysWithHolidays = 0;
  let businessDaysWithoutHolidays = 0;
  const holidayDetails: { date: string; name: string; type: string }[] = [];

  for (let i = 0; i <= dayDiff; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const dayOfWeek = day.getDay();

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Weekend: Sunday (0), Saturday (6)
    const isUSHoliday = hdUS.isHoliday(day);
    const usHolidays = !isUSHoliday ? [] : isUSHoliday;
    const holidayUS = usHolidays?.filter((h) =>
      ["public"].includes(h.type)
    ); // Filter for business-impacting holidays
    const isINHoliday = hdIN.isHoliday(day);
    const inHolidays = !isINHoliday ? [] : isINHoliday;
    const holidayIN = inHolidays.filter((h) =>
      ["public"].includes(h.type)
    ); // Same for Bangalore holidays

    // Collect details for business holidays
    if (holidayUS?.length) {
      holidayUS.forEach((h) => {
        holidayDetails.push({
          date: day.toISOString().split("T")[0], // YYYY-MM-DD
          name: h.name,
          type: h.type,
        });
      });
    }
    if (holidayIN?.length) {
      holidayIN.forEach((h) => {
        holidayDetails.push({
          date: day.toISOString().split("T")[0], // YYYY-MM-DD
          name: h.name,
          type: h.type,
        });
      });
    }

    if (!isWeekend) {
      // Business days including holidays
      businessDaysWithHolidays++;

      // Business days excluding holidays
      if (!(holidayUS?.length || holidayIN?.length)) {
        businessDaysWithoutHolidays++;
      }
    }
  }

  return {
    businessDaysWithHolidays,
    businessDaysWithoutHolidays,
    totalDays: dayDiff,
    holidayDetails,
  };
}

async function sendImportantDates(
  slackClient: WebClient,
  channelId: string,
): Promise<void> {
  const importantDates = [
    { label: "Studio Agent UI MVP - Internal Demo", date: new Date(2025, 0, 31), emoji: "🛠️" },
    { label: "Studio Agent End to End MVP Demo at SKO", date: new Date(2025, 2, 4), emoji: "🎥" },
    { label: "Multi-Agent IEHP Demo at SKO", date: new Date(2025, 2, 4), emoji: "🤖" },
  ];

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📅 Deadlines: Because Time Travel Isn’t Real (Yet)",
      },
    },
    { type: "divider" }, // A divider for separation
  ];

  importantDates.forEach(({ label, date, emoji }) => {
    const {
      businessDaysWithHolidays,
      businessDaysWithoutHolidays,
      totalDays,
      holidayDetails,
    } = calculateDaysLeft(date);

    // Format holiday details
    const holidayText = holidayDetails.length
      ? `*Business holidays to consider during this period:*\n${holidayDetails
          .map((h) => `- ${h.date}: ${h.name} (${h.type})`)
          .join("\n")}`
      : "No business holidays during this period.";

    blocks.push(
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} ${label}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `
*Date:* ${date.toDateString()}
- *${businessDaysWithHolidays} business days left* (including business holidays)
- *${businessDaysWithoutHolidays} business days left* (excluding business holidays)
- *${totalDays} total days left*

${holidayText}
          `,
        },
      },
      { type: "divider" } // Divider between each important date
    );
  });

  // Add a note for team members to indicate holidays/illness days off
  blocks.push(
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🚨 *Note*\nIf you have planned holidays or expect to take any days off due to illness, please let the team know so we can plan accordingly. 🙏",
      },
    }
  );

  const message = {
    channel: channelId,
    blocks,
  };

  try {
    await slackClient.chat.postMessage(message);
  } catch (error: unknown) {
    logger.error(
      `Error sending message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function performOperations(
  jiraProcessor: JiraProcessor,
  slackClient: WebClient,
  openAIApiKey: string,
): Promise<void> {
  try {
    await sendImportantDates(slackClient, SLACK_CHANNEL);
  } catch (e) {
    logger.error(e);
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const app: Application = express();
  const { jiraCredentials, slackAPIKey, openAIApiKey } = await getCredentials();

  const slackClient = new WebClient(slackAPIKey);
  const jira = new JiraApi(jiraCredentials);
  const jiraProcessor = new JiraProcessor(jira);

  app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
  });

  /* 
  Scheduling info:

  1.	Cron Syntax Breakdown:
    •	0 17 * * 1-5:
    •	Minute: 0
    •	Hour: 17 (5:00 PM UTC = 9:00 AM PST)
    •	Day of Month: * (Any day)
    •	Month: * (Any month)
    •	Day of Week: 1-5 (Monday to Friday)
    •	Similarly, 30 3 * * 1-5 ensures 9:00 AM IST only on business days.
	2.	Limiting to Business Days:
    •	The 1-5 in the day of the week field ensures the task runs only from Monday (1) to Friday (5).
	3.	No Weekend Execution:
    •	Cron expressions automatically exclude weekends due to the 1-5 configuration.
  */

  // Schedule for 9:00 AM in Santa Clara (PST/PDT), Monday to Friday
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  cron.schedule("0 17 * * 1-5", async () => {
    logger.info("Running task for Santa Clara...");
    await performOperations(jiraProcessor, slackClient, openAIApiKey);
  });

  if (process.env.NODE_ENV === "development") {
    await performOperations(jiraProcessor, slackClient, openAIApiKey);
  }
}

main().catch(logger.error);
