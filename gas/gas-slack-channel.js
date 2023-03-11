const SLACK_OAUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('SLACK_OAUTH_TOKEN');
const OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function doPost(e) {
  const eventData = JSON.parse(e.postData.contents);

  // Slack Webhook URL verification (Only for the first time)
  if (eventData.type === "url_verification") {
    const challenge = eventData.challenge;
    return ContentService.createTextOutput(challenge);
  }

  const { channel, ts, thread_ts, text, user, event_ts } = eventData.event;

  // Prevent infinite loop by bot
  if (eventData.event.bot_id) return;
  console.log(eventData.event);

  // Ignore retried events by Slack
  const cache = CacheService.getScriptCache()
  if (cache.get(event_ts)) return;
  cache.put(event_ts, true, 60 * 10);

  let context = !thread_ts ? [] : getContext(channel, thread_ts);
  console.log(context);
  context.push({"role": "user", "content": text});

  try {
    postMessage(getChatGptResponse(context).choices[0].message.content.trim(), channel, thread_ts || ts);
  } catch (e) {
    console.error(e);
    postMessage("error", channel, thread_ts || ts);
  }
}

function getContext(channel, thread_ts) {
  return getThreadMessages(channel, thread_ts).map(message => {
    return {
      "role": message.bot_id ? "assistant" : "user",
      "content": message.text
    }
  });
}

function getThreadMessages(channel, ts) {
  const payload = {
    token: SLACK_OAUTH_TOKEN,
    channel: channel,
    ts: ts
  };
  const options = {
    method: "get",
    payload: payload
  };
  const response = UrlFetchApp.fetch("https://slack.com/api/conversations.replies", options);
  const json = JSON.parse(response.getContentText());
  return json.ok ? json.messages : [];
}

function getChatGptResponse(messages) {
  const options = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + OPENAI_API_KEY
    },
    "payload": JSON.stringify({
      "model": "gpt-3.5-turbo",
      "messages": [
        ...messages
       ]
    }),
  };
  return JSON.parse(UrlFetchApp.fetch(OPENAI_API_URL, options).getContentText().replace(/^、/, "") );
}

function postMessage(text, channel, thread_ts) {
  const options = {
    method: "post",
    payload: {
      token: SLACK_OAUTH_TOKEN,
      channel: channel,
      thread_ts: thread_ts || "",
      text: text
    }
  };
  const response = UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", options);
  const json = JSON.parse(response.getContentText());
  if (!json.ok) console.error(json.error);
}
