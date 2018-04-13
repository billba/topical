import { Promiseable, Activity, BotContext, Storage, BotState } from 'botbuilder';
import { toPromise, returnsPromiseVoid, Telemetry, TelemetryAction } from './topical';

interface TopicInstance <State = any, Constructor = any> {
    instanceName: string;
    topicName: string;
    constructorArgs: Constructor,
    state: State;
}

interface Topical {
    instances: {
        [instanceName: string]: TopicInstance;
    },
    rootInstanceName: string;
}

enum TopicReturnStatus {
    noReturn,
    signalled,
    succeeded,
}

export interface Topicable <
    Begin = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends BotContext = BotContext, 
> {
    new (
        args: Constructor,
    ): Topic<Begin, State, Return, Constructor, Context>;
}

export interface TopicInitOptions {
    telemetry: Telemetry;
}

export abstract class Topic <
    Begin = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends BotContext = BotContext, 
> {
    private static topicalState: BotState<Topical>;

    private static telemetry: Telemetry;

    public static init(
        storage: Storage,
        options?: TopicInitOptions,
    ) {
        if (Topic.topicalState)
            throw "you should only call Topic.init once.";
        Topic.topicalState = new BotState<Topical>(storage, context => `topical:${context.request.channelId}.${context.request.conversation.id}`);
        if (options) {
            if (options.telemetry)
                Topic.telemetry = options.telemetry;
        }
    }

    private static topics: {
        [name: string]: Topicable;
    } = {}

    protected static subtopics = [] as Topicable[];

    // it's really easy to forget the "static" on subtopics -- this helps avoid errors
    public set subtopics(subtopics: never) {
        throw "subtopics need to be set as a static";
    }

    protected static register() {
        for (const T of this.subtopics) {
            (T as any).register();
        }

        if (this === Topic)
            return;

        const T = Topic.topics[this.name];

        if (T && T !== this as any)
            throw `A different topic with name ${T.name} has already been registered.`

        Topic.topics[this.name] = this as any;
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

    private returnStatus = TopicReturnStatus.noReturn;
    public return?: Return;

    public context!: Context;
    public instanceName!: string;
    public parent?: Topic<any, any, any, any, Context>;

    constructor (
        args: Constructor,
    ) {
    }

    private static _new <
        T extends Topicable<any, State, any, Constructor, Context>,
        State,
        Constructor,
        Context extends BotContext,
    > (
        this: T,
        context: Context,
        parent: Topic<any, any, any, any, Context> | undefined,
        instance: TopicInstance<State, Constructor>,
    ) {
        const topic = new this(instance.constructorArgs);

        topic.context = context;
        topic.parent = parent;
        topic.instanceName = instance.instanceName;
        topic._state = instance.state;

        return topic;
    }

    protected static async create <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
        Context extends BotContext,
    > (
        this: T,
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
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
            constructorArgs,
            state: {},
        }

        Topic.topicalState.get(context)!.instances[instance.instanceName] = instance;

        const topic: Topic<Begin, any, any, Constructor, Context> = (this as any)._new(context, parent, instance);

        // await this.sendTelemetry(context, newInstance, 'init.begin');

        await topic.onBegin(beginArgs);

        if (await topic.returnedToParent())
            return undefined;

        // await this.sendTelemetry(context, newInstance, 'init.end');

        return instance.instanceName;
    }

    private static load <Context extends BotContext> (
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        instance: TopicInstance,
    ): Topic<any, any, any, any, Context> {

        const T = Topic.topics[instance.topicName];
        if (!T)
            throw `An attempt was made to load unregistered topic ${instance.topicName}.`

        let parent: Topic<any, any, any, any, Context> | undefined;
        let context: Context;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            parent = undefined;
            context = parentOrContext;
        }

        return (T as any)._new(context, parent, instance);
    }

    public returnToParent(
        args?: Return,
    ) {
        if (this.returnStatus != TopicReturnStatus.noReturn)
            throw "already returned";

        this.returnStatus = TopicReturnStatus.signalled;
        this.return = args;
    }

    protected static deleteInstance (
        context: BotContext,
        instanceName: string,
    ) {
        delete Topic.topicalState.get(context)!.instances[instanceName];
    }

    protected static rootInstanceName(
        context: BotContext,
    ) {
        return Topic.topicalState.get(context)!.rootInstanceName;
    }

    public static async do <
        T extends Topicable<Begin, any, any, any, Context>,
        Begin,
        Context extends BotContext = BotContext
    > (
        this: T,
        context: Context,
        args?: Begin,
    ) {
        if (this === Topic as any)
            throw "You can only `do' a child of Topic.";

        if (!Topic.topicalState)
            throw "You must call Topic.init before calling YourTopic.do";

        if (!Topic.topics[this.name])
            (this as any).register();

        const topical = await Topic.topicalState.read(context) as Topical | Partial<Topical>;

        if (topical.rootInstanceName) {
            const rootInstanceName = topical.rootInstanceName;
            const instance = Topic.getInstanceFromName(context, rootInstanceName);
            const topic = Topic.load(context, instance);

            await topic.onTurn();

            // garbage collect orphaned instances

            // const orphans = { ... topical.instances };

            // const deorphanize = (instanceName: string) => {
            //     const instance = orphans[instanceName];
            //     if (!instance)
            //         throw "unexpected";

            //     const topic = Topic.load(context, instance);

            //     delete orphans[instanceName];
        
            //     for (let child of topic.listChildren())
            //         deorphanize(child);
            // }

            // deorphanize(rootInstanceName);

            // for (const orphan of Object.keys(orphans)) {
            //     console.warn(`Garbage collecting instance ${orphan} -- you should have called Topic.deleteInstance()`)
            //     Topic.deleteInstance(context, orphan);
            // }

            // await topic.sendTelemetry(context, instance, 'endOfTurn');
        } else {
            topical.instances = {};
            topical.rootInstanceName = await (this as any).create(context, args);
            if (!topical.rootInstanceName)
                throw "no topic instance returned";

            // const instance = Topic.getInstanceFromName(context, topical.rootInstanceName);
            // const topic = Topic.load(context, instance);
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

    public async dispatchTo (
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
        await topic.returnedToParent();
        // await topic.sendTelemetry(context, instance, 'onReceive.end');
        
        return true;
    }

    private async returnedToParent (): Promise<boolean> {
        if (this.returnStatus !== TopicReturnStatus.signalled)
            return false;

        if (!this.parent)
            throw `orphan ${this.instanceName} attempted to returnToParent()`;

        Topic.deleteInstance(this.context, this.instanceName);
        this.returnStatus = TopicReturnStatus.succeeded;

        // await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.begin');

        await this.parent.onChildReturn(this);
        await this.parent.returnedToParent();

        // await parentTopic.sendTelemetry(context, parentInstance, 'onChildReturn.end');

        return true;
    }

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

    // These four default methods are optionally overrideable by subclasses

    public async onBegin (
        args?: Begin,
    ) {
    }

    public async onTurn () {
    }

    public async onChildReturn(
        child: Topic<any, any, any, any, Context>,
    ) {
    }

    public listChildren (): string[] {
        return [];
    }
}

