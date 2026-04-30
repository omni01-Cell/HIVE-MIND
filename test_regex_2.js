const text = `
Here is my code:
\`\`\`javascript
const meteo = await get_weather({ city: 'Paris' });
return { paris: meteo };
\`\`\`
`;

const pattern = /(?:print\()?([a-zA-Z0-9_]+)\(([\s\S]*?)\)|<function>([a-zA-Z0-9_]+)<\/function>|<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\4>|```(?:javascript|js)\s*\n([\s\S]*?)```/g;

let match;
while ((match = pattern.exec(text)) !== null) {
  console.log("Match:", match[0]);
  console.log("Group 6:", match[6]);
}
