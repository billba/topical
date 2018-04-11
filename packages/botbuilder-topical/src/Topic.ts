import { Promiseable, Activity, BotContext, Storage, BotState } from 'botbuilder';
import { toPromise, returnsPromiseVoid, Telemetry, TelemetryAction } from './topical';

interface TopicInstance <State = any> {
    instanceName: string;
    topicName: string;
    state: State;
}

interface Topical {
    instances: {
        [instanceName: string]: TopicInstance;
    },
    rootInstanceName: string;
}

export enum TopicReturn {
    signalled,
    succeeded,
}

interface Topicable <
    Init extends {} = {},
    State extends {} = {},
    Return extends {} = {},
    Context extends BotContext = BotContext, 
> {
    new(
        context: Context,
        instanceName: string,
        parent: Topic<any, any, any, Context>,
        state: State,
    ): Topic<Init, State, Return, Context>;

    register(... Topics: Topicable[]);
}

export abstract class Topic <
    Init extends {} = {},
    State extends {} = {},
    Return extends {} = {},
    Context extends BotContext = BotContext, 
> {
    static topics: {
        [name: string]: Topicable;
    }

    static register(
        this: Topicable,
        ... topics: Topicable[]
    ) {
        if (topics.length === 0)
            topics = [this];

        for (const topic of topics) {
            const name = topic.constructor.name;

            if (Topic.topics[name]) {
                throw `An attempt was made to register a topic with existing name "${name}".`;
            }

            Topic.topics[name] = topic;
        }
    }

    static topicalState: BotState<Topical>;

    static init(
        storage: Storage,
    ) {
        Topic.topicalState = new BotState<Topical>(storage, context => `topical:${context.request.channelId}.${context.request.conversation.id}`);
    }

    private _state: State;

    private return: TopicReturn;
    public returnArgs: Return;

    constructor (
        public context: Context,
        public instanceName: string,
        public parent: Topic<any, any, any, Context>,
        state: State,
    ) {
        this._state = state;
    }

    static async create <
        T extends Topicable<I, S, R, C>,
        I, S, R, C extends BotContext
    > (
        this: T,
        parentOrContext: Topic<any, any, any, C> | C,
        args?: I 
    ) {
        let parent: Topic<any, any, any, C>;
        let context: C;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            context = parentOrContext;
        }

        const instance: TopicInstance = {
            instanceName: `${this.constructor.name}(${Date.now().toString()}${Math.random().toString().substr(1)})`,
            topicName: this.constructor.name,
            state: {},
        }

        Topic.topicalState.get(context).instances[instance.instanceName] = instance;

        const topic = new this(context, instance.instanceName, parent, instance.state);

        // await this.sendTelemetry(context, newInstance, 'init.begin');

        await topic.init(args);

        if (await topic.returnedToParent())
            return undefined;

        // await this.sendTelemetry(context, newInstance, 'init.end');

        return instance.instanceName;
    }

    static load <C extends BotContext> (
        parentOrContext: Topic<any, any, any, C> | C,
        instance: TopicInstance,
    ) {
        let parent: Topic<any, any, any, C>;
        let context: C;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            context = parentOrContext;
        }

        const t = Topic.topics[instance.topicName];
        return new t(context, instance.instanceName, parent, instance.state);
    }

    public get state () {
        return this._state;
    }

    public set state (
        state: State,
    ) {
        for (let key of Object.keys(this._state))
            delete this._state[key];

        Object.assign(this._state, state);
    }

    returnToParent(
        args?: Return,
    ) {
        if (this.return)
            throw "already returned";
        this.return = TopicReturn.signalled;
        this.returnArgs = args;
    }

    static deleteInstance (
        context: BotContext,
        instance: TopicInstance | string,
    ) {
        delete Topic.topicalState.get(context).instances[typeof instance === 'string'
            ? instance
            : instance.instanceName
        ];
    }

    static rootInstanceName(
        context: BotContext,
    ) {
        return Topic.topicalState.get(context).rootInstanceName;
    }

    static async do <Context extends BotContext = BotContext> (
        context: Context,
        getRootInstanceName: () => Promise<string>,
    ) {
        if (!Topic.topicalState)
            throw "You must call Topic.init before calling Topic.do";

        const topical = await Topic.topicalState.read(context) as Topical | Partial<Topical>;

        if (topical.rootInstanceName) {
            const rootInstanceName = topical.rootInstanceName;
            const instance = Topic.getInstanceFromName(context, rootInstanceName);
            const topic = Topic.load(context, instance);

            await topic.dispatchTo(rootInstanceName);

            // garbage collect orphaned instances

            const orphans = { ... topical.instances };

            const deorphanize = (instanceName: string) => {
                const instance = orphans[instanceName];
                const topic = Topic.load(context, instance);

                delete orphans[instanceName];
        
                for (let child of topic.listChildren())
                    deorphanize(child);
            }

            deorphanize(rootInstanceName);

            for (const orphan of Object.keys(orphans)) {
                console.warn(`Garbage collecting instance ${orphan} -- you should have called Topic.deleteInstance()`)
                Topic.deleteInstance(context, orphan);
            }

            // await topic.sendTelemetry(context, instance, 'endOfTurn');
        } else {
            topical.instances = {};
            topical.rootInstanceName = await getRootInstanceName();

            const instance = Topic.getInstanceFromName(context, topical.rootInstanceName);
            const topic = Topic.load(context, instance);
            // await topic.sendTelemetry(context, instance, 'assignRootTopic');
        }

        await Topic.topicalState.write(context);
    }

    private static getInstanceFromName (
        context: BotContext,
        instanceName: string,
    ) {
        const instance = Topic.topicalState.get(context).instances[instanceName];

        if (!instance) {
            console.warn(`Unknown instance ${instanceName}`);
            return;
        }

        return instance;
    }

    // async doNext (
    //     context: Context,
    //     instance: TopicInstance,
    // ): Promise<boolean>;

    // async doNext (
    //     context: Context,
    //     instanceName: string,
    // ): Promise<boolean>;

    // async doNext (
    //     context: Context,
    //     arg: TopicInstance | string,
    // ) {
    //     if (!arg)
    //         return false;
    
    //     const instance = typeof arg === 'string'
    //         ? Topic.getInstanceFromName(context, arg)
    //         : arg;

    //     const topic = Topic.getTopicFromInstance(instance);

    //     await topic.sendTelemetry(context, instance, 'next.begin');
    //     await topic.next(context, instance);
    //     await this.returnedToParent(context, instance);
    //     await topic.sendTelemetry(context, instance, 'next.end');

    //     return true;
    // }

    async dispatchTo (
        instance: TopicInstance | string,
    ) {
        if (!instance)
            return false;
    
        if (typeof instance === 'string')
            instance = Topic.getInstanceFromName(this.context, instance);

        const topic = Topic.load(this, instance);

        // await topic.sendTelemetry(context, instance, 'onReceive.begin');
        await topic.onTurn();
        await this.returnedToParent();
        // await topic.sendTelemetry(context, instance, 'onReceive.end');
        
        return true;
    }

    private async returnedToParent (): Promise<boolean> {
        if (this.return !== TopicReturn.signalled)
            return false;
        
        if (!this.parent)
            throw `orphan ${this.instanceName} attempted to returnToParent()`;

        Topic.deleteInstance(this.context, this.instanceName);
        this.return = TopicReturn.succeeded;

        // await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.begin');

        await this.parent.onChildReturn(this);
        await this.parent.returnedToParent();

        // await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.end');

        return true;
    }

    async init (
        args?: Init,
    ) {
    }

    // async next (
    //     context: Context,
    //     instance: TopicInstance<State, Return>,
    // ) {
    // }

    async onTurn () {
    }

    async onChildReturn(
        child: Topic<any, any, any, Context>,
    ) {
    }

    // private _onChildReturnHandlers: {
    //     [topicName: string]: TopicOnChildReturnHandler<any, any, any, Context>;
    // } = {};
    
    // protected onChildReturn <ChildReturnArgs> (
    //     topic: Topic<any, any, ChildReturnArgs>,
    //     handler: TopicOnChildReturnHandler<State, Return, ChildReturnArgs, Context> = returnsPromiseVoid
    // ) {
    //     if (this._onChildReturnHandlers[topic.name])
    //         throw new Error(`An attempt was made to call onChildReturn for topic ${topic.name}. This topic is already handled.`);

    //     this._onChildReturnHandlers[topic.name] = handler;

    //     return this;
    // }

    // private _afterChildReturn: TopicOnChildReturnHandler<any, any, any, Context> = returnsPromiseVoid;

    // protected afterChildReturn <ChildReturnArgs> (
    //     handler: TopicOnChildReturnHandler<State, Return, any, Context> = returnsPromiseVoid
    // ) {
    //     this._afterChildReturn = handler;
    // }

    // static telemetry: Telemetry;

    // private async sendTelemetry (
    //     context: Context,
    //     instance: TopicInstance,
    //     type: string,
    // ) {
    //     if (!Topic.telemetry)
    //         return;

    //     await Topic.telemetry({
    //         type,
    //         activity: context.request as Activity,
    //         instance: {
    //             instanceName: instance.instanceName,
    //             topicName: this.name,
    //             children: this.listChildren(context, instance),
    //         },
    //     });
    // }

    listChildren (): string[] {
        return [];
    }
}
