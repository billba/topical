import { Promiseable, Activity, TurnContext, Storage, ConversationState, ResourceResponse } from 'botbuilder';
import { toPromise, Telemetry, TelemetryAction } from './topical';

export enum TopicLifecycle {
    created,
    started,
    ended,
}

export interface TopicInstance {
    topicInstanceName: string;
    children: string[];

    topicClassName: string;
    constructorArgs: any;

    state: any;

    lifecycle: TopicLifecycle;
}

interface TopicalConversation {
    topicInstances: Record<string, TopicInstance>;
    rootTopicInstanceName: string;
}

export interface Topicable <
    Start = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext, 
> {
    new (
        args: Constructor,
    ): Topic<Start, State, Return, Constructor, Context>;
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
    Constructor = any,
    Context extends TurnContext = TurnContext, 
> {
    private static topicalConversationState: ConversationState<TopicalConversation>;

    private static telemetry: Telemetry;
    private static getContext: GetContext<any> = (context, activity) => {
        const newContext = new TurnContext(context);
        (newContext as any)._activity = activity;
        return Promise.resolve(newContext);
    };

    public static init (
        storage: Storage,
        options?: Partial<TopicInitOptions>,
    ) {
        if (Topic.topicalConversationState)
            throw "you should only call Topic.init once.";

        Topic.topicalConversationState = new ConversationState<TopicalConversation>(storage, "github.com/billba/topical");

        Object.assign(Topic, options);
    }

    private static topics: Record<string, Topicable> = {};

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

    public set children (
        children: string[],
    ) {
        this.topicInstance.children = children;
    }

    public return?: Return;

    private topicInstance!: TopicInstance;

    public context!: Context;

    public parent?: Topic<any, any, any, any, Context>;

    // helpers - these aren't specific to topics, but they do make life easier

    public text?: string;
    public send!: (activityOrText: string | Partial<Activity>, speak?: string, inputHint?: string) => Promise<ResourceResponse | undefined>;

    constructor (
        args: Constructor,
    ) {
    }

    protected static createTopicInstance <
        T extends Topicable<Start, any, any, Constructor, Context>,
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
            children: [],
            state: {},
            lifecycle: TopicLifecycle.created,
        }

        Topic.topicalConversationState.get(context)!.topicInstances[topicInstanceName] = instance;

        return topicInstanceName;
    }

    createTopicInstance <
        T extends Topicable<any, any, any, Constructor, Context>,
        Constructor,
    > (
        topicClass: T,
        constructorArgs?: Constructor,
    ): string {

        return (topicClass as any).createTopicInstance(this.context, constructorArgs);
    }

    recreate() {
        this.clearChildren();

        this.topicInstance.state = {};
        this.topicInstance.lifecycle = TopicLifecycle.created;
    }

    static async loadTopic <Context extends TurnContext> (
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        topicInstance: string | TopicInstance,
        activity?: Activity,
    ): Promise<Topic<any, any, any, any, Context>> {

        let parent: Topic<any, any, any, any, Context> | undefined;
        let context: Context;

        if (parentOrContext instanceof Topic) {
            parent = parentOrContext;
            context = parentOrContext.context;
        } else {
            parent = undefined;
            context = parentOrContext;
        }

        if (typeof topicInstance === 'string')
            topicInstance = Topic.getTopicInstanceFromName(context, topicInstance);

        const T = Topic.topics[topicInstance.topicClassName];
        if (!T)
            throw `An attempt was made to load unregistered topic ${topicInstance.topicClassName}.`

        const topic = new T(topicInstance.constructorArgs) as Topic<any, any, any, any, Context>;

        topic.context = activity ? await Topic.getContext(context, activity) : context;
        topic.parent = parent;
        topic.topicInstance = topicInstance;

        topic.text = topic.context.activity.type === 'message' ? topic.context.activity.text.trim() : undefined;
        topic.send = (activityOrText, speak, inputHint) => context.sendActivity(activityOrText, speak, inputHint);

        return topic;
    }

    loadTopic (
        instance: string | TopicInstance,
        activity?: Activity,
    ): Promise<Topic<any, any, any, any, Context>> {

        return Topic.loadTopic(this, instance, activity);
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
        this.clearChildren();

        this.return = returnArgs;
        this.topicInstance.lifecycle = TopicLifecycle.ended;

        if (this.parent)
            await this.parent.onChildReturn(this);
    }

    async createTopicInstanceAndStart <
        T extends Topicable<Start, any, any, Constructor, Context>,
        Start,
        Constructor,
    > (
        topicClass: T,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ): Promise<Topic<any, any, any, Constructor, Context>> {

        const topicInstanceName = this.createTopicInstance(topicClass, constructorArgs);

        const topic = await this.loadTopic(topicInstanceName);

        await topic.start(startArgs)

        return topic;
    }

    protected static deleteInstance (
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
        T extends Topicable<Start, any, any, Constructor, Context>,
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

        const topicalConversation = await Topic.topicalConversationState.read(context) as Partial<TopicalConversation>;

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
        T extends Topicable<any, any, any, any, Context>,
        Context extends TurnContext = TurnContext
    > (
        this: T,
        context: Context,
    ) {
        if (this === Topic as any)
            throw "You can only `dispatch' a child of Topic.";

        const topical = await Topic.topicalConversationState.read(context) as TopicalConversation;

        if (!topical.rootTopicInstanceName)
            throw `You must call ${this.name}.start before calling ${this.name}.onDispatch.`;

        await (await Topic.loadTopic(context, topical.rootTopicInstanceName)).onDispatch();

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
        //     console.warn(`Garbage collecting instance ${orphan} -- you should have called Topic.deleteInstance()`)
        //     Topic.deleteInstance(context, orphan);
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
        topicInstanceName: string | undefined,
        activity?: Activity,
        args?: any,
    ) {
        if (!topicInstanceName)
            return false;

        const topicInstance = Topic.getTopicInstanceFromName(this.context, topicInstanceName);

        const topic = await this.loadTopic(topicInstance, activity);

        if (!topic.started)
            return false;

        // await topic.sendTelemetry(context, instance, 'onReceive.start');
        await topic.onDispatch(args);
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

    public get hasChildren () {
        return this.children.length !== 0;
    }

    public clearChildren () {
        if (this.hasChildren) {
            for (const child in this.children) {
                Topic.deleteInstance(this.context, child);
            }

            this.children = [];
        }
    }

    public removeChild (
        child: string,
    ) {
        Topic.deleteInstance(this.context, child);

        this.children = this.children.filter(_child => _child !== child);
    }

    // helpers for the single-child pattern

    public get child () {
        return this.hasChild ? this.children[0] : undefined;
    }

    public get hasChild () {
        return this.children.length === 1;
    }

    public set child (
        child: string | undefined,
    ) {
        this.clearChildren();

        if (child)
            this.children[0] = child;
    }

    public clearChild () {
        this.clearChildren();
    }

    async startChild <
        T extends Topicable<Start, any, any, Constructor, Context>,
        Start,
        Constructor,
    > (
        topicClass: T,
        startArgs?: Start,
        constructorArgs?: Constructor,
    ) {
        const topic = await this.createTopicInstanceAndStart(topicClass, startArgs, constructorArgs);

        if (topic.ended)
            this.clearChild();
        else
            this.child = topic.topicInstanceName;
    }

    public dispatchToChild (
        activity?: Activity,
        args?: any,
    ) {
        return this.dispatchTo(this.child, activity, args);
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
        child: Topic<any, any, any, any, Context>,
    ) {
        this.clearChildren();
    }
}

