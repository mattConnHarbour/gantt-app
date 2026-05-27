import { LinearClient } from '@linear/sdk';
import 'dotenv/config';

const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });

async function exploreSchema() {
  // Try to get an issue and explore all its properties
  const me = await client.viewer;
  const issues = await me.assignedIssues({ first: 1 });
  
  if (issues.nodes.length > 0) {
    const issue = issues.nodes[0];
    console.log('Issue identifier:', issue.identifier);
    console.log('\nAvailable properties on issue object:');
    
    // Log all enumerable properties
    const props = Object.getOwnPropertyNames(Object.getPrototypeOf(issue));
    console.log(props.filter(p => !p.startsWith('_')).sort().join('\n'));
  }
}

exploreSchema().catch(console.error);
