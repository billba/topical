import { Topic } from './topics';

export interface PromptState {
    name: string;
}

export interface PromptInitArgs {
    name: string;
    prompt: string;
}

export interface PromptCallbackArgs {
    name: string;
    value: string;
}

export class StringPrompt extends Topic<PromptState, PromptInitArgs, PromptCallbackArgs> {
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
                topic.complete({
                    name: topic.instance.state.name,
                    value: context.request.text
                })
            });   
    }
}
