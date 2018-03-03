import { Bot } from 'botbuilder'; // so that we get BotContext

const returnsPromiseVoid: ReturnToParent<any> = () => Promise.resolve();

type ReturnToParent <Args> = (
    context: BotContext,
    args?: Args
) => Promise<void>;

export class Topic <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> {
    protected state = {} as State;
    protected returned;
    
    returnToParent: ReturnToParent<ReturnArgs> = () => {
        throw "You must call createTopicInstance";
    }

    async createTopicInstance (
        context: BotContext,
        returnToParent?: ReturnToParent<ReturnArgs>
    ): Promise<this>;

    async createTopicInstance (
        context: BotContext,
        args: InitArgs,
        returnToParent?: ReturnToParent<ReturnArgs>
    ): Promise<this>;

    async createTopicInstance (
        context: BotContext,
        ... params,
    ) {
        let args = {} as InitArgs;
        let returnToParent = returnsPromiseVoid;

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

    protected async init(
        context: BotContext,
        args?: InitArgs,
    ) {
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

    async onReceive (
        context: BotContext,
    ) {
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

    async next (
        context: BotContext,
    ) {
    }

    static rootTopic: Topic;

    static async do (
        context: BotContext,
        getRootTopic: () => Promise<Topic>
    ) {
        if (Topic.rootTopic)
            await Topic.rootTopic.onReceive(context);
        else
            Topic.rootTopic = await getRootTopic();
    }
}
