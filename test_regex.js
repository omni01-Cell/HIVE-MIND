const text = `
Here is my code:
\`\`\`javascript
const meteo = await get_weather({ city: 'Paris' });
return { paris: meteo };
\`\`\`
`;

const pattern = /(?:print\()?sys_interaction\.\)?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<tool_call>\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*<\/tool_call>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\6>|```(?:javascript|js)\s*\n([\s\S]*?)```/g;

let match;
while ((match = pattern.exec(text)) !== null) {
  console.log("Match:", match[0]);
  console.log("Group 8:", match[8]);
}
