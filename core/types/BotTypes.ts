export interface MessageData {
    chatId: string;
    sender: string;
    senderName?: string;
    text: string;
    isGroup: boolean;
    mediaType?: string;
    quotedMsg?: any;
    hasImage?: boolean;
    image?: any;
    useNativeAudio?: boolean;
    audioBuffer?: Buffer;
    raw?: any;
    id?: string;
}

export interface BotEvent {
    type: 'message' | 'scheduled' | 'proactive' | 'group_event';
    chatId?: string;
    data: MessageData | any;
    priority?: number;
}

export interface ContextData {
    systemPrompt: string;
    messages: any[];
    refusalPrompt?: string;
}

export interface ToolCall {
    name: string;
    args: Record<string, any>;
}

export interface ActionRecord {
    id: string;
    task: string;
    status: 'pending' | 'completed' | 'failed';
    step?: number;
    total_steps?: number;
}
