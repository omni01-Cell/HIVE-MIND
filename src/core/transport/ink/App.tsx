import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface Message {
    id: string;
    sender: 'user' | 'agent';
    text: string;
    isTransient?: boolean;
}

interface AppProps {
    onMessage: (text: string) => void;
    messages: Message[];
}

export const App: React.FC<AppProps> = ({ onMessage, messages }) => {
    const [input, setInput] = useState('');

    const handleSubmit = () => {
        if (!input.trim()) return;
        const text = input;
        setInput('');
        onMessage(text);
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Box flexDirection="column" marginBottom={1}>
                {messages.map((msg) => (
                    <Box key={msg.id} flexDirection="row">
                        <Text color={msg.sender === 'user' ? 'blue' : 'green'} bold>
                            {msg.sender === 'user' ? 'YOU > ' : 'HIVE-MIND > '}
                        </Text>
                        <Text>{msg.text}</Text>
                    </Box>
                ))}
            </Box>
            
            <Box>
                <Text color="cyan" bold>
                    YOU {'>'}{' '}
                </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                />
            </Box>
        </Box>
    );
};
