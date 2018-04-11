import { Promiseable, Activity, BotContext, Storage, BotState } from 'botbuilder';
import { toPromise, returnsPromiseVoid, Telemetry, TelemetryAction } from './topical';

interface TopicInstance <State = any, Construct = any> {
    instanceName: string;
    topicName: string;
    construct: Construct,
    state: State;
}

interface Topical {
    instances: {
        [instanceName: string]: TopicInstance;
    },
    rootInstanceName: string;
}

export enum TopicReturn {
    noReturn,
    signalled,
    succeeded,
}

export interface Topicable <
    Init extends {} = {},
    State extends {} = {},
    Return extends {} = {},
    Construct extends {} = {},
    Context extends BotContext = BotContext, 
> {
    new (
        construct: Construct,
    ): Topic<Init, State, Return, Construct, Context>;
}

export abstract class Topic <
    Init extends {} = {},
    State extends {} = {},
    Return extends {} = {},
    Construct extends {} = {},
    Context extends BotContext = BotContext, 
> {
    static topics: {
        [name: string]: Topicable;
    } = {}

    static register(
        ... topics: Topicable[]
    ) {
        if (topics.length === 0) {
            if (this === Topic)
                throw "Topic cannot be registered."
            topics = [this as any as Topicable];
        }

        for (const topic of topics) {
            const name = topic.name;

            if (Topic.topics[name]) {
                throw `An attempt was made to register a topic with existing name "${name}".`;
            }

            Topic.topics[name] = topic;
        }
    }

    private static topicalState: BotState<Topical>;

    static init(
        storage: Storage,
    ) {
        Topic.topicalState = new BotState<Topical>(storage, context => `topical:${context.request.channelId}.${context.request.conversation.id}`);
    }

    // We can't just have this.state as a normal property because state is a pointer to a part of Topic.topicalState
    // If someone were to do this.state = { ... } and then they'd be replacing the pointer. Instead we use a getter/setter.
    // If someone does try to do this.state = { ... }, we delete all the old properties and replace them with the properties
    // from the new state. Messy, inefficient, works.

    private _state!: State;

    public get state () {
        return this._state;
    }

    public set state (
        state: State,
    ) {
        for (const key of Object.keys(this._state))
            delete this._state[key];

        Object.assign(this._state, state);
    }

    private return = TopicReturn.noReturn;
    public returnArgs?: Return;

    public context!: Context;
    public instanceName!: string;
    public parent?: Topic<any, any, any, any, Context>;

    constructor (
        construct: Construct,
    ) {
    }

    private static _new <
        T extends Topicable<any, State, any, Construct, Context>,
        State,
        Construct,
        Context extends BotContext,
    > (
        this: T,
        context: Context,
        instanceName: string,
        parent: Topic<any, any, any, any, Context> | undefined,
        state: State,
        construct: Construct,
    ) {
        const topic = new this(construct);

        topic.context = context;
        topic.instanceName = instanceName;
        topic.parent = parent;
        topic._state = state;

        return topic;
    }

    static async create <
        T extends Topicable<Init, State, any, Construct, Context>,
        Init,
        State,
        Construct,
        Context extends BotContext,
    > (
        this: T,
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        args?: Init,
        construct = {} as Construct,
    ) {
        let parent: Topic<any, any, any, any, Context> | undefined;
        let context: Context;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            parent = undefined;
            context = parentOrContext;
        }

        const instance: TopicInstance = {
            instanceName: `${this.name}(${Date.now().toString()}${Math.random().toString().substr(1)})`,
            topicName: this.name,
            construct,
            state: {},
        }

        Topic.topicalState.get(context)!.instances[instance.instanceName] = instance;

        const topic = (this as any)._new(context, instance.instanceName, parent, instance.state, construct);

        // await this.sendTelemetry(context, newInstance, 'init.begin');

        await topic.init(args);

        if (await topic.returnedToParent())
            return undefined;

        // await this.sendTelemetry(context, newInstance, 'init.end');

        return instance.instanceName;
    }

    private static load <C extends BotContext> (
        parentOrContext: Topic<any, any, any, any, C> | C,
        instance: TopicInstance,
    ) {
        let parent: Topic<any, any, any, any, C> | undefined;
        let context: C;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            parent = undefined;
            context = parentOrContext;
        }

        const T = Topic.topics[instance.topicName];
        return (T as any)._new(context, instance.instanceName, parent, instance.construct, instance.state);
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
        instanceName: string,
    ) {
        delete Topic.topicalState.get(context)!.instances[instanceName];
    }

    static rootInstanceName(
        context: BotContext,
    ) {
        return Topic.topicalState.get(context)!.rootInstanceName;
    }

    static async do <Context extends BotContext = BotContext> (
        context: Context,
        getRootInstanceName: () => Promise<string | undefined>,
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
                if (!instance)
                    throw "unexpected";

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
            if (!topical.rootInstanceName)
                throw "no topic instance returned";

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
        const instance = Topic.topicalState.get(context)!.instances[instanceName];

        if (!instance)
            throw `Unknown instance ${instanceName}`;

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
        instanceName: string | undefined,
    ) {
        if (!instanceName)
            return false;
    
        const instance = Topic.getInstanceFromName(this.context, instanceName);
        
        if (!instance)
            return false;

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
        child: Topic<any, any, any, any, Context>,
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

