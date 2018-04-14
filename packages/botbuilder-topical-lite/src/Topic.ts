import { Bot, Activity } from 'botbuilder'; // so that we get BotContext
import { returnsPromiseVoid, Telemetry } from './topical';

export type TopicReturnToParent <Args> = (
    context: BotContext,
    args?: Args
) => Promise<void>;


export interface Topicable <
    Begin extends {} = {},
    State extends {} = {},
    Return extends {} = {},
    Context extends BotContext = BotContext, 
> {
    new (
    ): Topic<Begin, State, Return, Context>;
}

export abstract class Topic <
    Begin extends {} = {},
    State extends {} = {},
    Return extends {} = {},
    Context extends BotContext = BotContext,
> {
    public topicName = this.constructor.name;
    public instanceName = `${this.topicName}(${Date.now().toString()}${Math.random().toString().substr(1)})`;

    protected state = {} as State;
    private returned;
    
    returnToParent: TopicReturnToParent<Return> = () => {
        throw "You must call createTopicInstance";
    }

    async createInstance (
        context: BotContext,
        returnToParent?: TopicReturnToParent<Return>
    ): Promise<this>;

    async createInstance (
        context: BotContext,
        args: Begin,
        returnToParent?: TopicReturnToParent<Return>
    ): Promise<this>;

    async createInstance (
        context: BotContext,
        ... params,
    ) {
        let args = {} as Begin;
        let returnToParent: TopicReturnToParent<Return> = returnsPromiseVoid;

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

            // await this.sendTelemetry(context, 'onChildReturn.begin');
            await returnToParent(c, args);
            // await this.sendTelemetry(context, 'onChildReturn.end');
        }

        await this.sendTelemetry(context, 'init.begin');

        await this.onBegin(context, args);

        await this.sendTelemetry(context, 'init.end');

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
        
        await this.sendTelemetry(context, 'onReceive.begin');
        await topic.onTurn(context);
        await this.sendTelemetry(context, 'onReceive.begin');

        return true;
    }

    async doNext (
        context: BotContext,
        topic: Topic,
    ): Promise<boolean> {
        if (!topic)
            return false;

        await this.sendTelemetry(context, 'next.begin');
        await topic.next(context);
        await this.sendTelemetry(context, 'next.end');

        return false;
    }

    async onBegin (
        context: BotContext,
        args?: Begin,
    ) {
    }

    async onTurn (
        context: BotContext,
    ) {
    }

    static rootTopic: Topic;

    static async do<
        T extends Topicable<Begin, any, any, any, Context>,
    > (
        context: BotContext,
        Root: T,
    ) {
        if (Topic.rootTopic) {
            await Topic.rootTopic.dispatch(context, Topic.rootTopic);
            await Topic.rootTopic.sendTelemetry(context, 'endOfTurn');
         } else {
            Topic.rootTopic = await getRootTopic();
            await Topic.rootTopic.sendTelemetry(context, 'assignRootTopic');
        }
    }

    listChildren(
    ): Topic[] {
        return [];
    }

    static telemetry: Telemetry;

    private async sendTelemetry (
        context: BotContext,
        type: string,
    ) {
        if (!Topic.telemetry)
            return;

        await Topic.telemetry({
            type,
            activity: context.request as Activity,
            instance: {
                instanceName: this.instanceName,
                topicName: this.topicName,
                children: this.listChildren().map(topic => topic.instanceName),
            },
        });
    }
}
