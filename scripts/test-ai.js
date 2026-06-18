async function test() {
  const apiKey = 'sk-cp-ozvAYSHH-wkDjYweOzqxuXA17Vy0m0iIvPttwAXl4-O0nZJ8gPbuibxLYhR49S6gD9Ol72dvZHzLIXsDxixfHXkQhHFCkg6fDLEzLXzR1A16c6DqnIoGejs';
  const baseUrl = 'https://api.minimaxi.com/anthropic';
  
  console.log('Testing Anthropic-compatible endpoint (MiniMax)...');
  try {
    const res = await fetch(baseUrl + '/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'abab6.5s',
        max_tokens: 100,
        messages: [{ role: 'user', content: '你好，用中文简单介绍一下你自己' }],
      }),
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.slice(0, 600));
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
