async function test() {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) throw new Error('Set MINIMAX_API_KEY before running this manual test.');
  const baseUrl = 'https://api.minimaxi.com/anthropic';
  
  console.log('Testing Anthropic-compatible endpoint (MiniMax)...');
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
}
module.exports = { test };
if (require.main === module) test().catch((error) => {
  console.error('MiniMax test failed:', error.message);
  process.exitCode = 1;
});
