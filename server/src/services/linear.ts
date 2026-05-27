import { LinearClient } from '@linear/sdk';
import { GraphQLClient, gql } from 'graphql-request';
import type { LinearTicket } from '../types.js';

let linearClient: LinearClient | null = null;
let gqlClient: GraphQLClient | null = null;

const LINEAR_API_URL = 'https://api.linear.app/graphql';

function getClient(): LinearClient {
  if (!linearClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY environment variable is required');
    }
    linearClient = new LinearClient({ apiKey });
  }
  return linearClient;
}

function getGQLClient(): GraphQLClient {
  if (!gqlClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY environment variable is required');
    }
    gqlClient = new GraphQLClient(LINEAR_API_URL, {
      headers: {
        Authorization: apiKey,
      },
    });
  }
  return gqlClient;
}

interface CustomerNeedsResponse {
  issues: {
    nodes: Array<{
      id: string;
      needs: {
        nodes: Array<{
          customer: {
            name: string;
          };
        }>;
      };
    }>;
  };
}

const CUSTOMER_NEEDS_QUERY = gql`
  query {
    issues(first: 200, filter: { customerCount: { gt: 0 } }) {
      nodes {
        id
        needs {
          nodes {
            customer {
              name
            }
          }
        }
      }
    }
  }
`;

async function fetchCustomerMap(): Promise<Map<string, string>> {
  const client = getGQLClient();
  const customerMap = new Map<string, string>();

  const result = await client.request<CustomerNeedsResponse>(CUSTOMER_NEEDS_QUERY);

  for (const issue of result.issues.nodes) {
    if (issue.needs.nodes.length > 0 && issue.needs.nodes[0].customer) {
      customerMap.set(issue.id, issue.needs.nodes[0].customer.name);
    }
  }

  return customerMap;
}

export async function fetchTicketsByAssignee(assigneeName: string): Promise<LinearTicket[]> {
  const client = getClient();

  // Get current user's assigned issues that are not done
  const me = await client.viewer;
  const issues = await me.assignedIssues({
    filter: {
      state: {
        type: { nin: ['completed', 'canceled'] },
      },
    },
    first: 200,
  });

  // Fetch customer map using GraphQL
  const customerMap = await fetchCustomerMap();

  const result: LinearTicket[] = [];
  const seen = new Set<string>();

  for (const issue of issues.nodes) {
    // Only include IT tickets
    if (!issue.identifier.startsWith('IT-')) continue;

    // Skip duplicates
    if (seen.has(issue.identifier)) continue;
    seen.add(issue.identifier);

    const state = await issue.state;
    const labels = await issue.labels();
    const labelNames = labels.nodes.map(l => l.name);

    // Get customer from the pre-fetched map
    const customer = customerMap.get(issue.id);

    result.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      url: issue.url,
      state: { name: state?.name || 'Unknown' },
      labels: labelNames,
      customer,
    });
  }

  return result;
}

export async function fetchTicketByIdentifier(identifier: string): Promise<LinearTicket | null> {
  const client = getClient();

  const issue = await client.issue(identifier);

  if (!issue) {
    return null;
  }

  const state = await issue.state;
  const assignee = await issue.assignee;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? undefined,
    url: issue.url,
    state: { name: state?.name || 'Unknown' },
    assignee: assignee ? { name: assignee.name } : undefined,
  };
}

export async function fetchMyTickets(): Promise<LinearTicket[]> {
  // Just use the same logic as fetchTicketsByAssignee
  return fetchTicketsByAssignee('');
}
