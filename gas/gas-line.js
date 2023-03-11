const CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('CHANNEL_ACCESS_TOKEN');
const OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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
        {"role": "system", "content": "あなたはLINEのチャットボットです。特にこの後指示がない限りカジュアルに回答してください。"},
        ...messages
       ]
    }),
  };
  return JSON.parse(UrlFetchApp.fetch(OPENAI_API_URL, options).getContentText());
}

function reply(replyToken, message) {
  const options = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN
    },
    "payload": JSON.stringify({
      "replyToken": replyToken,
      "messages": [{
        "type": "text",
        "text": message,
        "quickReply": {
          "items": [
            { "type": "action", "action": { "type": "message", "label": "続きは？", "text": "続きは？" } },
            { "type": "action", "action": { "type": "message", "label": "もっと詳しく", "text": "もっと詳しく" } },
            { "type": "action", "action": { "type": "message", "label": "new", "text": "new" } },
          ]
        }
      }]
    }),
  };
  UrlFetchApp.fetch(`https://api.line.me/v2/bot/message/reply`, options);
}

function doPost(e) {
  const event = JSON.parse(e.postData.contents).events[0];
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const lastUserMessage = event.message.text;

  if (lastUserMessage === undefined) return;  // If not text message, do nothing

  const cache = CacheService.getUserCache();
  const cacheKey = `chat:${userId}`;

  if (lastUserMessage === "new") {
    cache.put(cacheKey, null, 60 * 60 * 24);
    reply(replyToken, "新しい会話を始めます");
  } else {

    const cacheData = cache.get(cacheKey);
    let context = (cacheData !== null && cacheData !== "") ? JSON.parse(cacheData) : [];
    context.push({"role": "user", "content": lastUserMessage});
    try {
      const response = getChatGptResponse(context);
      context.push(response.choices[0].message);
      cache.put(cacheKey, JSON.stringify(context), 60 * 60 * 24);
      reply(replyToken, response.choices[0].message.content.trim());
    } catch (e) {
      console.log(e);
      reply(replyToken, e);
    }

  }

  return ContentService.createTextOutput(JSON.stringify({"content": "200"})).setMimeType(ContentService.MimeType.JSON);
}
