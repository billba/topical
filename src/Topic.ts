import { Promiseable, Activity, TurnContext, Storage, ConversationState, ResourceResponse } from 'botbuilder';
import { toPromise, Telemetry, TelemetryAction } from './topical';

export enum TopicLifecycle {
    created,
    started,
    ended,
}

export interface TopicInstance {
    topicClassName: string;
    constructorArgs: any;

    children: Record<string, TopicInstance>;

    state: any;

    lifecycle: TopicLifecycle;
}

interface TopicalConversation {
    root?: TopicInstance;
}

export interface TopicClass <
    Start = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext,
    T extends Topic<Start, State, Return, Context> = Topic<Start, State, Return, Context>,
> {
    new (
        args: Constructor,
    ): T;

    name: string;
}

export type TopicChildReference = string | Topic | TopicClass;

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

    public static register() {

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
        return this.topicInstance.state;
    }

    public set state (
        state: State,
    ) {
        this.topicInstance.state = state;
    }

    public get started () {
        return this.topicInstance.lifecycle === TopicLifecycle.started;
    }

    public get ended () {
        return this.topicInstance.lifecycle === TopicLifecycle.ended;
    }

    public get children () {
        return this.topicInstance.children;
    }

    public return?: Return;

    private topicInstance!: TopicInstance;

    public context!: Context;

    public parent?: Topic<any, any, any, Context>;

    // helpers - these aren't specific to topics, but they do make life easier

    public text?: string;
    public send!: (activityOrText: string | Partial<Activity>, speak?: string, inputHint?: string) => Promise<ResourceResponse | undefined>;

    constructor (
    ) {
    }

    protected static createTopicInstance <
        Constructor,
        Context extends TurnContext,
    > (
        this: TopicClass<any, any, any, Constructor, Context>,
        constructorArgs?: Constructor,
    ): TopicInstance {
        const topicClassName = this.name;

        if (!Topic.topics[topicClassName])
            throw `An attempt was made to create an instance of unregistered topic ${topicClassName}.`;

        return {
            topicClassName,
            constructorArgs,
            children: {},
            state: {},
            lifecycle: TopicLifecycle.created,
        }
    }

    recreate() {
        this.removeChildren();

        this.topicInstance.state = {};
        this.topicInstance.lifecycle = TopicLifecycle.created;
    }

    protected static loadTopic <Context extends TurnContext> (
        parentOrContext: Topic<any, any, any, Context> | Context,
        topicInstance: TopicInstance,
        activity?: Activity,
    ): Topic<any, any, any, Context> {

        const [parent         , context                ] = parentOrContext instanceof Topic
            ? [parentOrContext, parentOrContext.context]
            : [undefined      , parentOrContext        ];

        const T = Topic.topics[topicInstance.topicClassName];
        if (!T)
            throw `An attempt was made to load unregistered topic ${topicInstance.topicClassName}.`

        const topic = new T(topicInstance.constructorArgs) as Topic<any, any, any, Context>;

        topic.context = activity ? Topic.getContext(context, activity) : context;
        topic.parent = parent;
        topic.topicInstance = topicInstance;

        topic.text = topic.context.activity.type === 'message' ? topic.context.activity.text.trim() : undefined;
        topic.send = (activityOrText, speak, inputHint) => context.sendActivity(activityOrText, speak, inputHint);

        return topic;
    }

    async start (
        startArgs?: Start
    ) {
        // await this.sendTelemetry(context, newInstance, 'init.start');

        if (this.topicInstance.lifecycle !== TopicLifecycle.created)
            this.recreate();

        this.topicInstance.lifecycle = TopicLifecycle.started;

        await this.onStart(startArgs);

        // await this.sendTelemetry(context, newInstance, 'init.end');    
    }

    async end (
        returnArgs?: Return
    ) {
        this.removeChildren();

        this.return = returnArgs;
        this.topicInstance.lifecycle = TopicLifecycle.ended;

        if (this.parent)
            await this.parent.onChildReturn(this);
    }

    protected static root(
        context: TurnContext,
    ) {
        return Topic.topicalConversationState.get(context)!.root;
    }

    public static async start <
        T extends TopicClass<Start, any, any, Constructor, Context>,
        Start,
        Constructor,
        Context extends TurnContext = TurnContext
    > (
        this: T,
        context: Context,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ) {
        if (this === Topic as any)
            throw "You can only 'start' a child of Topic.";

        if (!Topic.topicalConversationState)
            throw `You must call Topic.init before calling ${this.name}.do`;

        const topicalConversation = await Topic.topicalConversationState.read(context);

        if (topicalConversation.root)
            throw `You must only call ${this.name}.start once.`;

        topicalConversation.root = (this as any).createTopicInstance(context, constructorArgs);

        const topic = Topic.loadTopic(context, topicalConversation.root!);

        await topic.start(startArgs);

        if (topic.ended)
            throw "Root topics shouldn't end (this may change in the future)."

        // const instance = Topic.getInstanceFromName(context, topical.roottopicInstanceName);
        // const topic = Topic.load(context, instance);
        // await topic.sendTelemetry(context, instance, 'assignRootTopic');

        await Topic.topicalConversationState.write(context);
    }

    public static async dispatch <
        T extends TopicClass<any, any, any, any, Context>,
        Context extends TurnContext = TurnContext
    > (
        this: T,
        context: Context,
    ) {
        if (this === Topic as any)
            throw "You can only `dispatch' a child of Topic.";

        const topicalConversation = await Topic.topicalConversationState.read(context);

        if (!topicalConversation.root)
            throw `You must call ${this.name}.start before calling ${this.name}.dispatch.`;

        await Topic.loadTopic(context, topicalConversation.root).onDispatch();

        // garbage collect orphaned instances

        // const orphans = { ... topical.instances };

        // const deorphanize = (topicInstanceName: string) => {
        //     const instance = orphans[topicInstanceName];
        //     if (!instance)
        //         throw "unexpected";

        //     const topic = Topic.load(context, instance);

        //     delete orphans[topicInstanceName];
    
        //     for (let child of topic.listChildren())
        //         deorphanize(child);
        // }

        // deorphanize(roottopicInstanceName);

        // for (const orphan of Object.keys(orphans)) {
        //     console.warn(`Garbage collecting instance ${orphan} -- you should have called Topic.deleteTopicInstance()`)
        //     Topic.deleteTopicInstance(context, orphan);
        // }

        // await topic.sendTelemetry(context, instance, 'endOfTurn');

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

    // public get hasChildren () {
    //     return Object.keys(this.children).length !== 0;
    // }

    public removeChildren () {
        for (const name of Object.keys(this.children)) {
            delete this.children[name];
        }
    }

    public removeChild (
        child: Topic | TopicClass | string,
    ) {
        const name = child instanceof Topic
            ? child.constructor.name
            : typeof child === 'string'
            ? child
            : child.name;

        if (!this.children[name])
            return;

        delete this.children[name];
    }

    // public setChild (
    //     name: string,
    //     topicInstance: TopicInstance,
    // ): void;

    // public setChild (
    //     topicClass: TopicClass,
    //     topicInstance: TopicInstance,
    // ): void;

    // public setChild (
    //     ... args: any[],
    // ) {
    //     let   [name           , topicInstanceName] = args.length === 2
    //         ? [args[0]        , args[1]          ]
    //         : [Topic.childName, args[0]          ];

    //     this.removeChild(name);
    //     this.children[name] = topicInstanceName;
    // }


    // public get child () {
    //     return this.children[Topic.childName];
    // }

    // public get hasChild () {
    //     return this.children.hasOwnProperty(Topic.childName);
    // }

    // public set child (
    //     child: string | undefined,
    // ) {
    //     this.clearChildren();

    //     if (child)
    //         this.children[Topic.childName] = child;
    // }

    public createChild <
        Constructor,
    > (
        name: string,
        topicClass: TopicClass<any, any, any, Constructor, Context>,
        constructorArgs?: Constructor,
    ): TopicInstance;

    public createChild <
        Constructor,
    > (
        topicClass: TopicClass<any, any, any, Constructor, Context>,
        constructorArgs?: Constructor,
    ): TopicInstance;

    public createChild (
        ... args: any[],
    ) {
        let   [name        , topicClass, constructorArgs] = typeof args[0] === 'string'
            ? [args[0]     , args[1]   , args[2]        ]
            : [args[0].name, args[0]   , args[1]        ];

        this.removeChild(name);

        const ti = topicClass.createTopicInstance(this.context, constructorArgs);

        this.children[name] = ti;

        return ti;
    }

    public loadChild <
        T extends Topic<any, any, any, Context> = Topic<any, any, any, Context>,
    > (
        topicClass: TopicClass<any, any, any, any, Context, T>,
        activity?: Activity,
    ): T;

    public loadChild <
        T extends Topic<any, any, any, Context> = Topic<any, any, any, Context>,
    > (
        name: string,
        activity?: Activity,
    ): T;

    public loadChild (
        ... args: any[],
    ) {
        return Topic.loadTopic(
            this,
            this.children[typeof args[0] === 'string' ? args[0] : args[0].name],
            args[1]
        );
    }

    public startChild (
        name: string,
        startArgs?: any,
    ): Promise<void>;

    public startChild <
        Start,
    > (
        topic: Topic<Start>,
        startArgs?: Start,
    ): Promise<void>;

    public startChild <
        Start,
        Constructor,
    > (
        topicClass: TopicClass<Start, any, any, Constructor>,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ): Promise<void>;

    public startChild <
        T extends TopicClass<Start, any, any, Constructor>,
        Start,
        Constructor,
    > (
        name: string,
        topicClass: T,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ): Promise<void>;

    public async startChild (
        ... args: any[],
    ) {
        let   [name                    , topic    , i] = typeof args[0] === 'string'
            ? [args[0]                 , undefined, 1] : typeof args[0] === 'function'
            ? [args[0].name            , undefined, 0]
            : [args[0].constructor.name, args[0],   0];

        let   [topicClass, startArgs  , constructorArgs] = typeof args[i] === 'function'
            ? [args[i]   , args[i + 1], args[i + 2]    ]
            : [undefined , args[i]    , args[i + 1]    ];


        let create = false;

        let ti = this.children[name];

        if (ti) {
            if (topicClass && topicClass !== ti.topicClassName)
                create = true;
        } else {
            if (!topicClass)
                throw `There is no child named ${name}. When starting a new topic you must provide the topic class.`;
            create = true;
        }

        if (create) {
            ti = this.createChild(name, topicClass, constructorArgs);
        }

        await (topic || Topic.loadTopic(this, ti)).start(startArgs);
    }

    // dispatch to name/topic/class with args

    public dispatchToChild (
        child: TopicChildReference,
        dispatchArgs: {},
    ): Promise<boolean>;

    // dispatch activity to name/topic/class with args

    public dispatchToChild (
        activity: Activity,
        child: TopicChildReference,
        dispatchArgs: {},
    ): Promise<boolean>;

    // dispatch activity to first name/topic/class that has started

    public dispatchToChild (
        activity: Activity,
        ... children: TopicChildReference[],
    ): Promise<boolean>;

    // dispatch to first name/topic/class that has started

    public dispatchToChild (
        ... children: TopicChildReference[],
    ): Promise<boolean>;

    public async dispatchToChild (
        ... args: any[],
    ) {
        let activity: Activity | undefined;
        let i: number;

        let first = args[0];
        let type = typeof first;

          [activity , i] = type !== 'function' && type !== 'string' || ! (first instanceof Topic)
        ? [first    , 0]
        : [undefined, 1];
    
        let children: TopicChildReference[];
        let dispatchArgs: object | undefined = undefined;

        if (args.length === i) {
            // no name/topic/class specified means "all children"
            children = Object.keys(this.children);
        } else {
            // look for dispatchArgs
            if (args.length === i + 2) {
                let type = typeof args[i + 1];
                if (type !== 'function' && type !== 'string' || ! (args[i + 1] instanceof Topic))
                    dispatchArgs = args[i + 1];
            }

            children = args.slice(i, dispatchArgs && -1);
        }

        for (const child of children) {
            let topic: Topic;

            if (child instanceof Topic) {
                topic = activity ? Topic.loadTopic(this, child.topicInstance, activity) : child;
            } else {
                const name = typeof child === 'string' ? child : child.name;
                const ti =  this.children[name];
                if (!ti)
                    throw `No child named ${name}`;

                topic = Topic.loadTopic(this, ti, activity);
            }
            
            if (topic.started) {
                await topic.onDispatch(dispatchArgs);
                return true;
            }
        }
    
        return false;
    }

    // These five default methods are optionally overrideable by subclasses

    public async getStartScore (): Promise<StartScore<Start> | void> {
    }

    public async onStart (
        args?: Start,
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

    public async onChildReturn(
        child: Topic<any, any, any, Context>,
    ) {
    }
}

