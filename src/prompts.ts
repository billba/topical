import { TopicClass } from './topical';

export interface PromptState {
    name?: string;
}

export interface PromptInitArgs {
    name?: string;
    prompt: string;
}

export interface PromptReturnArgs {
    name?: string;
    value: string;
}

export class StringPrompt extends TopicClass<PromptInitArgs, PromptState, PromptReturnArgs> {
    constructor(
        name: string,
    ) {
        super(name);

        this
            .init((context, topic) => {
                topic.instance.state.name = topic.args.name;
                context.reply(topic.args.prompt);
            })
            .onReceive((context, topic) => {
                topic.returnToParent({
                    name: topic.instance.state.name,
                    value: context.request.text
                })
            });   
    }
}
