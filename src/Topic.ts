import { Promiseable, Activity, TurnContext, Storage, ConversationState, ResourceResponse } from 'botbuilder';
import { toPromise, Telemetry, TelemetryAction } from './topical';

export enum TopicLifecycle {
    Created,
    Started,
    Ended,
    Removed,
}

export interface TopicNode {
    children: Record<string, TopicNode>;

    className: string;
    constructorArgs: any;

    state: any;

    lifecycle: TopicLifecycle;
}

interface TopicalConversation {
    root?: TopicNode;
}

export interface TopicClass <
    Constructor = any,
    T extends Topic = Topic,
> {
    new (
        args: Constructor,
    ): T;

    name: string;
}

export type GetConstructorArgs<TC> = TC extends TopicClass<infer Constructor> ? Constructor : never;

export type GetStartArgs<TC> = TC extends TopicClass<any, Topic<infer Start>> ? Start : never;

export type GetTopic<TC> =  TC extends TopicClass<any, infer T> ? T : never;

export type TopicChildReference <
    Context extends TurnContext,
> = string | TopicWithContext<Context> | TopicClass<any, TopicWithContext<Context>>;

export type GetContext <
    Context extends TurnContext = TurnContext,
> = (
    context: Context,
    activity: Activity,
) => Context;

export interface TopicInitOptions {
    telemetry: Telemetry;
    getContext: GetContext<any>;
}

export interface StartScore <Start> {
    startArgs?: Start;
    score: number;
}

export interface DispatchScore {
    dispatchArgs?: any;
    score: number;
}

export type TopicWithContext<Context extends TurnContext> = Topic<any, any, any, Context>;

export abstract class Topic <
    Start = any,
    State = any,
    Return = any,
    Context extends TurnContext = TurnContext, 
> {
    private static topicalConversationState: ConversationState<TopicalConversation>;

    private static telemetry: Telemetry;
    private static getContext: GetContext<any> = (context, activity) => {
        const newContext = new TurnContext(context);
        (newContext as any)._activity = activity;
        return newContext;
    }

    public static init (
        storage: Storage,
        options?: Partial<TopicInitOptions>,
    ) {
        if (Topic.topicalConversationState)
            throw "you should only call Topic.init once.";

        Topic.topicalConversationState = new ConversationState<TopicalConversation>(storage, "github.com/billba/topical");

        Object.assign(Topic, options);
    }

    private static topics: Record<string, TopicClass> = {};

    public static register (
    ) {

        if (this === Topic)
            return;

        const T = Topic.topics[this.name];

        if (T) {
            if (T === this as any)
                return; // no need to re-register
            throw `A different topic with name ${T.name} has already been registered.`
        }

        Topic.topics[this.name] = this as any;
    }

    public get state () {
        return this.topicNode.state;
    }

    public set state (
        state: State,
    ) {
        this.topicNode.state = state;
    }

    public get created () {
        return this.topicNode.lifecycle === TopicLifecycle.Created;
    }

    public get started () {
        return this.topicNode.lifecycle === TopicLifecycle.Started;
    }

    public get ended () {
        return this.topicNode.lifecycle === TopicLifecycle.Ended;
    }

    public get removed () {
        return this.topicNode.lifecycle === TopicLifecycle.Removed;
    }

    public get children () {
        return this.topicNode.children;
    }

    public get childNames () {
        return Object.keys(this.topicNode.children);
    }

    public return?: Return;

    private topicNode!: TopicNode;

    public context!: Context;

    public parent?: TopicWithContext<Context>;

    // helpers - these aren't specific to topics, but they do make life easier

    public text?: string;
    public send!: (activityOrText: string | Partial<Activity>, speak?: string, inputHint?: string) => Promise<ResourceResponse | undefined>;

    constructor () {
    }

    protected static async createTopicNode <
        Context extends TurnContext,
        TC extends TopicClass<any, TopicWithContext<Context>>,
    > (
        topicClass: TC,
        parentOrContext: TopicWithContext<Context> | Context,
        constructorArgs?: GetConstructorArgs<TC>,
    ) {
        const className = topicClass.name;

        if (!Topic.topics[className])
            throw `A reference was made to unregistered topic ${className}.`;

        const topic = Topic.loadTopic(parentOrContext, {
            className,
            constructorArgs,
            children: {},
            state: {},
            lifecycle: TopicLifecycle.Created,
        });

        await topic.onCreate();

        return topic;
    }

    public async recycle(
    ) {
        if (this.topicNode.lifecycle === TopicLifecycle.Removed)
            throw "can't recycle a removed child";

        await this.removeChildren();
        this.topicNode.state = {};
        this.topicNode.lifecycle = TopicLifecycle.Created;

        await this.onCreate();
    }

    public async recycleChild (
        child: TopicChildReference<Context>,
    ) {
        await this.loadChild(child).recycle();
    }

    protected static loadTopic <Context extends TurnContext> (
        parentOrContext: TopicWithContext<Context> | Context,
        topicNode: TopicNode,
        activity?: Activity,
    ): TopicWithContext<Context> {

        const [parent         , context                ] = parentOrContext instanceof Topic
            ? [parentOrContext, parentOrContext.context]
            : [undefined      , parentOrContext        ];

        const T = Topic.topics[topicNode.className];
        if (!T)
            throw `An attempt was made to load unregistered topic ${topicNode.className}.`

        const topic = new T(topicNode.constructorArgs) as TopicWithContext<Context>;

        topic.context = activity ? Topic.getContext(context, activity) : context;
        topic.parent = parent;
        topic.topicNode = topicNode;

        topic.text = topic.context.activity.type === 'message' ? topic.context.activity.text.trim() : undefined;
        topic.send = (activityOrText, speak, inputHint) => context.sendActivity(activityOrText, speak, inputHint);

        return topic;
    }

    public async start (
        startArgs?: Start
    ) {
        if (this.topicNode.lifecycle === TopicLifecycle.Removed)
            throw "can't start a removed child";

        // await this.sendTelemetry(context, newInstance, 'init.start');

        if (this.topicNode.lifecycle !== TopicLifecycle.Created)
            this.recycle();

        this.topicNode.lifecycle = TopicLifecycle.Started;

        await this.onStart(startArgs);

        // await this.sendTelemetry(context, newInstance, 'init.end');    
    }

    public async end (
        returnArgs?: Return
    ) {
        if (this.topicNode.lifecycle === TopicLifecycle.Removed)
            throw "can't end a removed child";

        this.return = returnArgs;
        this.topicNode.lifecycle = TopicLifecycle.Ended;

        await this.onEnd();

        if (this.parent)
            await this.parent.onChildEnd(this);
    }

    public async endChild <
        T extends TopicWithContext<Context>,
    > (
        child: string | T | TopicClass<any, T>,
        returnArgs?: T extends Topic<any, any, infer Return> ? Return : never,
    ) {
        await this.loadChild(child).end(returnArgs);
    }

    public static async start <
        Context extends TurnContext,
        TC extends TopicClass<any, TopicWithContext<Context>>,
    > (
        this: TC,
        context: Context,
        startArgs?: GetStartArgs<TC>,
        constructorArgs?: GetConstructorArgs<TC>,
    ) {
        if (this === Topic as any)
            throw "You can only 'start' a child of Topic.";

        if (!Topic.topicalConversationState)
            throw `You must call Topic.init before calling ${this.name}.start`;

        const topicalConversation = await Topic.topicalConversationState.read(context);

        if (topicalConversation.root)
            throw `You must only call ${this.name}.start once.`;

        const topic = await Topic.createTopicNode(this, context, constructorArgs);

        topicalConversation.root = topic.topicNode;

        await topic.start(startArgs);

        if (topic.ended)
            throw "Root topics shouldn't end (this may change in the future)."

        // const instance = Topic.getInstanceFromName(context, topical.roottopicInstanceName);
        // const topic = Topic.load(context, instance);
        // await topic.sendTelemetry(context, instance, 'assignRootTopic');

        await Topic.topicalConversationState.write(context);
    }

    public static async dispatch <
        Context extends TurnContext,
    > (
        this: TopicClass<any, TopicWithContext<Context>>,
        context: Context,
    ) {
        if (this === Topic as any)
            throw "You can only `dispatch' a child of Topic.";

        const topicalConversation = await Topic.topicalConversationState.read(context);

        if (!topicalConversation.root)
            throw `You must call ${this.name}.start before calling ${this.name}.dispatch.`;

        await Topic.loadTopic(context, topicalConversation.root).onDispatch();

        await Topic.topicalConversationState.write(context);
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
    //         activity: context.activity as Activity,
    //         instance: {
    //             topicInstanceName: instance.topicInstanceName,
    //             topicName: this.name,
    //             children: this.listChildren(context, instance),
    //         },
    //     });
    // }

    public get hasChildren () {
        return this.childNames.length !== 0;
    }

    public get hasStartedChildren () {
        for (const tn of Object.values(this.children)) {
            if (tn.lifecycle === TopicLifecycle.Started)
                return true;
        }

        return false;
    }

    public async removeChildren (
    ) {
        for (const name of this.childNames)
            await this.removeChild(name);
    }

    private getChildName(
        child: TopicChildReference<Context>,
    ) {
        return typeof child === 'string'
            ? child
            : typeof child === 'function'
            ? child.name
            : child.constructor.name;
    }

    public async removeChild (
        child: TopicChildReference<Context>,
    ) {
        const name = this.getChildName(child);

        if (!this.children[name])
            return;

        const topic = this.loadChild(child);
    
        topic.topicNode.lifecycle = TopicLifecycle.Removed;

        await topic.onRemove();

        delete this.children[name];

        await topic.removeChildren();
    }

    public createChild <
        TC extends TopicClass<any, TopicWithContext<Context>>
    > (
        name: string,
        topicClass: TC,
        constructorArgs?: GetConstructorArgs<TC>,
    ): Promise<GetTopic<TC>>;

    public createChild <
        TC extends TopicClass<any, TopicWithContext<Context>>
    > (
        topicClass: TC,
        constructorArgs?: GetConstructorArgs<TC>,
    ): Promise<GetTopic<TC>>;

    public async createChild (
        ... args: any[],
    ) {
        let   [name        , topicClass, constructorArgs] = typeof args[0] === 'string'
            ? [args[0]     , args[1]   , args[2]        ]
            : [args[0].name, args[0]   , args[1]        ];

        await this.removeChild(name);

        const topic = await Topic.createTopicNode(topicClass, this, constructorArgs);

        this.children[name] = topic.topicNode;

        return topic;
    }

    public loadChild <
        T extends TopicWithContext<Context>,
    > (
        child: string | T | TopicClass<any, T>,
        activity?: Activity,
    ): T {
        if (child instanceof Topic)
            return activity ? Topic.loadTopic(this, child.topicNode, activity) as T : child;

        const name = typeof child === 'string' ? child : child.name;
        const tn = this.children[name];

        if (!tn)
            throw `No child with name ${name}`;

        const topic = Topic.loadTopic(this, tn, activity) as T;

        if (typeof child === 'function' && topic.topicNode.className !== name)
            throw `The child named ${name} is not an instance of that class.`;

        return topic;
    }

    public startChild <
        T extends TopicWithContext<Context>,
    > (
        child: string | T,
        startArgs?: T extends Topic<infer Start> ? Start : never,
    ): Promise<T>;

    public startChild <
        TC extends TopicClass<any, TopicWithContext<Context>>,
    > (
        topicClass: TC,
        startArgs?: GetStartArgs<TC>,
        constructorArgs?: GetConstructorArgs<TC>,
    ): Promise<GetTopic<TC>>;

    public startChild <
        TC extends TopicClass<any, TopicWithContext<Context>>,
    > (
        name: string,
        topicClass: TC,
        startArgs?: GetStartArgs<TC>,
        constructorArgs?: GetConstructorArgs<TC>,
    ): Promise<GetTopic<TC>>;

    public async startChild (
        ... args: any[],
    ) {
        let   [name                    , topic                                   , i] = typeof args[0] === 'string'
            ? [args[0]                 , undefined                               , 1] : typeof args[0] === 'function'
            ? [args[0].name            , undefined                               , 0]
            : [args[0].constructor.name, args[0] as TopicWithContext<Context>    , 0];

        let   [topicClass                                           , startArgs  , constructorArgs] = typeof args[i] === 'function'
            ? [args[i] as TopicClass<any, TopicWithContext<Context>>, args[i + 1], args[i + 2]    ]
            : [undefined                                            , args[i]    , args[i + 1]    ];

        let create = true;

        let tn = this.children[name];

        if (tn) {
            create = !!topicClass && topicClass.name !== tn.className;
        } else {
            if (!topicClass)
                throw `There is no child named ${name}. When starting a new topic you must provide the topic class.`;
            create = true;
        }

        console.log("HEY", args, create);

        if (create)
            topic = await this.createChild(name, topicClass!, constructorArgs);

        if (!topic)
            topic = Topic.loadTopic(this, tn);

        await topic.start(startArgs);

        return topic;
    }

    // dispatch to name/topic/class with args

    public dispatchToChild (
        child: TopicChildReference<Context>,
        dispatchArgs: {},
    ): Promise<boolean>;

    // dispatch activity to name/topic/class with args

    public dispatchToChild (
        activity: Activity,
        child: TopicChildReference<Context>,
        dispatchArgs: {},
    ): Promise<boolean>;

    // dispatch activity to first name/topic/class that has started

    public dispatchToChild (
        activity: Activity,
        ... children: TopicChildReference<Context>[],
    ): Promise<boolean>;

    // dispatch to first name/topic/class that has started

    public dispatchToChild (
        ... children: TopicChildReference<Context>[],
    ): Promise<boolean>;

    public async dispatchToChild (
        ... args: any[],
    ) {
        let activity: Activity | undefined = undefined;
        let i = 0;

        if (args.length) { 
            // see if first arg is activity
            let first = args[0];
            let type = typeof first;

            if (type !== 'function' && type !== 'string' && !(first instanceof Topic)) {
                activity = first;
                i = 1;
            }
        }
    
        let children: TopicChildReference<Context>[];
        let dispatchArgs: object | undefined = undefined;

        if (args.length === i) {
            // no name/topic/class specified means "all children"
            children = this.childNames;
        } else {
            // see if last arg is dispatchArgs
            if (args.length === i + 2) {
                let first = args[i + 1];
                let type = typeof first;

                if (type !== 'function' && type !== 'string' && !(first instanceof Topic))
                    dispatchArgs = first;
            }

            children = args.slice(i, dispatchArgs && -1);
        }

        for (const child of children) {
            const topic = this.loadChild(child, activity);

            if (topic.started) {
                await topic.onDispatch(dispatchArgs);
                return true;
            }
        }
    
        return false;
    }

    public async resume(
    ) {
        await this.onResume();
    }

    public async resumeChild (
        child: TopicChildReference<Context>,
    ) {
        await this.loadChild(child).resume();
    }

    // These nine default methods are optionally overrideable by subclasses

    public async onCreate (
    ) {
    }

    public async getStartScore (
    ): Promise<StartScore<Start> | void> {
    }

    public async onStart (
        args?: Start,
    ) {
    }

    public async onResume (
        args?: any,
    ) {
    }

    public async getDispatchScore (
        activity?: Activity,
    ): Promise<DispatchScore | void> {
    }

    public async onDispatch (
        args?: any,
    ) {
    }

    public async onChildEnd(
        child: TopicWithContext<Context>,
    ) {
    }

    public async onEnd (
    ) {
    }

    public async onRemove (
    ) {
    }
}
