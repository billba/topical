import { Promiseable, Activity, TurnContext, Storage, ConversationState, ResourceResponse } from 'botbuilder';
import { toPromise, Telemetry, TelemetryAction } from './topical';

export enum TopicLifecycle {
    created,
    started,
    ended,
}

export interface TopicInstance {
    topicInstanceName: string;
    children: Record<string, string>;

    topicClassName: string;
    constructorArgs: any;

    state: any;

    lifecycle: TopicLifecycle;
}

interface TopicalConversation {
    topicInstances: Record<string, TopicInstance>;
    rootTopicInstanceName: string;
}

export interface TopicClass <
    Start = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext, 
> {
    new (
        args: Constructor,
    ): Topic<Start, State, Return, Context>;

    name: string;
}

export type GetContext <
    Context extends TurnContext = TurnContext,
> = (
    context: Context,
    activity: Activity,
) => Promise<Context>;

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
        return Promise.resolve(newContext);
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

    public get topicInstanceName () {
        return this.topicInstance.topicInstanceName;
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
        T extends TopicClass<Start, any, any, Constructor, Context>,
        Start,
        Constructor,
        Context extends TurnContext,
    > (
        this: T,
        context: Context,
        constructorArgs?: Constructor,
    ) {
        const topicClassName = this.name;

        if (!Topic.topics[topicClassName])
            throw `An attempt was made to create an instance of unregistered topic ${topicClassName}.`;

        const topicInstanceName = `${this.name}(${Date.now().toString()}${Math.random().toString().substr(1)})`;

        const instance: TopicInstance = {
            topicInstanceName,
            topicClassName,
            constructorArgs,
            children: {},
            state: {},
            lifecycle: TopicLifecycle.created,
        }

        Topic.topicalConversationState.get(context)!.topicInstances[topicInstanceName] = instance;

        return topicInstanceName;
    }

    recreate() {
        this.removeChildren();

        this.topicInstance.state = {};
        this.topicInstance.lifecycle = TopicLifecycle.created;
    }

    static async loadTopic <Context extends TurnContext> (
        parentOrContext: Topic<any, any, any, Context> | Context,
        topicInstance: string | TopicInstance,
        activity?: Activity,
    ): Promise<Topic<any, any, any, Context>> {

        const [parent         , context                ] = parentOrContext instanceof Topic
            ? [parentOrContext, parentOrContext.context]
            : [undefined      , parentOrContext        ];

        if (typeof topicInstance === 'string')
            topicInstance = Topic.getTopicInstanceFromName(context, topicInstance);

        const T = Topic.topics[topicInstance.topicClassName];
        if (!T)
            throw `An attempt was made to load unregistered topic ${topicInstance.topicClassName}.`

        const topic = new T(topicInstance.constructorArgs) as Topic<any, any, any, Context>;

        topic.context = activity ? await Topic.getContext(context, activity) : context;
        topic.parent = parent;
        topic.topicInstance = topicInstance;

        topic.text = topic.context.activity.type === 'message' ? topic.context.activity.text.trim() : undefined;
        topic.send = (activityOrText, speak, inputHint) => context.sendActivity(activityOrText, speak, inputHint);

        return topic;
    }

    loadTopic (
        topicInstance: string | TopicInstance,
        activity?: Activity,
    ): Promise<Topic<any, any, any, Context>> {

        return Topic.loadTopic(this, topicInstance, activity);
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

    protected static deleteTopicInstance (
        context: TurnContext,
        topicInstanceName: string,
    ) {
        delete Topic.topicalConversationState.get(context)!.topicInstances[topicInstanceName];
    }

    protected static rootTopicInstanceName(
        context: TurnContext,
    ) {
        return Topic.topicalConversationState.get(context)!.rootTopicInstanceName;
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

        if (topicalConversation.rootTopicInstanceName)
            throw `You must only call ${this.name}.start once.`;

        topicalConversation.topicInstances = {};
        topicalConversation.rootTopicInstanceName = (this as any).createTopicInstance(context, constructorArgs);

        const topic = await Topic.loadTopic(context, topicalConversation.rootTopicInstanceName!);

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

        if (!topicalConversation.rootTopicInstanceName)
            throw `You must call ${this.name}.start before calling ${this.name}.dispatch.`;

        await (await Topic.loadTopic(context, topicalConversation.rootTopicInstanceName)).onDispatch();

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

    private static getTopicInstanceFromName (
        context: TurnContext,
        topicInstanceName: string,
    ) {
        const topicInstance = Topic.topicalConversationState.get(context)!.topicInstances[topicInstanceName];

        if (!topicInstance)
            throw `Unknown instance ${topicInstanceName}`;

        return topicInstance;
    }

    public async dispatchTo (
        topicOrInstanceName: string | Topic | undefined,
        activity?: Activity,
        args?: any,
    ) {
        if (!topicOrInstanceName)
            return false;
        
        if (typeof topicOrInstanceName === 'string')
            topicOrInstanceName = await this.loadTopic(topicOrInstanceName, activity);

        if (!topicOrInstanceName.started)
            return false;

        // await topic.sendTelemetry(context, instance, 'onReceive.start');
        await topicOrInstanceName.onDispatch(args);
        // await topic.sendTelemetry(context, instance, 'onReceive.end');
        
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
        for (const [name, topicInstanceName] of Object.entries(this.children)) {
            delete this.children[name];
            Topic.deleteTopicInstance(this.context, topicInstanceName);
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

        const topicInstanceName = this.children[name];
        if (!topicInstanceName)
            return;

        delete this.children[name];
        Topic.deleteTopicInstance(this.context, topicInstanceName);
    }

    public setChild (
        name: string,
        topicInstanceName: string,
    ): void;

    public setChild (
        topicInstanceName: string,
    ): void;
    
    public setChild (
        ... args: any[],
    ) {
        let   [name           , topicInstanceName] = args.length === 2
            ? [args[0]        , args[1]          ]
            : [Topic.childName, args[0]          ];

        this.removeChild(name);
        this.children[name] = topicInstanceName;
    }

    private static childName = 'child';

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
        T extends TopicClass<any, any, any, Constructor, Context>,
        Constructor,
    > (
        name: string,
        topicClass: T,
        constructorArgs?: Constructor,
    ): void;

    public createChild <
        T extends TopicClass<any, any, any, Constructor, Context>,
        Constructor,
    > (
        topicClass: T,
        constructorArgs?: Constructor,
    ): void;

    public createChild (
        ... args: any[],
    ) {
        let   [name           , topicClass, constructorArgs] = typeof args[0] === 'string'
            ? [args[0]        , args[1]   , args[2]        ]
            : [Topic.childName, args[0]   , args[1]        ];

        this.removeChild(name);
        this.children[name] = topicClass.createTopicInstance(this.context, constructorArgs);
    }

    public loadChild <T extends Topic<any, any, any, Context> = Topic<any, any, any, Context>> (
        name: string,
        activity?: Activity,
    ): Promise<T>;

    public loadChild <T extends Topic<any, any, any, Context> = Topic<any, any, any, Context>> (
        activity?: Activity,
    ): Promise<T>;

    public loadChild (
        ... args: any[],
    ) {
        let   [name           , activity] = typeof args[0] === 'string'
            ? [args[0]        , args[1] ]
            : [Topic.childName, args[0] ];

        return Topic.loadTopic(this, this.children[name], activity);
    }

    public startChild (
        name: string,
        startArgs?: any,
    ): Promise<void>;

    public startChild <
        T extends TopicClass<Start, any, any, Constructor, Context>,
        Start,
        Constructor,
    > (
        name: string,
        topicClass: T,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ): Promise<void>;

    public startChild <
        T extends TopicClass<Start, any, any, Constructor, Context>,
        Start,
        Constructor,
    > (
        topicClass: T,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ): Promise<void>;

    public async startChild (
        ... args: any[],
    ) {
        let   [name           , i] = typeof args[0] === 'string'
            ? [args[0]        , 1]
            : [Topic.childName, 0];

        let   [topicClass, startArgs  , constructorArgs] = typeof args[i] === 'function'
            ? [args[i]   , args[i + 1], args[i + 2]    ]
            : [undefined , args[i]    , args[i + 1]    ];

        if (topicClass)
            this.setChild(name, topicClass.createTopicInstance(this.context, constructorArgs));
        
        await (await this.loadChild(name)).start(startArgs);
    }

    public dispatchToChild (
        name: string,
        activity?: Activity,
        dispatchArgs?: any,
    ): Promise<boolean>;

    public dispatchToChild (
        activity?: Activity,
        dispatchArgs?: any,
    ): Promise<boolean>;

    public dispatchToChild (
        ... args: any[],
    ) {
        let   [name           , activity, dispatchArgs] = typeof args[0] === 'string'
            ? [args[0]        , args[1] , args[2]     ]
            : [Topic.childName, args[0] , args[1]     ];
    
        return this.dispatchTo(this.children[name], activity, dispatchArgs);
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
        if (await this.dispatchToChild())
            return;
    }

    public async onChildReturn(
        child: Topic<any, any, any, Context>,
    ) {
        this.removeChildren();
    }
}

