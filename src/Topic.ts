import { Bot } from 'botbuilder'; // so that we get BotContext
import { returnsPromiseVoid } from './helpers';

export type TopicReturnToParent <Args> = (
    context: BotContext,
    args?: Args
) => Promise<void>;

export abstract class Topic <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> {
    protected state = {} as State;
    protected returned;
    
    returnToParent: TopicReturnToParent<ReturnArgs> = () => {
        throw "You must call createTopicInstance";
    }

    async createInstance (
        context: BotContext,
        returnToParent?: TopicReturnToParent<ReturnArgs>
    ): Promise<this>;

    async createInstance (
        context: BotContext,
        args: InitArgs,
        returnToParent?: TopicReturnToParent<ReturnArgs>
    ): Promise<this>;

    async createInstance (
        context: BotContext,
        ... params,
    ) {
        let args = {} as InitArgs;
        let returnToParent: TopicReturnToParent<ReturnArgs> = returnsPromiseVoid;

        if (params.length > 0) {
            if (typeof params[0] === 'function') {
                returnToParent = params[0];
            } else {
                args = params[0];
                if (params.length > 1)
                    returnToParent = params[1];
            }
        }

        this.returned = false;

        this.returnToParent = async (c, args) => {
            if (this.returned)
                throw "This topic has already returned";
            this.returned = true;

            await returnToParent(c, args);
        }

        await this.init(context, args);

        return this.returned
            ? undefined
            : this;
    }

    async dispatch (
        context: BotContext,
        topic?: Topic,
    ): Promise<boolean> {
        if (!topic)
            return false;
    
        await topic.onReceive(context);
        return true;
    }

    async doNext (
        context: BotContext,
        topic: Topic,
    ): Promise<boolean> {
        if (!topic)
            return false;

        await topic.next(context);
        return false;
    }

    async init (
        context: BotContext,
        args?: InitArgs,
    ) {
    }

    async next (
        context: BotContext,
    ) {
    }

    async onReceive (
        context: BotContext,
    ) {
    }


    static rootTopic: Topic;

    static async do (
        context: BotContext,
        getRootTopic: () => Promise<Topic>
    ) {
        if (Topic.rootTopic)
            await Topic.rootTopic.dispatch(context, Topic.rootTopic);
        else
            Topic.rootTopic = await getRootTopic();
    }

    async listChildren(
        context: BotContext,
    ) {
        return [];
    }
}
