import { Bot, Activity } from 'botbuilder'; // so that we get BotContext
import { returnsPromiseVoid } from './helpers';
import { Telemetry } from './topical';

export type TopicReturnToParent <Args> = (
    context: BotContext,
    args?: Args
) => Promise<void>;

export abstract class Topic <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> {
    public topicName = this.constructor.name;
    public instanceName = `${this.topicName}(${Date.now().toString()}${Math.random().toString().substr(1)})`;

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

            await this.sendTelemetry(context, 'onChildReturn.begin');
            await returnToParent(c, args);
            await this.sendTelemetry(context, 'onChildReturn.end');
        }

        await this.sendTelemetry(context, 'init.begin');

        await this.init(context, args);

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
        await topic.onReceive(context);
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

        await Topic.telemetry(context, {
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
