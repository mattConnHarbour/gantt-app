# Gandalf Slack bot

Gandalf answers questions, reads the current Gantt chart, and adds custom tasks to the same backend as the chart. Send Gandalf a direct message, or mention Gandalf in a channel or in a thread, for example:

> @Gandalf Schedule the Acme export fix from December 1 to December 3.

In a thread, Gandalf uses the earlier thread messages to infer the customer and task. If a required detail is missing or ambiguous, it asks a question. For channel threads, reply in the same thread and @mention Gandalf again. In a direct message, reply normally without a mention. Gandalf reads up to 20 recent direct messages for context. A single specified date is used as both the start and end date. Relative dates use `GANDALF_TIMEZONE` (default `America/New_York`). The chart refreshes its data every 30 seconds.

## Set up

1. Deploy the updated `server` to the **same Railway service** used by the chart, and deploy the updated `client` to Cloudflare Pages. The current production client points to `https://linear-gantt-production.up.railway.app`. Confirm this is still the correct service before proceeding.
2. Create a Slack app named Gandalf in the intended workspace. Add a bot user and the bot token scopes `app_mentions:read`, `chat:write`, `im:history`, `channels:history`, and, if using private channels, `groups:history`. Enable Event Subscriptions and subscribe to the bot events `app_mention` and `message.im`. Enable the Messages tab and allow users to send messages in App Home. Install the app to the workspace and invite Gandalf to the channels where it should be used.
3. Set Railway environment variables `OPENAI_API_KEY`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, and `SLACK_TEAM_ID`. Get the signing secret from the app's Basic Information and bot token from OAuth & Permissions; use the workspace's team ID for `SLACK_TEAM_ID`. Set `OPENAI_MODEL` and `GANDALF_TIMEZONE` if the defaults are unsuitable. Do not commit credentials. Rotate any key shared in chat before using it.
4. Set the Slack Events Request URL to `https://linear-gantt-production.up.railway.app/api/slack/events` (or the actual backend URL). Slack validates the endpoint using a signed challenge, so deploy and set the signing secret first. Save the subscription and reinstall the app if Slack requests it.
5. Test in a channel with a task, customer and date, then test a thread with missing details. The bot posts its result in the thread and the chart should show the task after refresh.

Slack's thread access and rate limits depend on app distribution and token type. If `conversations.replies` fails for channel threads, provide `SLACK_HISTORY_TOKEN` as an authorized user token with `channels:history` and/or `groups:history`, and ensure that user can access the channels. Slack conversation text and current chart data are sent to OpenAI to answer requests; only use the bot in channels where that is appropriate. Only the thread up to the mention is read; a top-level mention uses its own message, not preceding channel history.

The existing storage is a local JSON file. Ensure the Railway service runs **one instance** and its existing data directory is on persistent storage, with backups, before relying on the chart. `GANTT_DATA_DIR` can select a mounted directory, but moving an existing chart requires migrating its `tickets.json` first. The write lock and Slack retry suppression are per process; asynchronous events can be lost if the process stops immediately after acknowledging them. A durable queue and shared transactional database are needed for stronger delivery guarantees or multiple instances.
