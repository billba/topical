import { Bot } from 'botbuilder'; // so that we get BotContext

const returnsPromiseVoid = () => Promise.resolve();

export abstract class Topic <
    State extends {} = {},
> {
    protected state = {} as State;

    constructor (
        protected returnToParent: (
            context: BotContext,
            args?: any
        ) => Promise<void> = returnsPromiseVoid
    ) {
    }

    async init(
        context: BotContext,
        args?: any,
    ) {
    }

    async onReceive (
        context: BotContext,
    ) {
    }

    protected async next (
        context: BotContext,
    ) {
    }

    private static rootTopic: Topic;

    static async do (
        context: BotContext,
        getRootTopic: () => Promise<Topic>
    ) {
        if (!Topic.rootTopic)
            Topic.rootTopic = await getRootTopic();
        
        await Topic.rootTopic.onReceive(context);
    }
}

