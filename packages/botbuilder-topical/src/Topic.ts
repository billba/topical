import { Promiseable, Activity, BotContext, ConversationState, Storage } from 'botbuilder';
import { toPromise, returnsPromiseVoid, Telemetry, TelemetryAction } from './topical';

interface TopicalConversationState {
    instances: {
        [instanceName: string]: TopicInstance;
    }
    rootInstanceName: string;
}

export enum TopicReturn {
    signalled,
    succeeded,
}

export class TopicInstance <State = any, ReturnArgs = any> {
    public name: string;
    public state = {} as State;
    public return: TopicReturn;
    public returnArgs: ReturnArgs;

    constructor(
        public topicName: string,
        public parentInstanceName?: string,
    ) {
        this.name = `${topicName}(${Date.now().toString()}${Math.random().toString().substr(1)})`;
    }
}

export type TopicOnChildReturnHandler <State, ReturnArgs, ChildReturnArgs> = (
    context: BotContext,
    instance: TopicInstance<State, ReturnArgs>,
    childInstance: TopicInstance<undefined, ChildReturnArgs>,
) => Promise<void>;

export abstract class Topic <
    InitArgs extends {} = {},
    State extends {} = {},
    ReturnArgs extends {} = {},
> {
    private static topicClasses: {
        [name: string]: Topic;
    } = {};

    private static conversationState: ConversationState<TopicalConversationState>;

    static init(
        storage: Storage,
    ) {
        Topic.conversationState = new ConversationState<TopicalConversationState>(storage);
    }

    constructor (
        public name?: string,
    ) {
        this.name = this.constructor.name + (name ? '.' + name : '');

        if (Topic.topicClasses[this.name]) {
            throw new Error(`An attempt was made to create a topic with existing name "${this.name}".`);
        }

        Topic.topicClasses[this.name] = this;
    }

    returnToParent(
        instance: TopicInstance<State>,
        args?: ReturnArgs,
    ) {
        if (instance.return)
            throw "already returned";
        instance.return = TopicReturn.signalled;
        instance.returnArgs = args;
    }

    async createInstance (
        context: BotContext,
        parentInstance?: TopicInstance,
        args?: InitArgs,
    ) {
        const newInstance = new TopicInstance(this.name, parentInstance && parentInstance.name);

        await this.sendTelemetry(context, newInstance, 'init.begin');

        Topic.conversationState.get(context).instances[newInstance.name] = newInstance;

        await toPromise(this.init(context, newInstance, args));

        if (await this.returnedToParent(context, newInstance))
            return undefined;

        await this.sendTelemetry(context, newInstance, 'init.end');

        return newInstance.name;
    }

    static deleteInstance (
        context: BotContext,
        instance: TopicInstance,
    );

    static deleteInstance (
        context: BotContext,
        instanceName: string,
    );

    static deleteInstance (
        context: BotContext,
        arg: TopicInstance | string,
    ) {
        delete Topic.conversationState.get(context).instances[typeof arg === 'string'
            ? arg
            : arg.name
        ];
    }

    static rootInstanceName(
        context: BotContext,
    ) {
        return Topic.conversationState.get(context).rootInstanceName;
    }

    static async do (
        context: BotContext,
        getRootInstanceName: () => Promise<string>,
    ) {
        if (!Topic.conversationState)
            throw "You must call Topic.init before calling Topic.do";

        const topical = await Topic.conversationState.read(context) as TopicalConversationState | Partial<TopicalConversationState>;

        if (topical.rootInstanceName) {
            const rootInstanceName = topical.rootInstanceName;
            const instance = Topic.getInstanceFromName(context, rootInstanceName);
            const topic = Topic.getTopicFromInstance(instance);

            await topic.dispatch(context, instance);

            // garbage collect orphaned instances

            const orphans = { ... topical.instances };

            const deorphanize = (instanceName: string) => {
                const instance = orphans[instanceName];
                const topic = Topic.getTopicFromInstance(instance);

                delete orphans[instanceName];
        
                for (let child of topic.listChildren(context, instance))
                    deorphanize(child);
            }
        
            deorphanize(rootInstanceName);

            for (let orphan of Object.keys(orphans)) {
                console.warn(`Garbage collecting instance ${orphan} -- you should have called Topic.deleteInstance()`)
                Topic.deleteInstance(context, orphan);
            }

            await topic.sendTelemetry(context, instance, 'endOfTurn');
        } else {
            topical.instances = {};
            topical.rootInstanceName = await getRootInstanceName();

            const instance = Topic.getInstanceFromName(context, topical.rootInstanceName);
            const topic = Topic.getTopicFromInstance(instance);
            await topic.sendTelemetry(context, instance, 'assignRootTopic');
        }

        await Topic.conversationState.write(context);
    }

    private static getInstanceFromName (
        context: BotContext,
        instanceName: string,
    ) {
        const instance = Topic.conversationState.get(context).instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        return instance;
    }

    private static getTopicFromInstance (
        instance: TopicInstance,
    ) {
        const topic = Topic.topicClasses[instance.topicName];
        
        if (!topic) {
            console.warn(`Unknown topic ${instance.topicName}`);
            return;
        }

        return topic;
    }

    async doNext (
        context: BotContext,
        instance: TopicInstance,
    ): Promise<boolean>;

    async doNext (
        context: BotContext,
        instanceName: string,
    ): Promise<boolean>;

    async doNext (
        context: BotContext,
        arg: TopicInstance | string,
    ) {
        if (!arg)
            return false;
    
        const instance = typeof arg === 'string'
            ? Topic.getInstanceFromName(context, arg)
            : arg;

        const topic = Topic.getTopicFromInstance(instance);

        await topic.sendTelemetry(context, instance, 'next.begin');
        await topic.next(context, instance);
        await this.returnedToParent(context, instance);
        await topic.sendTelemetry(context, instance, 'next.end');

        return true;
    }

    async dispatch (
        context: BotContext,
        instance: TopicInstance,
    ): Promise<boolean>;

    async dispatch (
        context: BotContext,
        instanceName: string,
    ): Promise<boolean>;

    async dispatch (
        context: BotContext,
        arg: TopicInstance | string,
    ) {
        if (!arg)
            return false;
    
        const instance = typeof arg === 'string'
            ? Topic.getInstanceFromName(context, arg)
            : arg;

        const topic = Topic.getTopicFromInstance(instance);

        await topic.sendTelemetry(context, instance, 'onReceive.begin');
        await topic.onReceive(context, instance);
        await this.returnedToParent(context, instance);
        await topic.sendTelemetry(context, instance, 'onReceive.end');
        
        return true;
    }

    private async returnedToParent (
        context: BotContext,
        instance: TopicInstance<any>,
    ): Promise<boolean> {
        if (instance.return !== TopicReturn.signalled || !instance.parentInstanceName)
            return false;

        const topic = Topic.getTopicFromInstance(instance);

        const parentInstance = Topic.getInstanceFromName(context, instance.parentInstanceName);
        const parentTopic = Topic.getTopicFromInstance(parentInstance);

        Topic.deleteInstance(context, instance);
        instance.return = TopicReturn.succeeded;

        const handler = parentTopic._onChildReturnHandlers[instance.topicName];
        if (!handler)
            throw `No onChildReturn() for topic ${instance.topicName}`;

        await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.begin');

        await handler(context, parentInstance, instance);
        await parentTopic._afterChildReturn(context, parentInstance, instance);
        await parentTopic.returnedToParent(context, parentInstance);

        await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.end');

        return true;
    }

    async init (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>,
        args?: InitArgs,
    ) {
    }

    async next (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>,
    ) {
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>,
    ) {
    }

    private _onChildReturnHandlers: {
        [topicName: string]: TopicOnChildReturnHandler<any, any, any>;
    } = {};
    
    protected onChildReturn <ChildReturnArgs> (
        topic: Topic<any, any, ChildReturnArgs>,
        handler: TopicOnChildReturnHandler<State, ReturnArgs, ChildReturnArgs> = returnsPromiseVoid
    ) {
        if (this._onChildReturnHandlers[topic.name])
            throw new Error(`An attempt was made to call onChildReturn for topic ${topic.name}. This topic is already handled.`);

        this._onChildReturnHandlers[topic.name] = handler;

        return this;
    }

    private _afterChildReturn: TopicOnChildReturnHandler<any, any, any> = returnsPromiseVoid;

    protected afterChildReturn <ChildReturnArgs> (
        handler: TopicOnChildReturnHandler<State, ReturnArgs, any> = returnsPromiseVoid
    ) {
        this._afterChildReturn = handler;
    }

    static telemetry: Telemetry;

    private async sendTelemetry (
        context: BotContext,
        instance: TopicInstance,
        type: string,
    ) {
        if (!Topic.telemetry)
            return;

        await Topic.telemetry({
            type,
            activity: context.request as Activity,
            instance: {
                instanceName: instance.name,
                topicName: this.name,
                children: this.listChildren(context, instance),
            },
        });
    }

    listChildren (
        context: BotContext,
        instance: TopicInstance<State, ReturnArgs>
    ): string[] {
        return [];
    }
}
