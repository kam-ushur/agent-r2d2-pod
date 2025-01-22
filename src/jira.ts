/* eslint-disable no-restricted-syntax */
import type { JsonResponse } from "jira-client";
import type JiraApi from "jira-client";

import logger from "./logger.js";

export type RawJiraTicketData = {
  key: string;
  customfield_10152: string;
  fields: {
    summary: string;
    issuetype: {
      name: string;
    };
    status: {
      name: string;
    };
    assignee: {
      displayName: string;
    };
    priority: {
      name: string;
    };
    fixVersions: string[];
    description: string;
    [key: string]: unknown;
  };
};

export type UserStory = {
  key: string;
  summary: string;
  acceptanceCriteria: string;
  description: string;
};

export const jiraCustomFieldMapping: Record<string, string> = {
  customfield_11454: "design",
  customfield_11425: "comments",
  customfield_10024: "storyPoints",
  customfield_10144: "severity",
  customfield_10232: "podTeam",
  customfield_10152: "acceptanceCriteria",
};

class JiraProcessor {
  jira: JiraApi;

  constructor(jira: JiraApi) {
    this.jira = jira;
  }

  getIssueCount = async (jql: string): Promise<number> => {
    try {
      const result = await this.jira.searchJira(jql, {
        fields: [], // Exclude unnecessary fields
        maxResults: 0, // Fetch no issues, just metadata
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result.total;
    } catch (error) {
      logger.error("Error fetching issue count:", error);
      throw error;
    }
  };

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getAll = async (
    query: string,
    startAt: number = 0,
    maxResults: number = 100,
    fields = [
      "key",
      "summary",
      "issuetype",
      "status",
      "priority",
      "assignee",
      "assigneeid",
      "parent",
      "description",
      "fixVersions",
      ...Object.keys(jiraCustomFieldMapping),
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> => {
    try {
      const result: JsonResponse = await this.jira.searchJira(query, {
        startAt,
        maxResults,
        fields,
      });

      const { issues } = result;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logger.info(`Fetched ${issues.length} issues from startAt ${startAt}`);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (issues.length) {
        // Fetch remaining issues recursively and merge
        const remainingIssues = await this.getAll(query, startAt + maxResults);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment
        return [...issues, ...remainingIssues];
      }

      // No more issues; return accumulated list
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return issues;
    } catch (err) {
      logger.error(err);
      return [];
    }
  };

  async getIssue(issueKey: string): Promise<UserStory> {
    const jiraIssue = await this.jira.getIssue(issueKey, [
      "key",
      "summary",
      "issuetype",
      "status",
      "priority",
      "assignee",
      "description",
      "fixVersions",
      ...Object.keys(jiraCustomFieldMapping),
    ]);
    const remappedIssue = [jiraIssue].map((issue: JsonResponse) => {
      const issueData = issue as RawJiraTicketData;
      const remappedFields: UserStory = {} as UserStory;

      // Map standard fields
      remappedFields.key = issueData.key;
      remappedFields.summary = issueData.fields.summary;
      remappedFields.description = issueData.fields.description || "";
      remappedFields.acceptanceCriteria =
        (issueData.fields.customfield_10152 as string) || "";

      return remappedFields;
    })?.[0];

    return remappedIssue;
  }

  async addCommentToIssue(issueKey: string, comment: string): Promise<void> {
    await this.jira.addComment(issueKey, comment);
  }
}

export default JiraProcessor;
