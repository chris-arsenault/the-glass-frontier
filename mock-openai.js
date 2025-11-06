const http = require('http');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    const response = {
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Date.now() / 1000 | 0,
      model: 'gpt-4.1-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello from mock provider'
          },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
    };

    res.writeHead(200, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(response));
  });
});

const port = process.env.MOCK_OPENAI_PORT || 9999;
server.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', message: 'mock-openai.ready', port }));
});
