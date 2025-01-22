// eslint-disable-next-line import/no-extraneous-dependencies
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import type { JiraApiOptions } from "jira-client";

import logger from "./logger.js";

async function getJiraCredentials(
  secretManager: SecretsManagerClient,
): Promise<string> {
  const secretName = "dev/kam/jira/credentials";

  const response = await secretManager.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    }),
  );

  return response.SecretString || "";
}

async function getSlackCredentials(
  secretManager: SecretsManagerClient,
): Promise<string> {
  const secretName = "dev/kam/slack/credentials";

  const response = await secretManager.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    }),
  );

  return response.SecretString || "";
}

async function getOpenAIApiKey(
  secretManager: SecretsManagerClient,
): Promise<string> {
  const secretName = "dev/kam/oai";

  const response = await secretManager.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    }),
  );

  return response.SecretString || "";
}

// eslint-disable-next-line import/prefer-default-export
export async function getCredentials(): Promise<{
  jiraCredentials: JiraApiOptions;
  openAIApiKey: string;
  slackAPIKey: string;
}> {
  let jiraCredentials: JiraApiOptions;
  let openAIApiKey: string;
  let slackAPIKey: string;

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    logger.info("Running in development mode");
    if (!process.env.OPENAI_APIKEY) {
      logger.info("process.env.OPENAI_APIKEY is not set");
      process.exit(1);
    }
    if (!process.env.JIRA_USERNAME || !process.env.JIRA_PASSWORD) {
      logger.info(
        "process.env.JIRA_USERNAME or process.env.JIRA_PASSWORSD is not set",
      );
      process.exit(1);
    }
    if (!process.env.SLACK_APIKEY) {
      logger.info("process.env.SLACK_APIKEY is not set");
      process.exit(1);
    }
    openAIApiKey = process.env.OPENAI_APIKEY;
    jiraCredentials = {
      protocol: "https",
      host: "ushur.atlassian.net",
      username: process.env.JIRA_USERNAME,
      password: process.env.JIRA_PASSWORD,
      apiVersion: "2",
      strictSSL: true,
    };
    slackAPIKey = process.env.SLACK_APIKEY;
  } else {
    // eslint-disable-next-line no-console
    logger.info("Running in production mode");
    const awsSecretManager = new SecretsManagerClient({
      region: "us-west-2",
    });
    const openAICredentials = await getOpenAIApiKey(awsSecretManager);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    openAIApiKey = JSON.parse(openAICredentials).oai;
    const jiraCredentialsString = await getJiraCredentials(awsSecretManager);
    jiraCredentials = JSON.parse(jiraCredentialsString) as JiraApiOptions;
    const slackCredentials = await getSlackCredentials(awsSecretManager);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    slackAPIKey = JSON.parse(slackCredentials).apikey;
  }

  return { jiraCredentials, openAIApiKey, slackAPIKey };
}
