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
  const dayDiff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1;

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
    { label: ":small_blue_diamond: AI Agent Creation in Studio – Enable Citizen Developers to build & deploy AIAgents seamlessly.", date: new Date(2025, 1, 19), emoji: "🎥" },
    { label: ":small_blue_diamond: Preview AIAgent Chatbot – Powered by GenCXA Workflow-based Orchestration (current chatbot).", date: new Date(2025, 1, 20), emoji: "🎥" },
    { label: ":small_blue_diamond: NextGen AIAgent – MAS-powered orchestration with AXA Declaration-driven agent behavior. ", date: new Date(2025, 1, 20), emoji: "🎥" },
    { label: ":small_blue_diamond: Studio-Integrated NextGen AIAgent", note: "Supports dynamic custom task injection, enabling adaptive decision-making and multi-agent collaboration, making orchestration more intelligent and autonomous than the current AI Agent.", date: new Date(2025, 1, 25), emoji: "🎥" },
    { label: "Official Demo at SKO", date: new Date(2025, 2, 4), emoji: "🤖" },
  ];

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📅 Deadlines: Because Time Travel Isn’t Real (Yet)",
      },
    },
    { type: "divider" },
  ];

  importantDates.forEach(({ label, note, date, emoji }) => {
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
        text: `${label}`,
      },
      },
      ...(note ? [{
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_${note}_`,
      },
      }] : []),
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
  
  blocks.push(
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":white_check_mark: Focus: Elevating AI Agents from static workflow execution to context-aware, modular, and scalable MAS-based orchestration",
      },
    }
  );

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

async function sendReleaseStandupReminderInternal(
  slackClient: WebClient,
  channelId: string,
): Promise<void> {

  const podLead = await findSlackUserIdByEmail(
    slackClient,
    "kamaljit.lall@ushur.com"
  );
  const podLeadSlack = `<@${podLead}>`;

  const podLead2 = await findSlackUserIdByEmail(
    slackClient,
    "__nishad.singh@ushur.com",
  );
  const podLead2Slack = `<@${podLead2}>`;
  
  const podLead3 = await findSlackUserIdByEmail(
    slackClient,
    "aravindh.dorappa@ushur.com",
  );
  const podLead3Slack = `<@${podLead3}>`;

  const releaseManager = await findSlackUserIdByEmail(
    slackClient,
    "amrita.basu@ushur.com"
  );
  const releaseManagerSlack = `<@${releaseManager}>`;


  const bigRockCategories = [
    {
      title: "Waiting",
      description: "Check if you're waiting on input, deliverables, or approvals from others or any other teams.",
      emoji: "⏳",
    },
    {
      title: "Are We On Track?",
      description: `
Assess timelines:
- Are we on track based on the calendar?
- Are there any shifts in deadlines that need attention?
      `,
      emoji: "📅",
    },
    {
      title: "Blockers",
      description: `
Identify blockers:
- *Technical blockers*: Are there unresolved technical challenges?
- *Resource blockers*: Are we missing key resources or personnel?
      `,
      emoji: "🚧",
    },
  ];

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🔔 Release Standup Reminder: Please provide an update `,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Hi ${podLeadSlack} and ${podLead2Slack} and ${podLead3Slack}, please provide an update to ${releaseManagerSlack} on any categories below. She is representing the R2D2 pod in the twice weekly release standup and the next standup is the next business day.`
      },
    },
  ];

  bigRockCategories.forEach(({ title, description, emoji }) => {
    blocks.push(
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} ${title}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: description,
        },
      },
    );
  });

  // Add an actionable note at the end
  blocks.push(
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Action Required*\nPlease add a note as a thread for this slack and tag ${releaseManagerSlack}`,
      },
    },
  );

  const message = {
    channel: channelId,
    blocks,
  };

  try {
    await slackClient.chat.postMessage(message);
  } catch (error: unknown) {
    logger.error(
      `Error sending Big Rocks reminder: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function sendReleaseStandupReminder(
  jiraProcessor: JiraProcessor,
  slackClient: WebClient,
  openAIApiKey: string,
): Promise<void> {
  try {
    await sendReleaseStandupReminderInternal(slackClient, SLACK_CHANNEL);
  } catch (e) {
    logger.error(e);
  }
}


async function findSlackUserIdByEmail(
  slackClient: WebClient,
  email: string,
): Promise<string> {
  try {
    const response = await slackClient.users.lookupByEmail({ email });
    if (response.ok && response.user?.id) {
      return response.user.id;
    }
    logger.error(
      `Error finding Slack user by email ${email}: ${response.error || "Unknown error"}`,
    );
    return "";
  } catch (error: unknown) {
    logger.error(
      "Error fetching Slack user by email:",
      error instanceof Error ? error.message : String(error),
    );
    return "";
  }
}

async function sendWeeklyStatusReminderInternal(
  slackClient: WebClient,
  channelId: string,
): Promise<void> {

  const podLead = await findSlackUserIdByEmail(
    slackClient,
    "kamaljit.lall@ushur.com"
  );
  const podLeadSlack = `<@${podLead}>`;

  const podLead2 = await findSlackUserIdByEmail(
    slackClient,
    "__nishad.singh@ushur.com",
  );
  const podLead2Slack = `<@${podLead2}>`;
  
  const podLead3 = await findSlackUserIdByEmail(
    slackClient,
    "aravindh.dorappa@ushur.com",
  );
  const podLead3Slack = `<@${podLead3}>`;

  const presenter = await findSlackUserIdByEmail(
    slackClient,
    "sreekanth.sastry@ushur.com"
  );
  const presenterSlack = `<@${presenter}>`;


  const podCalendarSchedule = 'https://docs.google.com/spreadsheets/d/1iV9VCNFPIVtf8-s9RyKvuKjM_9_hoTfLIVCQr0lA090/edit?gid=1778640682#gid=1778640682';
  const podStatusSheet = 'https://docs.google.com/spreadsheets/d/1Q8_pBEOsbIkdeh7W9mOxC_Mibkpfrxet7jhDfZNdIHQ/edit?gid=726637808#gid=726637808';

  const podReleaseSheet = "https://docs.google.com/spreadsheets/d/1Pvj9wLnWcijQurttBL-w5Nhgee8cxPxxS9PAsPw7NYA/edit?gid=1778640682#gid=1778640682";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📊 Weekly Status Reminder!",
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `
Hi ${podLeadSlack} and ${podLead2Slack} and ${podLead3Slack}! Please take a few moments to update the status for the week - ${presenterSlack} will present this info in the next status meeting on Monday.

        `,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `
  ✅ *Action Required*: Please update the <${podCalendarSchedule}|POD Sprint Calendar Schedule> before EOD.
        `,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `
  ✅ *Action Required*: Please update the <${podStatusSheet}|POD Status Sheet> before EOD.
        `,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `
  ✅ *Action Required*: Update the Engineering Weekly Status slides before the EOD for the template that Marina will post in the #enggdashboard slack channel 
        `,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `
  ✅ *Action Required*: Keep the <${podReleaseSheet}|POD Releases> up to date before the EOD.
        `,
      },
    },
  ];

  const message = {
    channel: channelId,
    blocks,
  };

  try {
    await slackClient.chat.postMessage(message);
  } catch (error: unknown) {
    logger.error(
      `Error sending weekly status reminder: ${error instanceof Error ? error.message : String(error)}`,
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

async function sendWeeklyStatusReminder(
  jiraProcessor: JiraProcessor,
  slackClient: WebClient,
  openAIApiKey: string,
): Promise<void> {
  try {
    await sendWeeklyStatusReminderInternal(slackClient, SLACK_CHANNEL);
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

  // Schedule for 12:00 PM (noon) in Santa Clara (PST/PDT), Wednesday and Friday
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  cron.schedule("0 12 * * 3,5", async () => {
    logger.info("Running task for Santa Clara...");
    await sendReleaseStandupReminder(jiraProcessor, slackClient, openAIApiKey);
  });

  // Schedule for 10:00 AM (morning) in Santa Clara (PST/PDT), every Friday
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  cron.schedule("0 10 * * 5", async () => {
    logger.info("Sending weekly status update reminder for Santa Clara...");
    await sendWeeklyStatusReminder(jiraProcessor, slackClient, openAIApiKey);
  });

  if (process.env.NODE_ENV === "development") {
    await performOperations(jiraProcessor, slackClient, openAIApiKey);
    // await sendReleaseStandupReminder(jiraProcessor, slackClient, openAIApiKey);
    // await sendWeeklyStatusReminder(jiraProcessor, slackClient, openAIApiKey);
  }
}

main().catch(logger.error);
