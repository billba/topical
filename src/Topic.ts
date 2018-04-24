import { Promiseable, Activity, TurnContext, Storage, ConversationState, ResourceResponse } from 'botbuilder';
import { toPromise, returnsPromiseVoid, Telemetry, TelemetryAction } from './topical';

export interface TopicInstance {
    topicInstanceName: string;
    children: string[];

    topicClassName: string;
    constructorArgs: any,

    state: any;

    begun: boolean;
}

interface TopicalConversation {
    topicInstances: Record<string, TopicInstance>,
    rootTopicInstanceName: string;
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
    Context extends TurnContext = TurnContext, 
> {
    new (
        args: Constructor,
    ): Topic<Begin, State, Return, Constructor, Context>;
}

export interface TopicInitOptions {
    telemetry: Telemetry;
}

export interface TriggerResult <Begin> {
    beginArgs?: Begin;
    score: number;
}

export abstract class Topic <
    Begin = any,
    State = any,
    Return = any,
    Constructor = any,
    Context extends TurnContext = TurnContext, 
> {
    private static topicalConversationState: ConversationState<TopicalConversation>;

    private static telemetry: Telemetry;

    public static init(
        storage: Storage,
        options?: TopicInitOptions,
    ) {
        if (Topic.topicalConversationState)
            throw "you should only call Topic.init once.";

        Topic.topicalConversationState = new ConversationState<TopicalConversation>(storage, "github.com/billba/topical");

        if (options) {
            if (options.telemetry)
                Topic.telemetry = options.telemetry;
        }
    }

    private static topics: Record<string, Topicable> = {};

    protected static subtopics = [] as Topicable[];

    // it's really easy to forget the "static" on subtopics -- this helps avoid errors
    public set subtopics(subtopics: never) {
        throw "subtopics need to be set as a static";
    }

    protected static register() {

        for (const T of this.subtopics)
            (T as any).register();

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

    public get begun () {

        return this.topicInstance.begun;
    }

    public set begun (
        begun: boolean,
    ) {

        this.topicInstance.begun = begun;
    }

    public get children () {

        return this.topicInstance.children;
    }

    public set children (
        children: string[],
    ) {

        this.topicInstance.children = children;
    }

    private returnStatus = TopicReturnStatus.noReturn;
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
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
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
            begun: false,
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

    protected static loadTopic <Context extends TurnContext> (
        parentOrContext: Topic<any, any, any, any, Context> | Context,
        topicInstance: string | TopicInstance,
    ): Topic<any, any, any, any, Context> {

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

        topic.context = context;
        topic.parent = parent;
        topic.topicInstance = topicInstance;

        topic.text = context.activity.type === 'message' ? context.activity.text.trim() : undefined;
        topic.send = (activityOrText, speak, inputHint) => context.sendActivity(activityOrText, speak, inputHint);

        return topic;
    }

    protected loadTopic (
        instance: string | TopicInstance,
    ): Topic<any, any, any, any, Context> {

        return Topic.loadTopic(this, instance);
    }

    async begin (
        beginArgs?: Begin
    ): Promise<boolean> {
        // await this.sendTelemetry(context, newInstance, 'init.begin');

        this.begun = true;

        await this.onBegin(beginArgs);

        if (await this.returnedToParent())
            return false;

        // await this.sendTelemetry(context, newInstance, 'init.end');    

        return true;
    }

    async beginIfTriggered(): Promise<boolean> {
        const result = await this.trigger();
        return result
            ? this.begin(result.beginArgs)
            : false;
    }

    async createTopicInstanceAndBegin <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
    > (
        topicClass: T,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
    ): Promise<Topic<any, any, any, Constructor, Context> | undefined> {

        const topic = this.loadTopic(this.createTopicInstance(topicClass, constructorArgs));

        return await topic.begin(beginArgs)
            ? topic
            : undefined;
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

    public static async begin <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
        Context extends TurnContext = TurnContext
    > (
        this: T,
        context: Context,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
    ) {
        if (this === Topic as any)
            throw "You can only 'begin' a child of Topic.";

        if (!Topic.topicalConversationState)
            throw `You must call Topic.init before calling ${this.name}.do`;

        if (!Topic.topics[this.name])
            (this as any).register();

        const topicalConversation = await Topic.topicalConversationState.read(context) as Partial<TopicalConversation>;

        if (topicalConversation.rootTopicInstanceName)
            throw `You must only call ${this.name}.begin once.`;

        topicalConversation.topicInstances = {};
        topicalConversation.rootTopicInstanceName = (this as any).createTopicInstance(context, constructorArgs);

        const topic = Topic.loadTopic(context, topicalConversation.rootTopicInstanceName!);
        if (!await topic.begin(beginArgs))
            throw "Root topics shouldn't even returnToParent."

        // const instance = Topic.getInstanceFromName(context, topical.roottopicInstanceName);
        // const topic = Topic.load(context, instance);
        // await topic.sendTelemetry(context, instance, 'assignRootTopic');

        await Topic.topicalConversationState.write(context);
    }

    public static async onTurn <
        T extends Topicable<any, any, any, any, Context>,
        Context extends TurnContext = TurnContext
    > (
        this: T,
        context: Context,
    ) {
        if (this === Topic as any)
            throw "You can only `onTurn' a child of Topic.";

        const topical = await Topic.topicalConversationState.read(context) as TopicalConversation;

        if (!topical.rootTopicInstanceName)
            throw `You must call ${this.name}.begin before calling ${this.name}.onTurn.`;

        await Topic.loadTopic(context, topical.rootTopicInstanceName).onTurn();

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
    ) {
        if (!topicInstanceName)
            return false;

        const instance = Topic.getTopicInstanceFromName(this.context, topicInstanceName);

        if (!instance)
            return false;

        const topic = this.loadTopic(instance);

        if (!topic.begun)
            return false;

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
            throw `orphan ${this.topicInstanceName} attempted to returnToParent()`;

        Topic.deleteInstance(this.context, this.topicInstanceName);
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
    //         activity: context.activity as Activity,
    //         instance: {
    //             topicInstanceName: instance.topicInstanceName,
    //             topicName: this.name,
    //             children: this.listChildren(context, instance),
    //         },
    //     });
    // }

    public async clearChildren () {
        for (const child in this.children) {
            Topic.deleteInstance(this.context, child);
        }

        this.children = [];
    }

    public async removeChild (
        child: string,
    ) {
        Topic.deleteInstance(this.context, child);
        this.children = this.children.filter(_child => _child !== child);
    }

    public setChild (
        childtopicInstanceName: string | undefined,
    ) {
        this.clearChildren();
        if (childtopicInstanceName)
            this.children[0] = childtopicInstanceName;
    }

    async beginChild <
        T extends Topicable<Begin, any, any, Constructor, Context>,
        Begin,
        Constructor,
    > (
        topicClass: T,
        beginArgs?: Begin,
        constructorArgs?: Constructor,
    ) {
        const topic = await this.createTopicInstanceAndBegin(topicClass, beginArgs, constructorArgs);

        this.setChild(topic && topic.topicInstanceName);
    }

    public hasChildren () {
        return this.children.length !== 0;
    }

    public dispatchToChild () {
        return this.dispatchTo(this.children.length ? this.children[0] : undefined);
    }

    public async tryTriggers () {
        const results = (await Promise.all(this
            .children
            .map(child => this.loadTopic(child).trigger().then(result => ({
                child,
                result: result || { score: 0}
            })))
        ))
        .filter(i => i.result.score > 0)
        .sort((a, b) => b.result.score - a.result.score);

        if (results.length) {
            await this
                .loadTopic(results[0].child)
                .begin(results[0].result.beginArgs);

            return true;
        }

        return false;
    }

    // These four default methods are optionally overrideable by subclasses

    public async trigger (): Promise<TriggerResult<Begin> | void> {
    }

    public async onBegin (
        args?: Begin,
    ) {
    }

    public async onTurn () {
        if (await this.dispatchToChild())
            return;
    }

    public async onChildReturn(
        child: Topic<any, any, any, any, Context>,
    ) {
        this.clearChildren();
    }
}

